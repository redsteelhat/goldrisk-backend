-- GoldRisk AI - FireRate & LaborCost (Faz 2.2)
-- FireRate: fire oranı, ürün veya global
-- LaborCost: işçilik maliyeti, branch veya global

CREATE TABLE fire_rate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  rate_percent NUMERIC(8,4) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  gold_type gold_type,
  scope fire_rate_scope NOT NULL DEFAULT 'global',
  valid_from DATE NOT NULL,
  valid_until DATE,
  created_by UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_firerate_scope_type ON fire_rate (scope, gold_type);
CREATE INDEX idx_firerate_valid ON fire_rate (valid_from, valid_until);

CREATE TABLE labor_cost (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branch(id),
  name VARCHAR(80) NOT NULL,
  amount NUMERIC(20,4),
  rate_per_gram NUMERIC(20,4),
  currency labor_currency NOT NULL DEFAULT 'TRY',
  valid_from DATE NOT NULL,
  valid_until DATE,
  created_by UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_labor_amount_or_rate CHECK (amount IS NOT NULL OR rate_per_gram IS NOT NULL)
);

CREATE INDEX idx_laborcost_branch ON labor_cost (branch_id);
CREATE INDEX idx_laborcost_valid ON labor_cost (valid_from, valid_until);
