-- GoldRisk AI - Customer (Faz 2.3)
-- Transaction FK için müşteri tablosu
-- KVKK: PII minimal tutulur

CREATE TABLE customer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branch(id),
  full_name VARCHAR(120),
  phone VARCHAR(20),
  tc_no_hash VARCHAR(64),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_branch ON customer (branch_id);
