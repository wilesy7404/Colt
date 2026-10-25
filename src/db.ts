import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { AppError } from './errors.ts';

export const SCHEMA_VERSION = '1';

export const TRIGGER_NAMES = [
  'components_no_delete',
  'installations_no_delete',
  'removals_no_delete',
  'baselines_no_delete',
  'stock_movements_no_delete',
  'stock_movements_append_only',
  'inspections_no_delete',
  'audit_no_delete',
  'transactions_committed_immutable',
  'components_kit_immutable',
  'components_match_kit',
  'components_require_kit_for_sealed_parts',
  'baselines_require_committed',
  'consume_requires_committed',
  'stock_no_silent_negative',
] as const;

const schemaSql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const triggersSql = fs.readFileSync(new URL('./triggers.sql', import.meta.url), 'utf8');

export function openDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
  }
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync): void {
  const existing = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'")
    .get();
  if (!existing) {
    db.exec(schemaSql);
    db.exec(triggersSql);
    return;
  }
  const version = one<{ value: string }>(db, "SELECT value FROM schema_meta WHERE key = 'schema_version'");
  if (!version || version.value !== SCHEMA_VERSION) {
    throw new Error(
      `Database schema version is ${version?.value ?? 'missing'}; this build expects ${SCHEMA_VERSION}. Refusing to guess a migration.`,
    );
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function one<T extends object>(db: DatabaseSync, sql: string, params: unknown[] = []): T | undefined {
  const row = db.prepare(sql).get(...params);
  if (!row) return undefined;
  return { ...(row as object) } as T;
}

export function many<T extends object>(db: DatabaseSync, sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...params).map((row) => ({ ...(row as object) }) as T);
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The statement may already have ended the transaction.
    }
    throw error;
  }
}

export function dropTriggers(db: DatabaseSync): void {
  for (const name of TRIGGER_NAMES) {
    db.exec(`DROP TRIGGER IF EXISTS ${name}`);
  }
}

export function createTriggers(db: DatabaseSync): void {
  db.exec(triggersSql);
}

export function rethrowSqlite(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/component kit identity is immutable/i.test(message)) {
    throw new AppError(409, 'Studs cannot move between sealed sets.', 'kit_immutable');
  }
  if (/sealed set is full/i.test(message)) {
    throw new AppError(409, 'That sealed set is already full. Studs from another set cannot be mixed in.', 'kit_full');
  }
  if (/loose untracked components/i.test(message)) {
    throw new AppError(409, 'Sealed-set parts cannot be stored as loose components.', 'kit_required');
  }
  if (/does not match the sealed set/i.test(message)) {
    throw new AppError(409, 'That component does not belong to this sealed set.', 'kit_part_mismatch');
  }
  if (/stock would go negative/i.test(message)) {
    throw new AppError(409, 'That movement would make stock negative.', 'negative_stock');
  }
  if (/stock consume requires a committed/i.test(message) || /service baseline requires a committed/i.test(message)) {
    throw new AppError(409, 'Stock and service baselines change only when a maintenance transaction commits.', 'incomplete_transaction');
  }
  if (/cannot be deleted|append-only|are immutable/i.test(message)) {
    throw new AppError(409, message, 'append_only');
  }
  if (/UNIQUE constraint failed/i.test(message)) {
    throw new AppError(409, 'A record with that identity already exists.', 'conflict');
  }
  if (/CHECK constraint failed/i.test(message)) {
    throw new AppError(400, 'The record violates a database constraint.', 'check_constraint');
  }
  throw error;
}
