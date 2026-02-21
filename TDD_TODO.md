# GoldRisk AI — Backend Todo List

TDD v1.1 (wedge-scope, finansal-grade) referans alınarak sadece **backend** için hazırlanmış eksiksiz todo listesi.

---

## Faz 1 — Altyapı

### 1.1 Proje Kurulumu
- [x] Node.js + TypeScript projesi (`tsconfig.json`, `strict: true`)
- [x] PostgreSQL client (`pg` veya `node-postgres`)
- [x] `decimal.js` (veya `big.js`) bağımlılığı
- [x] ESLint + custom rule: `no-float-arithmetic`
- [x] `package.json` scripts: `dev`, `build`, `test`, `db:migrate`

### 1.2 Decimal & Precision
- [x] `decimal.js` entegrasyonu (tüm para/gram hesaplamaları için)
- [x] TypeScript branded type: `type Gram = Decimal`, `type TRYAmount = Decimal`, `type Percent = Decimal`
- [x] pg-numeric ↔ Decimal dönüşüm helper'ları

### 1.3 Lint & Risk Kontrolü
- [x] ESLint custom rule: float kullanımı yasak
- [x] Branded Decimal type zorunluluğu (CI'da kontrol)

---

## Faz 2 — Veritabanı Şeması

### 2.1 Enum Tipleri
- [x] `gold_type` (HAS, 22A, 18A, 14A, 9A, PLATINUM, NONE)
- [x] `user_role` (owner, manager, cashier, auditor)
- [x] `transaction_type` (sale, purchase, return, exchange, transfer, adjustment, scrap)
- [x] `ledger_entry_type` (debit, credit)
- [x] `ledger_reason` (purchase, sale, transfer_in, transfer_out, adjustment, fire, scrap, return)
- [x] `transaction_status`, `payment_method`, `audit_action`, `product_category`, vb.

### 2.2 Core Tablolar
- [x] **Branch**: id, name, code, address, phone, is_headquarter, is_active, timestamps
- [x] **User**: id, branch_id, email, password_hash, full_name, role, is_active, last_login_at, timestamps
- [x] **DailyPrice**: id, recorded_at, gold_type, buy_price, sell_price, source, recorded_by, is_backdated, original_price_id
  - CHECK: `sell_price >= buy_price`, `buy_price > 0`
- [x] **Product**: id, branch_id, sku, name, category, gold_type, gross_weight_g, net_weight_g, fire_rate_id, labor_cost_id, is_active, created_by, timestamps
  - UNIQUE(branch_id, sku)
- [x] **GoldItem**: id, product_id, branch_id, serial_no, barcode, actual_weight_g, purity_millesimal, status, acquisition_price_g, certificate_no, notes, created_by, timestamps
  - UNIQUE(serial_no), CHECK(purity_millesimal BETWEEN 0 AND 1000)
- [x] **FireRate**: id, name, rate_percent, gold_type, scope, valid_from, valid_until, created_by
- [x] **LaborCost**: id, branch_id, name, amount, rate_per_gram, currency, valid_from, valid_until, created_by
  - CHECK: `(amount IS NOT NULL OR rate_per_gram IS NOT NULL)`

### 2.3 İşlem & Ledger Tabloları
- [x] **Customer** (Transaction FK için)
- [x] **Transaction**: id, branch_id, type, gold_item_id, customer_id, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, status, parent_transaction_id, masak_reported, notes, created_by, created_at
  - UNIQUE(client_request_id, branch_id) → idempotency (trigger Faz 3’te)
- [x] **StockLedger**: id, branch_id, product_id, gold_item_id, entry_type, quantity_g, unit_price_g, transaction_id, reason, running_balance_g, created_at
  - transaction_id NOT NULL (orphan yasak)
- [x] **AuditLog**: id, user_id, branch_id, entity_type, entity_id, action, old_value, new_value, ip_address, user_agent, session_id, created_at
  - INSERT-only (RLS ile enforce — Faz 3)

### 2.4 Yardımcı Tablolar
- [x] **branch_price_override**: şube bazlı markup/markdown
- [x] **transfer_request**: şube arası transfer talepleri
- [x] **stock_snapshot**: branch_id, product_id, date, balance_g, balance_try (günlük cache)

### 2.5 Index Stratejisi
- [x] idx_ledger_balance (branch_id, product_id, created_at DESC) INCLUDE (entry_type, quantity_g)
- [x] idx_price_latest (gold_type, recorded_at DESC) WHERE is_backdated = false
- [x] idx_txn_branch_time, idx_golditem_branch_status, vb. (TDD’deki öneriler)

---

## Faz 3 — Veritabanı Güvenliği

### 3.1 Triggers
- [x] `validate_transaction_total`: total_amount = quantity_g * unit_price_g + labor_amount
- [x] `validate_daily_price`: sell_price >= buy_price
- [x] `check_negative_balance`: StockLedger insert sonrası bakiye >= 0 (veya alarm)
- [x] `audit_golditem_status_change`: GoldItem.status değişiminde AuditLog (AFTER UPDATE trigger)

### 3.2 Row-Level Security (RLS)
- [x] RLS enable: stock_ledger, transaction, product, gold_item, daily_price, audit_log
- [x] Policy: branch_id = current_setting('app.current_branch_id')::uuid
- [x] AuditLog: INSERT-only policy; UPDATE/DELETE yasak
- [x] Cross-branch: owner + HQ için exception policy

---

## Faz 4 — Auth & RBAC

### 4.1 Auth
- [x] JWT auth middleware
- [x] bcrypt password hash
- [x] JWT claims: user_id, branch_id, role
- [x] Login / Logout → AuditLog (ip_address, user_agent hash)

### 4.2 RBAC
- [x] owner: tüm işlemler, cross-branch okuma
- [x] manager: approval gerekli işlemler, backdated, adjustment
- [x] cashier: sadece bugün transaction, satış/alış
- [x] auditor: salt okuma, AuditLog erişimi

---

## Faz 5 — İş Mantığı Servisleri

### 5.1 DailyPrice Servisi
- [x] INSERT-only fiyat kaydı
- [x] En güncel fiyat: ORDER BY recorded_at DESC LIMIT 1
- [x] Price Lock: SELECT ... FOR UPDATE SKIP LOCKED → daily_price_id
- [x] Backdated flow: is_backdated=true, original_price_id

### 5.2 Transaction Servisi
- [x] **Sale**: price lock → GoldItem FOR UPDATE SKIP LOCKED → Transaction + StockLedger credit (atomik)
- [x] **Purchase**: Transaction + StockLedger debit (atomik)
- [ ] **Return**: parent_transaction_id zorunlu, quantity_g = gerçek tartım
- [ ] **Exchange**: bozdurma + yeni satış (veya tek transaction)
- [ ] **Adjustment**: manager onayı, ledger debit/credit
- [ ] **Scrap**: fire veya hurda
- [x] Idempotency: client_request_id kontrolü
- [x] MASAK: total_amount >= 20000 AND payment_method = 'cash' → flag

### 5.3 StockLedger Servisi
- [x] Transaction + Ledger aynı DB transaction
- [x] Debit/credit mantığı: bakiye = SUM(debit) - SUM(credit)
- [x] running_balance_g güncelleme (materialized cache)
- [x] Negatif bakiye CHECK / trigger (Faz 3)

### 5.4 Gram Edge-Cases
- [ ] A1: Tartım farkı → GoldItem.actual_weight_g esas; fark > eşik → adjustment + AuditLog
- [ ] A2: Manuel gram düzeltme → sadece owner/manager; adjustment Transaction zorunlu (direkt UPDATE yasak)
- [ ] A3: Sayım sonrası → StockReconciliation: inventory_gain / inventory_loss transaction

### 5.5 Fire Hesaplama
- [ ] B1: Üretim fire → input credit, output debit, fire debit (reason='fire')
- [ ] B2: Satış maliyet fire → fire_cost hesaplama, Transaction'a yazma
- [ ] B3: Fire stoktan düşüm → ledger credit (reason='fire')
- [ ] FireRate öncelik: Product.fire_rate_id → global aktif

### 5.6 İade / Bozdurma
- [ ] D1: İade gram farkı → parent'a bağlı iade + fark için adjustment
- [ ] D2: İade fiyat kuralı → branch settings (orijinal vs güncel)
- [ ] D3: labor_refund_amount → default: iade edilmez; manager override

### 5.7 Şube Transferi
- [ ] transfer_request oluşturma
- [ ] Source onay → credit (reason='transfer_out'), GoldItem.status='transferred'
- [ ] Target receive → debit (reason='transfer_in'), GoldItem.branch_id güncelleme
- [ ] Atomik: source credit + target debit tek DB transaction

---

## Faz 6 — Audit & Uyumluluk

### 6.1 AuditLog
- [ ] Service layer: Transaction create, DailyPrice insert, export, MASAK report
- [ ] GoldItem status change → DB trigger
- [ ] Auth middleware: login/logout
- [ ] KVKK: user_agent hash (SHA-256); müşteri PII yok, sadece customer_id

### 6.2 MASAK
- [ ] 20.000+ TL nakit işlem flag (masak_reported)
- [ ] MASAK rapor endpoint
- [ ] Index: idx_masak (masak_reported, total_amount) WHERE total_amount >= 20000

---

## Faz 7 — Reconciliation & Job’lar

### 7.1 Reconciliation
- [ ] ledger_balance = SUM(debit) - SUM(credit) per branch+product
- [ ] Snapshot vs ledger karşılaştırma
- [ ] Fark varsa: reconciliation_alert, manager onayı ile adjustment
- [ ] StockReconciliation batch: sayım_g vs ledger_g → inventory_gain/loss

### 7.2 Gece Job’ları
- [ ] Günlük stock_snapshot (00:00)
- [ ] Cross-branch reconciliation: transfer_out vs transfer_in zinciri
- [ ] Reconciliation report + alert

---

## Faz 8 — Risk Senaryoları (Kontrol Planı)

| # | Risk | Teknik Kontrol | Todo |
|---|------|----------------|------|
| 1 | Float kullanımı | ESLint + branded Decimal | ✅ Faz 1.3 |
| 2 | Yanlış gram hesabı | CHECK + trigger | ✅ Faz 3.1 |
| 3 | Çift işlem | Idempotency key + UNIQUE | ✅ Faz 5.2 |
| 4 | Backdated işlem | Cashier today-only, manager approval | ✅ Faz 4.2, 5.2 |
| 5 | Gram manipülasyonu | Adjustment transaction zorunlu | ✅ Faz 5.4 |
| 6 | Aynı item iki kez satış | FOR UPDATE SKIP LOCKED | ✅ Faz 5.2 |
| 7 | Yanlış fiyat girişi | ±%15 outlier alarm | ✅ Faz 5.1 |
| 8 | Backdated fiyat etkisi | Impact report + manuel düzeltme | ✅ Faz 5.1 |
| 9 | Stok kaçak | Serialized GoldItem + sayım vs ledger | ✅ Faz 7.1 |
| 10 | AuditLog silme | DB permission + break-glass | ✅ Faz 3.2 |

---

## Özet Sıralama (Önerilen)

1. **Faz 1** → Proje + Decimal + Lint  
2. **Faz 2** → Şema (enum, tablolar, index)  
3. **Faz 3** → Triggers + RLS  
4. **Faz 4** → Auth + RBAC  
5. **Faz 5.1–5.3** → DailyPrice, Transaction, StockLedger (core)  
6. **Faz 5.4–5.7** → Edge-cases (gram, fire, iade, transfer)  
7. **Faz 6** → AuditLog + MASAK  
8. **Faz 7** → Reconciliation + Job’lar  
