-- GoldRisk AI - Transaction, StockLedger, AuditLog (Faz 2.3)
-- Immutable: Transaction, StockLedger - INSERT-only
-- AuditLog: INSERT-only, RLS ile korunacak

CREATE TABLE "transaction" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branch(id),
  type transaction_type NOT NULL,
  gold_item_id UUID REFERENCES gold_item(id),
  customer_id UUID REFERENCES customer(id),
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  unit_price_g NUMERIC(20,4) NOT NULL,
  labor_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(20,4) NOT NULL CHECK (total_amount > 0),
  daily_price_id UUID NOT NULL REFERENCES daily_price(id),
  payment_method payment_method NOT NULL,
  status transaction_status NOT NULL DEFAULT 'completed',
  parent_transaction_id UUID REFERENCES "transaction"(id),
  client_request_id UUID,
  masak_reported BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_txn_idempotency ON "transaction" (client_request_id, branch_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX idx_txn_branch_time ON "transaction" (branch_id, created_at DESC);
CREATE INDEX idx_txn_type ON "transaction" (type);
CREATE INDEX idx_txn_gold_item ON "transaction" (gold_item_id);
CREATE INDEX idx_txn_parent ON "transaction" (parent_transaction_id) WHERE parent_transaction_id IS NOT NULL;
CREATE INDEX idx_txn_masak ON "transaction" (masak_reported, total_amount) WHERE total_amount >= 20000;

CREATE TABLE stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branch(id),
  product_id UUID NOT NULL REFERENCES product(id),
  gold_item_id UUID REFERENCES gold_item(id),
  entry_type ledger_entry_type NOT NULL,
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  unit_price_g NUMERIC(20,4) NOT NULL,
  transaction_id UUID NOT NULL REFERENCES "transaction"(id),
  reason ledger_reason NOT NULL,
  running_balance_g NUMERIC(18,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_balance ON stock_ledger (branch_id, product_id, created_at DESC)
  INCLUDE (entry_type, quantity_g);
CREATE INDEX idx_ledger_transaction ON stock_ledger (transaction_id);
CREATE INDEX idx_ledger_gold_item ON stock_ledger (gold_item_id);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id),
  branch_id UUID NOT NULL REFERENCES branch(id),
  entity_type VARCHAR(60) NOT NULL,
  entity_id UUID NOT NULL,
  action audit_action NOT NULL,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log (action);
CREATE INDEX idx_audit_branch ON audit_log (branch_id, created_at DESC);
