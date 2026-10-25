import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { BACKUP_TABLES, checksumTables, exportSnapshot, restoreSnapshot, type Snapshot } from '../src/backup.ts';
import { AppError } from '../src/errors.ts';
import { createUser, login as loginUser, LOCAL_DEV_CREW_PASSWORD } from '../src/auth.ts';
import { createKit, createPart, openKit } from '../src/inventory.ts';
import {
  commitTransaction,
  createDraftTransaction,
  createEvent,
  recordInspection,
  recordSession,
  reportDefect,
} from '../src/maintenance.ts';
import { api, actor, login, studFixture, studPayload, tempDb, withServer } from './helpers.ts';

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

test('export and restore round-trip every table except the new restore audit row', () => {
  const db = tempDb();
  const admin = actor(db, 'admin');
  const fixture = studFixture(db, 'full');
  createUser(db, admin, {
    username: 'extra',
    displayName: 'Extra admin',
    role: 'administrator',
    password: 'long-enough',
  });
  loginUser(db, 'admin', 'local-dev-admin');
  const first = createDraftTransaction(db, admin, {
    idempotencyKey: 'full-install',
    vehicleId: fixture.vehicle.id,
    ruleId: fixture.rule.id,
    kind: 'initial_installation',
    payload: studPayload(fixture.kit, admin.id),
  });
  commitTransaction(db, admin, first.id);
  const secondKit = openKit(
    db,
    admin,
    createKit(db, admin, { partId: fixture.part.id, humanLabel: 'SET-full-2', location: 'cabinet', notes: '' }).id,
  );
  const replacement = createDraftTransaction(db, admin, {
    idempotencyKey: 'full-replace',
    vehicleId: fixture.vehicle.id,
    ruleId: fixture.rule.id,
    kind: 'replacement',
    payload: {
      ...studPayload(secondKit, admin.id, { lapReading: 5, engineHoursReading: 1 }),
      studs: secondKit.components.map((component, index) => ({
        index: index + 1,
        componentId: component.id,
        oldComponentId: fixture.kit.components[index].id,
      })),
      removalReason: 'Round trip',
      disposition: 'retained_as_evidence',
    },
  });
  commitTransaction(db, admin, replacement.id);
  createEvent(db, admin, {
    vehicleId: fixture.vehicle.id,
    name: 'Test event',
    series: '',
    location: '',
    startsOn: null,
    endsOn: null,
    expectedLaps: null,
    expectedEngineHours: null,
    notes: '',
  });
  recordSession(db, admin, {
    vehicleId: fixture.vehicle.id,
    eventId: null,
    name: 'Session',
    lapsCompleted: 3,
    engineHoursAdded: 0.2,
    meterNote: '',
    notes: '',
  });
  recordInspection(db, admin, {
    vehicleId: fixture.vehicle.id,
    eventId: null,
    sessionId: null,
    ruleId: fixture.rule.id,
    componentId: null,
    inspectionKind: 'pre_session',
    result: 'pass',
    measurements: {},
    notes: '',
    performedAt: new Date().toISOString(),
    maintenanceTransactionId: null,
  });
  reportDefect(db, admin, {
    vehicleId: fixture.vehicle.id,
    componentId: null,
    locationNote: 'RF',
    severity: 'needs_review',
    notes: 'Noted during the round trip.',
  });
  const before = exportSnapshot(db);
  for (const name of BACKUP_TABLES) {
    assert.ok(before.tables[name].length > 0, `${name} should contain a row`);
  }
  loginUser(db, 'crew', LOCAL_DEV_CREW_PASSWORD);
  db.prepare('UPDATE vehicles SET name = ? WHERE id = ?').run('Mutated after export', fixture.vehicle.id);
  restoreSnapshot(db, before, { actorUserId: admin.id, note: 'round trip' });
  const after = exportSnapshot(db);
  for (const name of BACKUP_TABLES) {
    if (name === 'audit_records') {
      const extra = after.tables.audit_records.filter((row) => row.action === 'backup_restored');
      assert.equal(extra.length, 1);
      assert.deepEqual(tableRows(after, name).filter((row) => !row.includes('"backup_restored"')), tableRows(before, name));
      continue;
    }
    assert.deepEqual(tableRows(after, name), tableRows(before, name), name);
  }
  const restoredName = db.prepare('SELECT name FROM vehicles WHERE id = ?').get(fixture.vehicle.id) as { name: string };
  assert.equal(restoredName.name, '350Z');
  db.close();
});

test('a restore audit can name an administrator who is not in the backup', () => {
  const db = tempDb();
  const admin = actor(db, 'admin');
  studFixture(db, 'actor');
  const snapshot = exportSnapshot(db);
  const missingActor = randomUUID();
  restoreSnapshot(db, snapshot, { actorUserId: missingActor, note: 'actor not in snapshot' });
  const row = db.prepare(
    `SELECT actor_user_id, after_json FROM audit_records WHERE action = 'backup_restored'`,
  ).get() as { actor_user_id: string | null; after_json: string };
  assert.equal(row.actor_user_id, null);
  assert.equal(JSON.parse(row.after_json).restoringActorId, missingActor);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.equal(admin.id === missingActor, false);
  db.close();
});

test('a failed restore leaves the current database unchanged', async () => {
  const db = tempDb();
  const admin = actor(db, 'admin');
  const fixture = studFixture(db, 'reject');
  const draft = createDraftTransaction(db, admin, {
    idempotencyKey: 'reject-install',
    vehicleId: fixture.vehicle.id,
    ruleId: fixture.rule.id,
    kind: 'initial_installation',
    payload: studPayload(fixture.kit, admin.id),
  });
  commitTransaction(db, admin, draft.id);
  const snapshot = exportSnapshot(db);
  db.prepare('UPDATE vehicles SET name = ? WHERE id = ?').run('Keep me', fixture.vehicle.id);
  const marker = () => (db.prepare('SELECT name FROM vehicles WHERE id = ?').get(fixture.vehicle.id) as { name: string }).name;
  const baselineCount = () => (db.prepare('SELECT COUNT(*) AS c FROM service_baselines').get() as { c: number }).c;
  const baselinesBefore = baselineCount();

  const integrity = structuredClone(snapshot);
  integrity.tables.service_baselines.push({
    id: 'baseline-without-transaction',
    rule_id: fixture.rule.id,
    vehicle_id: fixture.vehicle.id,
    position: 'RF',
    baseline_laps: 0,
    baseline_engine_hours: 0,
    baseline_date: new Date().toISOString(),
    established_by_transaction_id: 'missing-transaction',
    created_at: new Date().toISOString(),
  });
  integrity.checksum = checksumTables(integrity.tables);
  assert.throws(() => restoreSnapshot(db, integrity, { actorUserId: admin.id, note: 'integrity' }), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'backup_integrity');
    return true;
  });
  assert.equal(marker(), 'Keep me');
  assert.equal(baselineCount(), baselinesBefore);

  const missing = structuredClone(snapshot);
  delete (missing.tables as Partial<Snapshot['tables']>).events;
  assert.throws(() => restoreSnapshot(db, missing, { actorUserId: admin.id, note: 'missing' }), /missing table events/);
  assert.equal(marker(), 'Keep me');

  const wrongVersion = structuredClone(snapshot);
  wrongVersion.schemaVersion = '999';
  assert.throws(() => restoreSnapshot(db, wrongVersion, { actorUserId: admin.id, note: 'version' }), /schema 999/);
  assert.equal(marker(), 'Keep me');

  assert.throws(() => restoreSnapshot(db, JSON.parse('{}'), { actorUserId: admin.id, note: 'malformed' }), /not recognized/);
  assert.equal(marker(), 'Keep me');
  assert.equal(baselineCount(), baselinesBefore);
  db.close();

  await withServer(async ({ base }) => {
    const adminToken = await login(base, 'admin');
    const response = await fetch(`${base}/api/admin/restore`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: '{',
    });
    assert.equal(response.status, 400);
    const vehicles = await api(base, adminToken, 'GET', '/api/vehicles');
    assert.equal(vehicles.body.vehicles[0].name, '350Z');
  });
});

function tableRows(snapshot: Snapshot, name: (typeof BACKUP_TABLES)[number]): string[] {
  return snapshot.tables[name]
    .map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)))))
    .sort();
}
