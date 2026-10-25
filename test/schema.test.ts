import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newId } from '../src/db.ts';
import { createKit, onHand } from '../src/inventory.ts';
import { listRules } from '../src/maintenance.ts';
import { studFixture, tempDb } from './helpers.ts';

test('a new database has identity only: no parts, rules, kits, or usage history', () => {
  const db = tempDb();
  const vehicle = db.prepare('SELECT laps_total, engine_hours_total, notes FROM vehicles').get() as {
    laps_total: number | null;
    engine_hours_total: number | null;
    notes: string;
  };
  assert.equal(vehicle.laps_total, null);
  assert.equal(vehicle.engine_hours_total, null);
  assert.match(vehicle.notes, /No maintenance history/i);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM parts').get() as { c: number }).c, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM kits').get() as { c: number }).c, 0);
  assert.equal(listRules(db).length, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM service_baselines').get() as { c: number }).c, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM installations').get() as { c: number }).c, 0);
  db.close();
});

test('every domain table uses a stable text id', () => {
  const db = tempDb();
  const tables = [
    'vehicles',
    'users',
    'parts',
    'kits',
    'stock_movements',
    'components',
    'installations',
    'removals',
    'maintenance_rules',
    'inspections',
    'sessions',
    'events',
    'audit_records',
    'maintenance_transactions',
    'service_baselines',
    'defects',
  ];
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number; type: string }[];
    const id = columns.find((column) => column.name === 'id');
    assert.ok(id, `${table} needs an id`);
    assert.equal(id.pk, 1);
    assert.match(id.type, /TEXT/i);
  }
  db.close();
});

test('sealed stud sets are locked to five and cannot be mixed or loosened', () => {
  const db = tempDb();
  assert.throws(() => {
    db.prepare(
      `INSERT INTO parts (
        id, catalog_number, description, unit_of_measure, category, kit_kind, sealed_set_size, created_at, updated_at
      ) VALUES (?, 'BAD', 'bad', 'set', '', 'sealed_stud_set', 4, 't', 't')`,
    ).run(newId());
  });
  const { admin, part, kit } = studFixture(db, 'schema');
  assert.equal(part.sealedSetSize, 5);
  assert.equal(kit.components.length, 5);
  assert.equal(new Set(kit.components.map((component) => component.partId)).size, 1);
  assert.equal(onHand(db, part.id), 1);
  const extra = newId();
  assert.throws(() => {
    db.prepare(
      `INSERT INTO components (id, part_id, kit_id, status, physical_mark, notes, created_at, updated_at)
       VALUES (?, ?, ?, 'in_stock', '', '', 't', 't')`,
    ).run(extra, part.id, kit.id);
  }, /sealed set is full/);
  assert.throws(() => {
    db.prepare(
      `INSERT INTO components (id, part_id, kit_id, status, physical_mark, notes, created_at, updated_at)
       VALUES (?, ?, NULL, 'in_stock', '', '', 't', 't')`,
    ).run(newId(), part.id);
  }, /loose untracked/);
  const other = createKit(db, admin, { partId: part.id, humanLabel: 'SET-other', location: '', notes: '' });
  assert.throws(() => {
    db.prepare('UPDATE components SET kit_id = ? WHERE id = ?').run(other.id, kit.components[0].id);
  }, /immutable/);
  assert.throws(() => {
    db.prepare('DELETE FROM components WHERE id = ?').run(kit.components[0].id);
  }, /cannot be deleted/);
  assert.equal(onHand(db, part.id), 2);
  db.close();
});
