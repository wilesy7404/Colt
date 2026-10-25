import type { DatabaseSync } from 'node:sqlite';
import { audit } from './audit.ts';
import type { User } from './auth.ts';
import { assertAdmin } from './auth.ts';
import { many, newId, nowIso, one, rethrowSqlite, withTransaction } from './db.ts';
import { AppError } from './errors.ts';

export type PartRow = {
  id: string;
  catalog_number: string;
  description: string;
  unit_of_measure: string;
  category: string;
  reorder_threshold: number | null;
  minimum_quantity: number | null;
  desired_quantity: number | null;
  supplier_name: string;
  purchasing_notes: string;
  kit_kind: 'none' | 'sealed_stud_set';
  sealed_set_size: number | null;
  created_at: string;
  updated_at: string;
};

export type KitRow = {
  id: string;
  human_label: string;
  part_id: string;
  status: 'sealed' | 'opened' | 'consumed';
  location: string;
  notes: string;
  opened_at: string | null;
  opened_by_user_id: string | null;
  consumed_at: string | null;
  consumed_by_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export function onHand(db: DatabaseSync, partId: string): number {
  const row = one<{ qty: number }>(
    db,
    'SELECT COALESCE(SUM(quantity_delta), 0) AS qty FROM stock_movements WHERE part_id = ?',
    [partId],
  );
  return row?.qty ?? 0;
}

export function sealedCount(db: DatabaseSync, partId: string): number {
  const row = one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM kits WHERE part_id = ? AND status = 'sealed'`,
    [partId],
  );
  return row?.c ?? 0;
}

export function stockSignal(part: PartRow, quantity: number): 'unknown' | 'at_or_below_threshold' | 'above_threshold' {
  if (part.reorder_threshold === null || part.reorder_threshold === undefined) return 'unknown';
  return quantity <= part.reorder_threshold ? 'at_or_below_threshold' : 'above_threshold';
}

export function mapPart(db: DatabaseSync, part: PartRow) {
  const quantity = part.kit_kind === 'sealed_stud_set' ? sealedCount(db, part.id) : onHand(db, part.id);
  return {
    id: part.id,
    catalogNumber: part.catalog_number,
    description: part.description,
    unitOfMeasure: part.unit_of_measure,
    category: part.category,
    reorderThreshold: part.reorder_threshold,
    minimumQuantity: part.minimum_quantity,
    desiredQuantity: part.desired_quantity,
    supplierName: part.supplier_name,
    purchasingNotes: part.purchasing_notes,
    kitKind: part.kit_kind,
    sealedSetSize: part.sealed_set_size,
    quantityOnHand: onHand(db, part.id),
    sealedSetCount: part.kit_kind === 'sealed_stud_set' ? sealedCount(db, part.id) : null,
    reorderStatus: stockSignal(part, quantity),
    createdAt: part.created_at,
    updatedAt: part.updated_at,
  };
}

export function listParts(db: DatabaseSync) {
  return many<PartRow>(db, 'SELECT * FROM parts ORDER BY catalog_number').map((part) => mapPart(db, part));
}

export function getPart(db: DatabaseSync, id: string): PartRow {
  const part = one<PartRow>(db, 'SELECT * FROM parts WHERE id = ?', [id]);
  if (!part) throw new AppError(404, 'Part was not found.', 'not_found');
  return part;
}

export function createPart(
  db: DatabaseSync,
  actor: User,
  input: {
    catalogNumber: string;
    description: string;
    unitOfMeasure: string;
    category: string;
    reorderThreshold: number | null;
    minimumQuantity: number | null;
    desiredQuantity: number | null;
    supplierName: string;
    purchasingNotes: string;
    kitKind: 'none' | 'sealed_stud_set';
  },
) {
  assertAdmin(actor, 'Only an administrator can create parts.');
  if (input.kitKind !== 'none' && input.kitKind !== 'sealed_stud_set') {
    throw new AppError(400, 'kitKind must be none or sealed_stud_set.', 'validation');
  }
  const id = newId();
  const createdAt = nowIso();
  const sealedSetSize = input.kitKind === 'sealed_stud_set' ? 5 : null;
  try {
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO parts (
          id, catalog_number, description, unit_of_measure, category, reorder_threshold, minimum_quantity,
          desired_quantity, supplier_name, purchasing_notes, kit_kind, sealed_set_size, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.catalogNumber,
        input.description,
        input.unitOfMeasure,
        input.category,
        input.reorderThreshold,
        input.minimumQuantity,
        input.desiredQuantity,
        input.supplierName,
        input.purchasingNotes,
        input.kitKind,
        sealedSetSize,
        createdAt,
        createdAt,
      );
      audit(db, {
        actorUserId: actor.id,
        action: 'part_created',
        entityType: 'part',
        entityId: id,
        after: mapPart(db, getPart(db, id)),
      });
    });
  } catch (error) {
    rethrowSqlite(error);
  }
  return mapPart(db, getPart(db, id));
}

export function listKits(db: DatabaseSync) {
  const kits = many<KitRow>(db, 'SELECT * FROM kits ORDER BY created_at');
  return kits.map((kit) => mapKit(db, kit));
}

export function mapKit(db: DatabaseSync, kit: KitRow) {
  const components = many<{ id: string; status: string; part_id: string }>(
    db,
    'SELECT id, status, part_id FROM components WHERE kit_id = ? ORDER BY created_at, id',
    [kit.id],
  );
  return {
    id: kit.id,
    humanLabel: kit.human_label,
    partId: kit.part_id,
    status: kit.status,
    location: kit.location,
    notes: kit.notes,
    openedAt: kit.opened_at,
    openedByUserId: kit.opened_by_user_id,
    consumedAt: kit.consumed_at,
    consumedByTransactionId: kit.consumed_by_transaction_id,
    componentIds: components.map((component) => component.id),
    components: components.map((component) => ({
      id: component.id,
      status: component.status,
      partId: component.part_id,
    })),
    createdAt: kit.created_at,
    updatedAt: kit.updated_at,
  };
}

export function getKit(db: DatabaseSync, id: string): KitRow {
  const kit = one<KitRow>(db, 'SELECT * FROM kits WHERE id = ?', [id]);
  if (!kit) throw new AppError(404, 'Kit was not found.', 'not_found');
  return kit;
}

export function createKit(
  db: DatabaseSync,
  actor: User,
  input: { partId: string; humanLabel: string; location: string; notes: string },
) {
  assertAdmin(actor, 'Only an administrator can receive sealed sets.');
  const part = getPart(db, input.partId);
  if (part.kit_kind !== 'sealed_stud_set' || part.sealed_set_size !== 5) {
    throw new AppError(400, 'Only sealed wheel-stud sets of five can be received as kits.', 'validation');
  }
  const kitId = newId();
  const movementId = newId();
  const createdAt = nowIso();
  try {
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO kits (
          id, human_label, part_id, status, location, notes, opened_at, opened_by_user_id,
          consumed_at, consumed_by_transaction_id, created_at, updated_at
        ) VALUES (?, ?, ?, 'sealed', ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      ).run(kitId, input.humanLabel, part.id, input.location, input.notes, createdAt, createdAt);
      db.prepare(
        `INSERT INTO stock_movements (
          id, part_id, kit_id, movement_type, quantity_delta, authorized_negative_exception, exception_reason,
          maintenance_transaction_id, notes, actor_user_id, created_at
        ) VALUES (?, ?, ?, 'receive', 1, 0, NULL, NULL, ?, ?, ?)`,
      ).run(movementId, part.id, kitId, 'Received sealed set', actor.id, createdAt);
      audit(db, {
        actorUserId: actor.id,
        action: 'kit_received',
        entityType: 'kit',
        entityId: kitId,
        after: { humanLabel: input.humanLabel, partId: part.id, status: 'sealed' },
      });
    });
  } catch (error) {
    rethrowSqlite(error);
  }
  return mapKit(db, getKit(db, kitId));
}

export function openKit(db: DatabaseSync, actor: User, kitId: string) {
  const kit = getKit(db, kitId);
  const part = getPart(db, kit.part_id);
  if (kit.status !== 'sealed') throw new AppError(409, 'Only a sealed set can be opened.', 'conflict');
  if (part.sealed_set_size !== 5) throw new AppError(409, 'This part is not a sealed set of five.', 'conflict');
  const openedAt = nowIso();
  const componentIds: string[] = [];
  try {
    withTransaction(db, () => {
      for (let index = 1; index <= 5; index += 1) {
        const componentId = newId();
        componentIds.push(componentId);
        db.prepare(
          `INSERT INTO components (id, part_id, kit_id, status, physical_mark, notes, created_at, updated_at)
           VALUES (?, ?, ?, 'in_stock', '', ?, ?, ?)`,
        ).run(componentId, part.id, kit.id, `Stud ${index} of sealed set ${kit.human_label}`, openedAt, openedAt);
      }
      db.prepare(
        `UPDATE kits SET status = 'opened', opened_at = ?, opened_by_user_id = ?, updated_at = ? WHERE id = ?`,
      ).run(openedAt, actor.id, openedAt, kit.id);
      db.prepare(
        `INSERT INTO stock_movements (
          id, part_id, kit_id, movement_type, quantity_delta, authorized_negative_exception, exception_reason,
          maintenance_transaction_id, notes, actor_user_id, created_at
        ) VALUES (?, ?, ?, 'open_kit', 0, 0, NULL, NULL, ?, ?, ?)`,
      ).run(newId(), part.id, kit.id, 'Opened sealed set. Stock quantity is unchanged until a committed transaction consumes it.', actor.id, openedAt);
      audit(db, {
        actorUserId: actor.id,
        action: 'kit_opened',
        entityType: 'kit',
        entityId: kit.id,
        before: { status: 'sealed' },
        after: { status: 'opened', componentIds },
      });
    });
  } catch (error) {
    rethrowSqlite(error);
  }
  return mapKit(db, getKit(db, kit.id));
}

export function recordStockMovement(
  db: DatabaseSync,
  actor: User,
  input: {
    partId: string;
    movementType: 'receive' | 'adjust';
    quantityDelta: number;
    notes: string;
    authorizedNegativeException: boolean;
    exceptionReason: string;
  },
) {
  assertAdmin(actor, 'Only an administrator can adjust stock.');
  if (input.movementType !== 'receive' && input.movementType !== 'adjust') {
    throw new AppError(400, 'This endpoint accepts receive or adjust movements. Consumption happens only inside a committed maintenance transaction.', 'validation');
  }
  const part = getPart(db, input.partId);
  if (part.kit_kind === 'sealed_stud_set') {
    throw new AppError(400, 'Sealed stud sets are received as kits. Their quantity cannot be adjusted as loose stock.', 'validation');
  }
  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    throw new AppError(400, 'quantityDelta must be a non-zero number.', 'validation');
  }
  if (input.authorizedNegativeException && !input.exceptionReason.trim()) {
    throw new AppError(400, 'An authorized negative exception needs a reason.', 'validation');
  }
  if (input.authorizedNegativeException && actor.role !== 'administrator') {
    throw new AppError(403, 'Only an administrator can authorize negative stock.', 'forbidden');
  }
  const id = newId();
  const createdAt = nowIso();
  try {
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO stock_movements (
          id, part_id, kit_id, movement_type, quantity_delta, authorized_negative_exception, exception_reason,
          maintenance_transaction_id, notes, actor_user_id, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      ).run(
        id,
        part.id,
        input.movementType,
        input.quantityDelta,
        input.authorizedNegativeException ? 1 : 0,
        input.authorizedNegativeException ? input.exceptionReason.trim() : null,
        input.notes,
        actor.id,
        createdAt,
      );
      audit(db, {
        actorUserId: actor.id,
        action: 'stock_movement',
        entityType: 'stock_movement',
        entityId: id,
        after: { partId: part.id, movementType: input.movementType, quantityDelta: input.quantityDelta },
      });
    });
  } catch (error) {
    rethrowSqlite(error);
  }
  return one(db, 'SELECT * FROM stock_movements WHERE id = ?', [id]);
}

export function listStockMovements(db: DatabaseSync) {
  return many(db, 'SELECT * FROM stock_movements ORDER BY created_at, id');
}

export function listComponents(db: DatabaseSync) {
  return many(db, 'SELECT * FROM components ORDER BY created_at, id');
}
