-- History tables are append-only during normal operation.
-- Backup restore drops these triggers, replaces rows, then recreates them.

CREATE TRIGGER components_no_delete
BEFORE DELETE ON components
BEGIN
  SELECT RAISE(ABORT, 'component history cannot be deleted');
END;

CREATE TRIGGER installations_no_delete
BEFORE DELETE ON installations
BEGIN
  SELECT RAISE(ABORT, 'installation history cannot be deleted');
END;

CREATE TRIGGER removals_no_delete
BEFORE DELETE ON removals
BEGIN
  SELECT RAISE(ABORT, 'removal history cannot be deleted');
END;

CREATE TRIGGER baselines_no_delete
BEFORE DELETE ON service_baselines
BEGIN
  SELECT RAISE(ABORT, 'service baselines cannot be deleted');
END;

CREATE TRIGGER stock_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock movements cannot be deleted');
END;

CREATE TRIGGER stock_movements_append_only
BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock movements are append-only');
END;

CREATE TRIGGER inspections_no_delete
BEFORE DELETE ON inspections
BEGIN
  SELECT RAISE(ABORT, 'inspection history cannot be deleted');
END;

CREATE TRIGGER audit_no_delete
BEFORE DELETE ON audit_records
BEGIN
  SELECT RAISE(ABORT, 'audit history cannot be deleted');
END;

CREATE TRIGGER transactions_committed_immutable
BEFORE UPDATE OF status ON maintenance_transactions
FOR EACH ROW
WHEN OLD.status = 'committed' AND NEW.status != 'committed'
BEGIN
  SELECT RAISE(ABORT, 'committed maintenance transactions are immutable');
END;

-- Studs cannot move from one sealed set to another.
CREATE TRIGGER components_kit_immutable
BEFORE UPDATE OF kit_id ON components
FOR EACH ROW
WHEN OLD.kit_id IS NOT NEW.kit_id
BEGIN
  SELECT RAISE(ABORT, 'component kit identity is immutable and studs cannot move between sets');
END;

CREATE TRIGGER components_match_kit
BEFORE INSERT ON components
FOR EACH ROW
WHEN NEW.kit_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'component part does not match the sealed set part')
  WHERE NEW.part_id IS NOT (SELECT part_id FROM kits WHERE id = NEW.kit_id);

  SELECT RAISE(ABORT, 'sealed set is full; refusing to add or mix studs into this set')
  WHERE (
    SELECT COUNT(*) FROM components WHERE kit_id = NEW.kit_id
  ) >= COALESCE((
    SELECT p.sealed_set_size
    FROM kits k
    JOIN parts p ON p.id = k.part_id
    WHERE k.id = NEW.kit_id
  ), 0);
END;

CREATE TRIGGER components_require_kit_for_sealed_parts
BEFORE INSERT ON components
FOR EACH ROW
WHEN NEW.kit_id IS NULL
  AND (SELECT sealed_set_size FROM parts WHERE id = NEW.part_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'sealed-set parts cannot be stored as loose untracked components');
END;

CREATE TRIGGER baselines_require_committed
BEFORE INSERT ON service_baselines
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'service baseline requires a committed maintenance transaction')
  WHERE (SELECT status FROM maintenance_transactions WHERE id = NEW.established_by_transaction_id) IS NOT 'committed';
END;

CREATE TRIGGER consume_requires_committed
BEFORE INSERT ON stock_movements
FOR EACH ROW
WHEN NEW.movement_type = 'consume'
BEGIN
  SELECT RAISE(ABORT, 'stock consume requires a committed maintenance transaction')
  WHERE NEW.maintenance_transaction_id IS NULL
    OR (SELECT status FROM maintenance_transactions WHERE id = NEW.maintenance_transaction_id) IS NOT 'committed';
END;

CREATE TRIGGER stock_no_silent_negative
BEFORE INSERT ON stock_movements
FOR EACH ROW
WHEN NEW.authorized_negative_exception = 0
BEGIN
  SELECT RAISE(ABORT, 'stock would go negative without an authorized exception')
  WHERE COALESCE((SELECT SUM(quantity_delta) FROM stock_movements WHERE part_id = NEW.part_id), 0) + NEW.quantity_delta < 0;
END;
