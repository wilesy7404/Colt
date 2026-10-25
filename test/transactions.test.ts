import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppError } from '../src/errors.ts';
import { newId, withTransaction } from '../src/db.ts';
import { createKit, listComponents, onHand, openKit, sealedCount } from '../src/inventory.ts';
import {
  abortTransaction,
  commitTransaction,
  createDraftTransaction,
  effectCounts,
  getRule,
  listInstallations,
  listRemovals,
  recordInspection,
  recordSession,
} from '../src/maintenance.ts';
import { actor, studFixture, studPayload, tempDb } from './helpers.ts';

test('a draft, an abort, and an incomplete commit do not consume stock or set a baseline', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit, part } = studFixture(db, 'incomplete');
  const before = effectCounts(db);
  const draft = createDraftTransaction(db, admin, {
    idempotencyKey: 'draft-only',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id),
  });
  assert.equal(draft.status, 'draft');
  assert.equal(onHand(db, part.id), 1);
  assert.deepEqual(effectCounts(db), before);

  const missingSignoff = createDraftTransaction(db, admin, {
    idempotencyKey: 'missing-signoff',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id, { signoffs: [] }),
  });
  assert.throws(() => commitTransaction(db, admin, missingSignoff.id), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 422);
    return true;
  });
  assert.equal(onHand(db, part.id), 1);
  assert.equal(sealedCount(db, part.id), 0);
  assert.equal(effectCounts(db).baselines, 0);
  assert.equal(effectCounts(db).consumes, 0);
  assert.equal(effectCounts(db).installations, 0);

  const missingReading = createDraftTransaction(db, admin, {
    idempotencyKey: 'missing-reading',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id, { lapReading: null }),
  });
  assert.throws(() => commitTransaction(db, admin, missingReading.id), (error: unknown) => error instanceof AppError && error.status === 422);
  assert.equal(effectCounts(db).baselines, 0);
  assert.equal(onHand(db, part.id), 1);

  const aborted = createDraftTransaction(db, admin, {
    idempotencyKey: 'abort-me',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id),
  });
  abortTransaction(db, admin, aborted.id);
  assert.equal(effectCounts(db).baselines, 0);
  assert.equal(onHand(db, part.id), 1);
  db.close();
});

test('a committed five-stud installation is atomic and a second commit does not consume twice', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit, part } = studFixture(db, 'commit');
  const intervalBefore = getRule(db, rule.id).lap_interval;
  const draft = createDraftTransaction(db, admin, {
    idempotencyKey: 'install-lf',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id),
  });
  const committed = commitTransaction(db, admin, draft.id);
  assert.equal(committed.transaction.status, 'committed');
  assert.equal(committed.alreadyCommitted, false);
  assert.equal(onHand(db, part.id), 0);
  assert.equal(effectCounts(db).baselines, 1);
  assert.equal(effectCounts(db).consumes, 1);
  assert.equal(effectCounts(db).installations, 5);
  assert.equal(getRule(db, rule.id).lap_interval, intervalBefore);

  const again = commitTransaction(db, admin, draft.id);
  assert.equal(again.alreadyCommitted, true);
  assert.equal(effectCounts(db).consumes, 1);
  assert.equal(onHand(db, part.id), 0);
  db.close();
});

test('a failed write inside the commit transaction rolls back stock and the baseline', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit } = studFixture(db, 'rollback');
  const draft = createDraftTransaction(db, admin, {
    idempotencyKey: 'rollback',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id),
  });
  const before = effectCounts(db);
  assert.throws(() => {
    withTransaction(db, () => {
      db.prepare(
        `UPDATE maintenance_transactions
         SET status = 'committed', committed_at = ?, committed_by_user_id = ?
         WHERE id = ?`,
      ).run(new Date().toISOString(), admin.id, draft.id);
      db.prepare(
        `INSERT INTO service_baselines (
          id, rule_id, vehicle_id, position, baseline_laps, baseline_engine_hours, baseline_date,
          established_by_transaction_id, created_at
        ) VALUES (?, ?, ?, 'LF', 0, 0, ?, ?, ?)`,
      ).run(newId(), rule.id, vehicle.id, new Date().toISOString(), draft.id, new Date().toISOString());
      db.prepare(
        `INSERT INTO stock_movements (
          id, part_id, kit_id, movement_type, quantity_delta, authorized_negative_exception, exception_reason,
          maintenance_transaction_id, notes, actor_user_id, created_at
        ) VALUES (?, ?, ?, 'consume', -1, 0, NULL, ?, 'should roll back', ?, ?)`,
      ).run(newId(), kit.partId, kit.id, draft.id, admin.id, new Date().toISOString());
      throw new Error('boom');
    });
  }, /boom/);
  assert.deepEqual(effectCounts(db), before);
  const status = db.prepare('SELECT status FROM maintenance_transactions WHERE id = ?').get(draft.id) as { status: string };
  assert.equal(status.status, 'draft');
  db.close();
});

test('database triggers reject a baseline or stock consumption without a committed transaction', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit } = studFixture(db, 'triggers');
  const draft = createDraftTransaction(db, admin, {
    idempotencyKey: 'trigger',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id),
  });
  assert.throws(() => {
    db.prepare(
      `INSERT INTO service_baselines (
        id, rule_id, vehicle_id, position, baseline_laps, baseline_engine_hours, baseline_date,
        established_by_transaction_id, created_at
      ) VALUES (?, ?, ?, 'LF', 0, 0, ?, ?, ?)`,
    ).run(newId(), rule.id, vehicle.id, new Date().toISOString(), draft.id, new Date().toISOString());
  }, /committed maintenance transaction/);
  assert.throws(() => {
    db.prepare(
      `INSERT INTO stock_movements (
        id, part_id, kit_id, movement_type, quantity_delta, authorized_negative_exception, exception_reason,
        maintenance_transaction_id, notes, actor_user_id, created_at
      ) VALUES (?, ?, ?, 'consume', -1, 0, NULL, ?, 'nope', ?, ?)`,
    ).run(newId(), kit.partId, kit.id, draft.id, admin.id, new Date().toISOString());
  }, /committed maintenance transaction/);
  assert.equal(effectCounts(db).baselines, 0);
  assert.equal(effectCounts(db).consumes, 0);
  db.close();
});

test('replacement keeps the removed studs and does not erase the first baseline', () => {
  const db = tempDb();
  const crew = actor(db, 'crew');
  const { admin, vehicle, rule, kit, part } = studFixture(db, 'first');
  const first = createDraftTransaction(db, crew, {
    idempotencyKey: 'first-wheel',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, crew.id, { lapReading: 0, engineHoursReading: 0 }),
  });
  commitTransaction(db, crew, first.id);
  const oldIds = kit.components.map((component) => component.id);

  const secondKit = openKit(db, crew, createKit(db, admin, {
    partId: part.id,
    humanLabel: 'SET-second',
    location: 'cabinet',
    notes: '',
  }).id);
  const replacement = createDraftTransaction(db, crew, {
    idempotencyKey: 'replace-wheel',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'replacement',
    payload: {
      ...studPayload(secondKit, crew.id, { lapReading: 40, engineHoursReading: 2 }),
      studs: secondKit.components.map((component, index) => ({
        index: index + 1,
        componentId: component.id,
        oldComponentId: oldIds[index],
      })),
      removalReason: 'Observed during inspection',
      disposition: 'retained_as_evidence',
      failureEvidenceNotes: 'Kept the removed studs for inspection.',
    },
  });
  commitTransaction(db, crew, replacement.id);

  const components = listComponents(db) as { id: string; status: string }[];
  for (const oldId of oldIds) {
    assert.equal(components.find((component) => component.id === oldId)?.status, 'evidence');
  }
  const installations = listInstallations(db) as { component_id: string; status: string }[];
  for (const oldId of oldIds) {
    assert.equal(installations.find((row) => row.component_id === oldId)?.status, 'superseded');
  }
  assert.equal(listRemovals(db).length, 5);
  assert.equal(effectCounts(db).baselines, 2);
  assert.equal(effectCounts(db).consumes, 2);
  assert.equal(onHand(db, part.id), 0);
  assert.equal(getRule(db, rule.id).lap_interval, 100);
  db.close();
});

test('inspections and sessions do not consume stock or reset a baseline', () => {
  const db = tempDb();
  const { admin, vehicle, rule, part } = studFixture(db, 'inspect');
  const before = effectCounts(db);
  recordInspection(db, admin, {
    vehicleId: vehicle.id,
    eventId: null,
    sessionId: null,
    ruleId: rule.id,
    componentId: null,
    inspectionKind: 'pre_event',
    result: 'unknown',
    measurements: {},
    notes: 'Could not finish',
    performedAt: new Date().toISOString(),
    maintenanceTransactionId: null,
  });
  recordSession(db, admin, {
    vehicleId: vehicle.id,
    eventId: null,
    name: 'Saturday practice',
    lapsCompleted: 12,
    engineHoursAdded: 0.5,
    meterNote: '',
    notes: '',
  });
  assert.deepEqual(effectCounts(db), before);
  assert.equal(onHand(db, part.id), 1);
  const vehicleRow = db.prepare('SELECT laps_total FROM vehicles WHERE id = ?').get(vehicle.id) as { laps_total: number };
  assert.equal(vehicleRow.laps_total, 12);
  db.close();
});
