-- GoldRisk AI - Row-Level Security (Faz 3.2)
-- branch_id izolasyonu; app.current_branch_id session variable gerekli

-- Helper: mevcut branch erişim kontrolü
CREATE OR REPLACE FUNCTION rls_branch_check(table_branch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_branch UUID;
  user_role TEXT;
  is_hq BOOLEAN;
BEGIN
  current_branch := NULLIF(current_setting('app.current_branch_id', true), '')::uuid;
  user_role := NULLIF(current_setting('app.role', true), '');
  is_hq := current_setting('app.is_hq', true) = 'true';

  -- Cross-branch: owner veya (HQ + manager/auditor)
  IF user_role = 'owner' THEN
    RETURN true;
  END IF;
  IF is_hq AND user_role IN ('manager', 'auditor') THEN
    RETURN true;
  END IF;

  -- Normal: branch eşleşmesi
  RETURN table_branch_id = current_branch;
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS etkinleştir
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- daily_price: branch_id yok, recorded_by var. TDD'de daily_price branch'a bağlı değil.
-- Kontrol: daily_price tablosunda branch_id var mı? Migration 003'e baktım - yok.
-- O halde daily_price için farklı policy: tüm kullanıcılar okuyabilir, sadece owner/manager yazabilir gibi.
-- TDD "daily_price" RLS listesinde. daily_price'da branch_id yok - merkezi fiyat. O zaman:
-- SELECT: herkes (fiyat herkese açık)
-- INSERT: role in (owner, manager) - fiyat girişi
-- UPDATE/DELETE: yok (immutable)

-- stock_ledger: branch_id var
CREATE POLICY rls_stock_ledger ON stock_ledger
  FOR ALL
  USING (rls_branch_check(branch_id))
  WITH CHECK (rls_branch_check(branch_id));

-- transaction
CREATE POLICY rls_transaction ON "transaction"
  FOR ALL
  USING (rls_branch_check(branch_id))
  WITH CHECK (rls_branch_check(branch_id));

-- product
CREATE POLICY rls_product ON product
  FOR ALL
  USING (rls_branch_check(branch_id))
  WITH CHECK (rls_branch_check(branch_id));

-- gold_item
CREATE POLICY rls_gold_item ON gold_item
  FOR ALL
  USING (rls_branch_check(branch_id))
  WITH CHECK (rls_branch_check(branch_id));

-- daily_price: branch_id yok, merkezi tablo. Tüm branch'lar okur.
-- SELECT: herkes, INSERT: role owner/manager (session'dan)
CREATE POLICY rls_daily_price_select ON daily_price FOR SELECT USING (true);
CREATE POLICY rls_daily_price_insert ON daily_price FOR INSERT
  WITH CHECK (
    current_setting('app.role', true) IN ('owner', 'manager')
  );
-- UPDATE, DELETE: policy yok = izin yok (immutable)

-- audit_log: INSERT-only policy; UPDATE/DELETE yasak
CREATE POLICY rls_audit_log_select ON audit_log
  FOR SELECT USING (rls_branch_check(branch_id));
CREATE POLICY rls_audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (rls_branch_check(branch_id));
-- UPDATE, DELETE: policy yok = immutable
