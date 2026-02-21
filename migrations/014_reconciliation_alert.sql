-- GoldRisk AI - Reconciliation Alert (Faz 7)
-- Fark varsa: manager onayı ile adjustment

CREATE TABLE reconciliation_alert (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branch(id),
  product_id UUID NOT NULL REFERENCES product(id),
  snapshot_date DATE NOT NULL,
  ledger_balance_g NUMERIC(18,6) NOT NULL,
  snapshot_balance_g NUMERIC(18,6) NOT NULL,
  diff_g NUMERIC(18,6) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'resolved')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by UUID REFERENCES "user"(id),
  resolved_at TIMESTAMPTZ,
  adjustment_transaction_id UUID REFERENCES "transaction"(id)
);

CREATE INDEX idx_reconciliation_alert_branch_status ON reconciliation_alert (branch_id, status);
CREATE INDEX idx_reconciliation_alert_date ON reconciliation_alert (snapshot_date);
