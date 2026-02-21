-- GoldRisk AI - DailyPrice (Faz 2.2)
-- Immutable log: INSERT-only, fiyat zaman serisi

CREATE TABLE daily_price (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL,
  gold_type gold_type NOT NULL,
  buy_price NUMERIC(20,4) NOT NULL CHECK (buy_price > 0),
  sell_price NUMERIC(20,4) NOT NULL CHECK (sell_price > 0),
  source VARCHAR(80) NOT NULL,
  recorded_by UUID REFERENCES "user"(id),
  is_backdated BOOLEAN NOT NULL DEFAULT false,
  original_price_id UUID REFERENCES daily_price(id),
  CONSTRAINT chk_sell_gte_buy CHECK (sell_price >= buy_price)
);

CREATE INDEX idx_dailyprice_type_time ON daily_price (gold_type, recorded_at DESC);
CREATE INDEX idx_dailyprice_backdated ON daily_price (is_backdated) WHERE is_backdated = true;
