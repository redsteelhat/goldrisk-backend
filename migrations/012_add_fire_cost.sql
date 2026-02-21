-- GoldRisk AI - Transaction.fire_cost (B2: Satış maliyet fire)
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS fire_cost NUMERIC(20,4);
