import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreSnapshot } from '../src/backup.ts';
import { AppError } from '../src/errors.ts';
import { createPart } from '../src/inventory.ts';
import { api, actor, login, studFixture, tempDb, withServer } from './helpers.ts';
import { exportSnapshot } from '../src/backup.ts';

test('restore puts back the same records and a bad checksum changes nothing', () => {
  const db = tempDb();
  const admin = actor(db, 'admin');
  const fixture = studFixture(db, 'backup');
  const snapshot = exportSnapshot(db);
  db.prepare('UPDATE vehicles SET name = ? WHERE id = ?').run('Changed name', fixture.vehicle.id);
  createPart(db, admin, {
    catalogNumber: 'EXTRA',
    description: 'Should disappear on restore',
    unitOfMeasure: 'each',
    category: '',
    reorderThreshold: null,
    minimumQuantity: null,
    desiredQuantity: null,
    supplierName: '',
    purchasingNotes: '',
    kitKind: 'none',
  });

  const tampered = structuredClone(snapshot);
  tampered.tables.vehicles[0].name = 'Hacked';
  assert.throws(() => restoreSnapshot(db, tampered, { actorUserId: admin.id, note: 'tamper' }), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'backup_checksum');
    return true;
  });
  const stillChanged = db.prepare('SELECT name FROM vehicles WHERE id = ?').get(fixture.vehicle.id) as { name: string };
  assert.equal(stillChanged.name, 'Changed name');
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE catalog_number = 'EXTRA'`).get() as { c: number }).c, 1);

  restoreSnapshot(db, snapshot, { actorUserId: null, note: 'test restore' });
  const restored = db.prepare('SELECT name, laps_total FROM vehicles WHERE id = ?').get(fixture.vehicle.id) as {
    name: string;
    laps_total: number | null;
  };
  assert.equal(restored.name, '350Z');
  assert.equal(restored.laps_total, null);
  const part = db.prepare('SELECT id, sealed_set_size FROM parts WHERE catalog_number = ?').get('STUD-backup') as {
    id: string;
    sealed_set_size: number;
  };
  assert.equal(part.id, fixture.part.id);
  assert.equal(part.sealed_set_size, 5);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM components WHERE kit_id = ?').get(fixture.kit.id) as { c: number }).c, 5);
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE catalog_number = 'EXTRA'`).get() as { c: number }).c, 0);
  const audits = db.prepare(`SELECT COUNT(*) AS c FROM audit_records WHERE action = 'backup_restored'`).get() as { c: number };
  assert.equal(audits.c, 1);
  db.close();
});

test('the HTTP restore path is administrator-only and round-trips', async () => {
  await withServer(async ({ base }) => {
    const adminToken = await login(base, 'admin');
    const crewToken = await login(base, 'crew');
    const before = await api(base, adminToken, 'GET', '/api/admin/export');
    assert.equal(before.status, 200);
    const vehicleId = before.body.tables.vehicles[0].id as string;

    const created = await api(base, adminToken, 'POST', '/api/parts', {
      catalogNumber: 'TEMP',
      description: 'Temporary',
      unitOfMeasure: 'each',
      kitKind: 'none',
    });
    assert.equal(created.status, 201);

    const forbidden = await api(base, crewToken, 'POST', '/api/admin/restore', before.body);
    assert.equal(forbidden.status, 403);
    const stillThere = await api(base, adminToken, 'GET', '/api/parts');
    assert.equal(stillThere.body.parts.length, 1);

    const restored = await api(base, adminToken, 'POST', '/api/admin/restore', before.body);
    assert.equal(restored.status, 200);
    const after = await api(base, adminToken, 'GET', '/api/parts');
    assert.equal(after.body.parts.length, 0);
    const vehicles = await api(base, adminToken, 'GET', '/api/vehicles');
    assert.equal(vehicles.body.vehicles[0].id, vehicleId);
    assert.equal(vehicles.body.vehicles[0].lapsTotal, null);
  });
});
