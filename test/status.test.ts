import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessVehicle } from '../src/assessment.ts';
import { createKit, onHand, openKit } from '../src/inventory.ts';
import { commitTransaction, createDraftTransaction, createRule, effectCounts, listBaselines, recordInspection, recordSession } from '../src/maintenance.ts';
import { combineStatus, evaluateMetric } from '../src/status.ts';
import { actor, studFixture, studPayload, tempDb } from './helpers.ts';

test('metric math does not treat missing numbers as healthy', () => {
  assert.equal(evaluateMetric({ interval: null, warning: null, critical: null, baseline: 0, current: 0 }), 'not_applicable');
  assert.equal(evaluateMetric({ interval: 100, warning: 10, critical: 120, baseline: null, current: 10 }), 'unknown');
  assert.equal(evaluateMetric({ interval: 100, warning: 10, critical: 120, baseline: 0, current: null }), 'unknown');
  assert.equal(evaluateMetric({ interval: 100, warning: 10, critical: 120, baseline: 0, current: 50 }), 'not_due');
  assert.equal(evaluateMetric({ interval: 100, warning: 10, critical: 120, baseline: 0, current: 95 }), 'approaching');
  assert.equal(evaluateMetric({ interval: 100, warning: 10, critical: 120, baseline: 0, current: 100 }), 'due');
  assert.equal(evaluateMetric({ interval: 100, warning: 10, critical: 120, baseline: 0, current: 120 }), 'overdue');
  assert.equal(evaluateMetric({ interval: 100, warning: null, critical: null, baseline: 0, current: 100 }), 'due');
});

test('lap and engine-hour results stay independent', () => {
  const combined = combineStatus({
    metrics: { laps: 'not_due', engineHours: 'due', calendar: 'not_applicable' },
    action: 'replace',
    latestInspection: null,
  });
  assert.equal(combined.status, 'due');
  const unknown = combineStatus({
    metrics: { laps: 'not_due', engineHours: 'unknown', calendar: 'not_applicable' },
    action: 'replace',
    latestInspection: null,
  });
  assert.equal(unknown.status, 'unknown');
  const failed = combineStatus({
    metrics: { laps: 'not_due', engineHours: 'not_applicable', calendar: 'not_applicable' },
    action: 'replace',
    latestInspection: 'fail',
  });
  assert.equal(failed.status, 'failed_inspection');
  const missingInspection = combineStatus({
    metrics: { laps: 'not_due', engineHours: 'not_applicable', calendar: 'not_applicable' },
    action: 'inspect',
    latestInspection: null,
  });
  assert.equal(missingInspection.status, 'unknown');
});

test('an empty rule list is unknown and blocks a false ready state', () => {
  const db = tempDb();
  const vehicleId = (db.prepare('SELECT id FROM vehicles').get() as { id: string }).id;
  const assessment = assessVehicle(db, vehicleId);
  assert.equal(assessment.items.length, 0);
  assert.equal(assessment.readiness.blocksReady, true);
  assert.equal(assessment.readiness.state, 'blocked');
  assert.match(assessment.readiness.disclaimer, /not a certification/i);
  assert.equal(JSON.stringify(assessment).includes('"ready"'), false);
  db.close();
});

test('a rule without a baseline or current reading stays unknown', () => {
  const db = tempDb();
  const { vehicle, rule, kit, admin } = studFixture(db, 'unknown');
  const beforeSession = assessVehicle(db, vehicle.id);
  assert.equal(beforeSession.items[0].status, 'unknown');
  assert.equal(beforeSession.readiness.blocksReady, true);
  const draft = createDraftTransaction(db, admin, {
    idempotencyKey: 'unknown-install',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id, { lapReading: 0, engineHoursReading: 0 }),
  });
  commitTransaction(db, admin, draft.id);
  const afterCommit = assessVehicle(db, vehicle.id);
  assert.equal(afterCommit.items[0].metrics.laps, 'unknown');
  assert.equal(afterCommit.readiness.blocksReady, true);
  recordSession(db, admin, {
    vehicleId: vehicle.id,
    eventId: null,
    name: 'Practice',
    lapsCompleted: 20,
    engineHoursAdded: 1,
    meterNote: '',
    notes: '',
  });
  const known = assessVehicle(db, vehicle.id);
  const byCorner = Object.fromEntries(known.items.map((item) => [item.corner, item]));
  assert.equal(byCorner.LF.metrics.laps, 'not_due');
  assert.equal(byCorner.LF.metrics.engineHours, 'not_due');
  assert.equal(byCorner.LF.status, 'not_due');
  assert.equal(byCorner.RF.status, 'unknown');
  assert.equal(byCorner.LR.status, 'unknown');
  assert.equal(byCorner.RR.status, 'unknown');
  assert.equal(byCorner.RF.kitId, null);
  assert.equal(known.readiness.status, 'unknown');
  assert.equal(known.readiness.blocksReady, true);
  assert.match(known.readiness.disclaimer, /not a certification/i);
  recordInspection(db, admin, {
    vehicleId: vehicle.id,
    eventId: null,
    sessionId: null,
    ruleId: rule.id,
    componentId: null,
    inspectionKind: 'component',
    result: 'fail',
    measurements: {},
    notes: 'Observed play',
    performedAt: new Date().toISOString(),
    maintenanceTransactionId: null,
  });
  const failed = assessVehicle(db, vehicle.id);
  assert.equal(failed.items[0].status, 'failed_inspection');
  assert.equal(failed.readiness.blocksReady, true);
  assert.equal(effectCounts(db).baselines, 1);
  assert.equal(onHand(db, kit.partId), 0);
  db.close();
});

test('one serviced corner does not hide an overdue corner', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit, part } = studFixture(db, 'corners');
  const leftFront = createDraftTransaction(db, admin, {
    idempotencyKey: 'lf-serviced',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id, { lapReading: 110, engineHoursReading: 0 }),
  });
  commitTransaction(db, admin, leftFront.id);
  const rightFrontKit = openKit(
    db,
    admin,
    createKit(db, admin, { partId: part.id, humanLabel: 'SET-corners-rf', location: 'cabinet', notes: '' }).id,
  );
  const rightFront = createDraftTransaction(db, admin, {
    idempotencyKey: 'rf-overdue',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(rightFrontKit, admin.id, { wheel: 'RF', lapReading: 0, engineHoursReading: 0 }),
  });
  commitTransaction(db, admin, rightFront.id);
  recordSession(db, admin, {
    vehicleId: vehicle.id,
    eventId: null,
    name: 'Long practice',
    lapsCompleted: 120,
    engineHoursAdded: 1,
    meterNote: '',
    notes: '',
  });
  const assessment = assessVehicle(db, vehicle.id);
  const byCorner = Object.fromEntries(assessment.items.map((item) => [item.corner, item]));
  assert.equal(byCorner.LF.status, 'not_due');
  assert.equal(byCorner.RF.status, 'overdue');
  assert.equal(byCorner.LR.status, 'unknown');
  assert.equal(byCorner.RR.status, 'unknown');
  assert.equal(assessment.readiness.status, 'overdue');
  assert.equal(assessment.readiness.blocksReady, true);
  db.close();
});

test('illustrative drafts are labeled and cannot become active rules', () => {
  const db = tempDb();
  const admin = actor(db, 'admin');
  const draft = createRule(db, admin, {
    name: 'Example only',
    partId: null,
    category: '',
    action: 'inspect',
    lapInterval: null,
    engineHourInterval: null,
    calendarIntervalDays: null,
    warningThresholdLaps: null,
    warningThresholdHours: null,
    warningThresholdDays: null,
    criticalThresholdLaps: null,
    criticalThresholdHours: null,
    criticalThresholdDays: null,
    requiredMeasurements: [],
    requiredSignoffs: [],
    procedureSource: 'No source. Illustrative draft.',
    procedureRevision: 'none',
    safetyCritical: false,
    ruleStatus: 'draft',
    illustrativeDraft: true,
  });
  assert.equal(draft.label, 'ILLUSTRATIVE DRAFT — not an approved interval');
  assert.throws(() => {
    db.prepare(`UPDATE maintenance_rules SET rule_status = 'active' WHERE id = ?`).run(draft.id);
  });
  assert.equal(listBaselines(db).length, 0);
  db.close();
});
