-- GoldRisk AI - Product & GoldItem (Faz 2.2)
-- Product: ürün şablonu (katalog)
-- GoldItem: fiziksel item (seri takip)

CREATE TABLE product (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branch(id),
  sku VARCHAR(60) NOT NULL,
  name VARCHAR(200) NOT NULL,
  category product_category NOT NULL,
  gold_type gold_type NOT NULL,
  gross_weight_g NUMERIC(18,6) NOT NULL CHECK (gross_weight_g > 0),
  net_weight_g NUMERIC(18,6),
  has_certificate BOOLEAN NOT NULL DEFAULT false,
  certificate_no VARCHAR(80),
  fire_rate_id UUID REFERENCES fire_rate(id),
  labor_cost_id UUID REFERENCES labor_cost(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES "user"(id),
  UNIQUE (branch_id, sku)
);

CREATE INDEX idx_product_branch_sku ON product (branch_id, sku);
CREATE INDEX idx_product_category ON product (category);
CREATE INDEX idx_product_gold_type ON product (gold_type);

CREATE TABLE gold_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product(id),
  branch_id UUID NOT NULL REFERENCES branch(id),
  serial_no VARCHAR(80) NOT NULL UNIQUE,
  barcode VARCHAR(80) UNIQUE,
  actual_weight_g NUMERIC(18,6) NOT NULL CHECK (actual_weight_g > 0),
  purity_millesimal NUMERIC(6,2) NOT NULL CHECK (purity_millesimal >= 0 AND purity_millesimal <= 1000),
  status gold_item_status NOT NULL DEFAULT 'in_stock',
  acquisition_price_g NUMERIC(20,4) NOT NULL,
  certificate_no VARCHAR(80),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES "user"(id)
);

CREATE INDEX idx_golditem_branch_status ON gold_item (branch_id, status);
CREATE INDEX idx_golditem_serial ON gold_item (serial_no);
CREATE INDEX idx_golditem_product ON gold_item (product_id);
