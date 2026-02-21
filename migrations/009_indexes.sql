-- GoldRisk AI - Ek Index Stratejisi (Faz 2.5)
-- idx_price_latest: güncel fiyat sorgusu için partial index

CREATE INDEX idx_price_latest
  ON daily_price (gold_type, recorded_at DESC)
  WHERE is_backdated = false;
