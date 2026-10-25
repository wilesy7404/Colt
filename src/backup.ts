import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { audit } from './audit.ts';
import { SCHEMA_VERSION, createTriggers, dropTriggers, many, one, withTransaction } from './db.ts';
import { AppError } from './errors.ts';

export const BACKUP_TABLES = [
  'schema_meta',
  'vehicles',
  'users',
  'auth_sessions',
  'parts',
  'events',
  'maintenance_rules',
  'maintenance_transactions',
  'kits',
  'stock_movements',
  'components',
  'installations',
  'removals',
  'sessions',
  'inspections',
  'service_baselines',
  'defects',
  'audit_records',
] as const;

const INSERT_ORDER: (typeof BACKUP_TABLES)[number][] = [
  'vehicles',
  'users',
  'parts',
  'events',
  'maintenance_rules',
  'maintenance_transactions',
  'kits',
  'auth_sessions',
  'stock_movements',
  'components',
  'sessions',
  'installations',
  'removals',
  'inspections',
  'service_baselines',
  'defects',
  'audit_records',
  'schema_meta',
];

export type Snapshot = {
  format: 'race-team-maintenance-backup';
  schemaVersion: string;
  exportedAt: string;
  checksum: string;
  tables: Record<string, Record<string, unknown>[]>;
};

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, inner]) => [key, sortValue(inner)]);
    return Object.fromEntries(entries);
  }
  return value;
}

export function checksumTables(tables: Snapshot['tables']): string {
  return createHash('sha256').update(JSON.stringify(sortValue(tables))).digest('hex');
}

function assertTableName(name: string): void {
  if (!BACKUP_TABLES.includes(name as (typeof BACKUP_TABLES)[number])) {
    throw new AppError(500, `Unexpected table ${name}.`, 'backup');
  }
}

export function exportSnapshot(db: DatabaseSync): Snapshot {
  const tables: Snapshot['tables'] = {};
  for (const name of BACKUP_TABLES) {
    assertTableName(name);
    tables[name] = many<Record<string, unknown>>(db, `SELECT * FROM ${name}`);
  }
  return {
    format: 'race-team-maintenance-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    checksum: checksumTables(tables),
    tables,
  };
}

export function restoreSnapshot(
  db: DatabaseSync,
  snapshot: Snapshot,
  actor: { actorUserId: string | null; note: string },
): { restoredCounts: Record<string, number> } {
  validateSnapshot(snapshot);
  const counts: Record<string, number> = {};
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    withTransaction(db, () => {
      dropTriggers(db);
      for (const name of [...INSERT_ORDER].reverse()) {
        assertTableName(name);
        db.exec(`DELETE FROM ${name}`);
      }
      for (const name of INSERT_ORDER) {
        const rows = snapshot.tables[name] ?? [];
        counts[name] = rows.length;
        for (const row of rows) insertRow(db, name, row);
      }
      createTriggers(db);
      const actorPresent = actor.actorUserId
        ? one(db, 'SELECT id FROM users WHERE id = ?', [actor.actorUserId])
        : undefined;
      audit(db, {
        actorUserId: actorPresent ? actor.actorUserId : null,
        action: 'backup_restored',
        entityType: 'database',
        entityId: 'schema',
        after: {
          schemaVersion: snapshot.schemaVersion,
          note: actor.note,
          counts,
          restoringActorId: actor.actorUserId,
        },
      });
      assertIntegrity(db);
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  return { restoredCounts: counts };
}

export function validateSnapshot(snapshot: Snapshot): void {
  if (!snapshot || snapshot.format !== 'race-team-maintenance-backup') {
    throw new AppError(400, 'Backup format was not recognized.', 'backup');
  }
  if (snapshot.schemaVersion !== SCHEMA_VERSION) {
    throw new AppError(400, `Backup schema ${snapshot.schemaVersion} does not match schema ${SCHEMA_VERSION}.`, 'backup');
  }
  if (!snapshot.tables || typeof snapshot.tables !== 'object') {
    throw new AppError(400, 'Backup is missing tables.', 'backup');
  }
  for (const name of BACKUP_TABLES) {
    if (!Array.isArray(snapshot.tables[name])) {
      throw new AppError(400, `Backup is missing table ${name}.`, 'backup');
    }
  }
  const actual = checksumTables(snapshot.tables);
  if (actual !== snapshot.checksum) {
    throw new AppError(400, 'Backup checksum did not match. Restore was not applied.', 'backup_checksum');
  }
}

function insertRow(db: DatabaseSync, table: string, row: Record<string, unknown>): void {
  assertTableName(table);
  const keys = Object.keys(row);
  if (keys.length === 0) return;
  const columns = keys.map((key) => `"${key.replaceAll('"', '')}"`).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`).run(...keys.map((key) => row[key]));
}

export function assertIntegrity(db: DatabaseSync): void {
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeys.length > 0) {
    throw new AppError(400, 'Restore failed foreign-key checks and was rolled back.', 'backup_integrity');
  }
  const negative = many<{ part_id: string }>(
    db,
    `SELECT part_id
     FROM stock_movements
     GROUP BY part_id
     HAVING SUM(quantity_delta) < 0 AND SUM(authorized_negative_exception) = 0`,
  );
  if (negative.length > 0) {
    throw new AppError(400, 'Restore would leave negative stock and was rolled back.', 'backup_integrity');
  }
  const badConsume = one(
    db,
    `SELECT m.id AS id
     FROM stock_movements m
     LEFT JOIN maintenance_transactions t ON t.id = m.maintenance_transaction_id
     WHERE m.movement_type = 'consume' AND (t.id IS NULL OR t.status != 'committed')`,
  );
  if (badConsume) {
    throw new AppError(400, 'Restore contains a stock consumption without a committed transaction.', 'backup_integrity');
  }
  const badBaseline = one(
    db,
    `SELECT b.id AS id
     FROM service_baselines b
     LEFT JOIN maintenance_transactions t ON t.id = b.established_by_transaction_id
     WHERE t.id IS NULL OR t.status != 'committed'`,
  );
  if (badBaseline) {
    throw new AppError(400, 'Restore contains a service baseline without a committed transaction.', 'backup_integrity');
  }
  const mixed = one(
    db,
    `SELECT c.id AS id
     FROM components c
     JOIN kits k ON k.id = c.kit_id
     WHERE c.part_id != k.part_id`,
  );
  if (mixed) throw new AppError(400, 'Restore mixes a component into the wrong sealed set.', 'backup_integrity');
  const overfull = one(
    db,
    `SELECT k.id AS id
     FROM kits k
     JOIN parts p ON p.id = k.part_id
     JOIN components c ON c.kit_id = k.id
     WHERE p.sealed_set_size IS NOT NULL
     GROUP BY k.id
     HAVING COUNT(c.id) > p.sealed_set_size`,
  );
  if (overfull) throw new AppError(400, 'Restore overfills a sealed set.', 'backup_integrity');
  const loose = one(
    db,
    `SELECT c.id AS id
     FROM components c
     JOIN parts p ON p.id = c.part_id
     WHERE p.sealed_set_size IS NOT NULL AND c.kit_id IS NULL`,
  );
  if (loose) throw new AppError(400, 'Restore contains a loose component for a sealed-set part.', 'backup_integrity');
  const openedCount = one(
    db,
    `SELECT k.id AS id
     FROM kits k
     JOIN parts p ON p.id = k.part_id
     LEFT JOIN components c ON c.kit_id = k.id
     WHERE p.kit_kind = 'sealed_stud_set' AND k.status != 'sealed'
     GROUP BY k.id
     HAVING COUNT(c.id) != 5`,
  );
  if (openedCount) {
    throw new AppError(400, 'Restore has an opened stud set that does not contain exactly five studs.', 'backup_integrity');
  }
  const sealedCount = one(
    db,
    `SELECT k.id AS id
     FROM kits k
     JOIN parts p ON p.id = k.part_id
     LEFT JOIN components c ON c.kit_id = k.id
     WHERE p.kit_kind = 'sealed_stud_set' AND k.status = 'sealed'
     GROUP BY k.id
     HAVING COUNT(c.id) != 0`,
  );
  if (sealedCount) {
    throw new AppError(400, 'Restore has a sealed stud set that already contains loose studs.', 'backup_integrity');
  }
  const consumed = one(
    db,
    `SELECT k.id AS id
     FROM kits k
     LEFT JOIN maintenance_transactions t ON t.id = k.consumed_by_transaction_id
     WHERE k.status = 'consumed' AND (t.id IS NULL OR t.status != 'committed')`,
  );
  if (consumed) {
    throw new AppError(400, 'Restore marks a kit consumed without a committed transaction.', 'backup_integrity');
  }
  const activeIllustrative = one(
    db,
    `SELECT id FROM maintenance_rules WHERE illustrative_draft = 1 AND rule_status != 'draft'`,
  );
  if (activeIllustrative) {
    throw new AppError(400, 'Restore contains an illustrative draft marked as an active rule.', 'backup_integrity');
  }
}
