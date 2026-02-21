-- GoldRisk AI - Yardımcı Tablolar (Faz 2.4)
-- branch_price_override: şube bazlı markup/markdown
-- transfer_request: şube arası transfer talepleri
-- stock_snapshot: günlük bakiye cache

CREATE TABLE branch_price_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branch(id),
  product_id UUID REFERENCES product(id),
  gold_type gold_type,
  override_rate NUMERIC(8,4) NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE,
  created_by UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_branch_price_override_branch ON branch_price_override (branch_id);

CREATE TABLE transfer_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_branch_id UUID NOT NULL REFERENCES branch(id),
  target_branch_id UUID NOT NULL REFERENCES branch(id),
  gold_item_id UUID REFERENCES gold_item(id),
  product_id UUID REFERENCES product(id),
  quantity_g NUMERIC(18,6) NOT NULL CHECK (quantity_g > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ
);

CREATE INDEX idx_transfer_request_source ON transfer_request (source_branch_id);
CREATE INDEX idx_transfer_request_target ON transfer_request (target_branch_id);

CREATE TABLE stock_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branch(id),
  product_id UUID NOT NULL REFERENCES product(id),
  snapshot_date DATE NOT NULL,
  balance_g NUMERIC(18,6) NOT NULL,
  balance_try NUMERIC(20,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, product_id, snapshot_date)
);

CREATE INDEX idx_stock_snapshot_branch_date ON stock_snapshot (branch_id, snapshot_date);
