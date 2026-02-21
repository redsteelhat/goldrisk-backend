-- GoldRisk AI - Enum Tipleri (Faz 2.1)
-- TDD: PostgreSQL ENUM types

CREATE TYPE gold_type AS ENUM ('HAS', '22A', '18A', '14A', '9A', 'PLATINUM', 'NONE');

CREATE TYPE user_role AS ENUM ('owner', 'manager', 'cashier', 'auditor');

CREATE TYPE transaction_type AS ENUM ('sale', 'purchase', 'return', 'exchange', 'transfer', 'adjustment', 'scrap');

CREATE TYPE ledger_entry_type AS ENUM ('debit', 'credit');

CREATE TYPE ledger_reason AS ENUM ('purchase', 'sale', 'transfer_in', 'transfer_out', 'adjustment', 'fire', 'scrap', 'return');

CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'cancelled', 'reversed');

CREATE TYPE payment_method AS ENUM ('cash', 'pos', 'transfer', 'gold_exchange', 'mixed');

CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'export', 'masak_report');

CREATE TYPE product_category AS ENUM ('ring', 'necklace', 'bracelet', 'earring', 'coin', 'bar', 'other');

CREATE TYPE fire_rate_scope AS ENUM ('global', 'product');

CREATE TYPE gold_item_status AS ENUM ('in_stock', 'sold', 'transferred', 'returned', 'scrapped');

CREATE TYPE labor_currency AS ENUM ('TRY', 'USD', 'EUR');
