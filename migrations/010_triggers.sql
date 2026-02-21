-- GoldRisk AI - Triggers (Faz 3.1)
-- Veri tutarlılığı ve audit

-- 1) validate_transaction_total: total_amount = quantity_g * unit_price_g + labor_amount
CREATE OR REPLACE FUNCTION trg_validate_transaction_total()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM (NEW.quantity_g * NEW.unit_price_g + NEW.labor_amount) THEN
    RAISE EXCEPTION 'Transaction total_amount must equal quantity_g * unit_price_g + labor_amount. Expected %, got %',
      (NEW.quantity_g * NEW.unit_price_g + NEW.labor_amount)::NUMERIC(20,4),
      NEW.total_amount;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_transaction_total
  BEFORE INSERT OR UPDATE ON "transaction"
  FOR EACH ROW
  EXECUTE FUNCTION trg_validate_transaction_total();

-- 2) validate_daily_price: sell_price >= buy_price (belt-and-suspenders with CHECK)
CREATE OR REPLACE FUNCTION trg_validate_daily_price()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sell_price < NEW.buy_price THEN
    RAISE EXCEPTION 'DailyPrice: sell_price (%) must be >= buy_price (%)', NEW.sell_price, NEW.buy_price;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_daily_price
  BEFORE INSERT OR UPDATE ON daily_price
  FOR EACH ROW
  EXECUTE FUNCTION trg_validate_daily_price();

-- 3) check_negative_balance: StockLedger insert sonrası bakiye >= 0
CREATE OR REPLACE FUNCTION trg_check_negative_balance()
RETURNS TRIGGER AS $$
DECLARE
  balance NUMERIC(18,6);
BEGIN
  SELECT COALESCE(SUM(
    CASE WHEN entry_type = 'debit' THEN quantity_g ELSE -quantity_g END
  ), 0) INTO balance
  FROM stock_ledger
  WHERE branch_id = NEW.branch_id AND product_id = NEW.product_id;

  IF balance < 0 THEN
    RAISE EXCEPTION 'StockLedger: negatif bakiye tespit edildi. branch_id=%, product_id=%, balance=%',
      NEW.branch_id, NEW.product_id, balance;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_negative_balance
  AFTER INSERT OR UPDATE ON stock_ledger
  FOR EACH ROW
  EXECUTE FUNCTION trg_check_negative_balance();

-- 4) audit_golditem_status_change: GoldItem.status değişiminde AuditLog
-- Uygulama UPDATE öncesi SET app.current_user_id = '...' yapmalı
CREATE OR REPLACE FUNCTION trg_audit_golditem_status_change()
RETURNS TRIGGER AS $$
DECLARE
  audit_user_id UUID;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    audit_user_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    IF audit_user_id IS NULL THEN
      audit_user_id := NEW.created_by;
    END IF;
    INSERT INTO audit_log (user_id, branch_id, entity_type, entity_id, action, old_value, new_value)
    VALUES (
      audit_user_id,
      NEW.branch_id,
      'gold_item',
      NEW.id,
      'update',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_golditem_status_change
  AFTER UPDATE ON gold_item
  FOR EACH ROW
  EXECUTE FUNCTION trg_audit_golditem_status_change();
