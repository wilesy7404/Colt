import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectCounts } from '../src/maintenance.ts';
import { api, login, withServer } from './helpers.ts';

test('health does not claim sync, a native app, or verified intervals', async () => {
  await withServer(async ({ base }) => {
    const health = await api(base, null, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.offlineSync, false);
    assert.equal(health.body.crossDeviceSync, false);
    assert.equal(health.body.nativeIphoneApp, false);
    assert.equal(health.body.serviceIntervalsVerified, false);
    assert.equal(health.body.maintenanceHistorySeeded, false);
  });
});

test('race-day users cannot change rules, users, or backups', async () => {
  await withServer(async ({ db, base }) => {
    const adminToken = await login(base, 'admin');
    const crewToken = await login(base, 'crew');
    const vehicles = await api(base, adminToken, 'GET', '/api/vehicles');
    const vehicleId = vehicles.body.vehicles[0].id as string;

    const created = await api(base, adminToken, 'POST', '/api/maintenance-rules', {
      name: 'Brake fluid check',
      action: 'inspect',
      procedureSource: 'Team notes pending a verified source',
      procedureRevision: 'draft-0',
      ruleStatus: 'draft',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.rule.lapInterval, null);
    assert.equal(created.body.rule.engineHourInterval, null);
    assert.equal(created.body.rule.calendarIntervalDays, null);

    const unauthenticated = await api(base, null, 'GET', '/api/vehicles');
    assert.equal(unauthenticated.status, 401);

    const crewRead = await api(base, crewToken, 'GET', '/api/maintenance-rules');
    assert.equal(crewRead.status, 200);

    const crewPatch = await api(base, crewToken, 'PATCH', `/api/maintenance-rules/${created.body.rule.id}`, {
      lapInterval: 50,
    });
    assert.equal(crewPatch.status, 403);

    const crewCreate = await api(base, crewToken, 'POST', '/api/maintenance-rules', {
      name: 'Silent change',
      action: 'replace',
      procedureSource: 'no',
      procedureRevision: 'no',
      lapInterval: 10,
    });
    assert.equal(crewCreate.status, 403);

    const crewUser = await api(base, crewToken, 'POST', '/api/users', {
      username: 'extra',
      displayName: 'Extra',
      role: 'administrator',
      password: 'long-enough',
    });
    assert.equal(crewUser.status, 403);

    const snapshot = await api(base, adminToken, 'GET', '/api/admin/export');
    assert.equal(snapshot.status, 200);
    const crewRestore = await api(base, crewToken, 'POST', '/api/admin/restore', snapshot.body);
    assert.equal(crewRestore.status, 403);

    const consume = await api(base, adminToken, 'POST', '/api/stock-movements', {
      partId: 'missing',
      movementType: 'consume',
      quantityDelta: -1,
    });
    assert.equal(consume.status, 422);

    const inspection = await api(base, crewToken, 'POST', '/api/inspections', {
      vehicleId,
      inspectionKind: 'pre_session',
      result: 'unknown',
      performedAt: new Date().toISOString(),
      notes: 'Not finished',
    });
    assert.equal(inspection.status, 201);
    assert.equal(effectCounts(db).baselines, 0);
    assert.equal(effectCounts(db).consumes, 0);

    const reread = await api(base, adminToken, 'GET', '/api/maintenance-rules');
    assert.equal(reread.body.rules[0].lapInterval, null);
  });
});

test('the archived prototype is not served', async () => {
  await withServer(async ({ base }) => {
    const directory = await fetch(`${base}/archive/prototype/`);
    const page = await fetch(`${base}/archive/prototype/index.html`);
    assert.equal(directory.status, 404);
    assert.equal(page.status, 404);
  });
});

test('race-day users cannot export, create parts, kits, stock, events, vehicles, or read the audit log', async () => {
  await withServer(async ({ base }) => {
    const adminToken = await login(base, 'admin');
    const crewToken = await login(base, 'crew');
    const vehicles = await api(base, adminToken, 'GET', '/api/vehicles');
    const vehicleId = vehicles.body.vehicles[0].id as string;
    assert.equal((await api(base, crewToken, 'GET', '/api/admin/export')).status, 403);
    assert.equal(
      (
        await api(base, crewToken, 'POST', '/api/parts', {
          catalogNumber: 'CREW-PART',
          description: 'no',
          unitOfMeasure: 'each',
          kitKind: 'none',
        })
      ).status,
      403,
    );
    assert.equal((await api(base, crewToken, 'POST', '/api/kits', { partId: 'none', humanLabel: 'nope' })).status, 403);
    assert.equal(
      (
        await api(base, crewToken, 'POST', '/api/stock-movements', {
          partId: 'none',
          movementType: 'adjust',
          quantityDelta: 1,
        })
      ).status,
      403,
    );
    assert.equal((await api(base, crewToken, 'POST', '/api/events', { vehicleId, name: 'nope' })).status, 403);
    assert.equal((await api(base, crewToken, 'POST', '/api/vehicles', { name: 'nope' })).status, 403);
    assert.equal((await api(base, crewToken, 'GET', '/api/audit-records')).status, 403);
    const parts = await api(base, adminToken, 'GET', '/api/parts');
    assert.equal(parts.body.parts.length, 0);
  });
});

test('only an administrator can close a critical defect', async () => {
  await withServer(async ({ base }) => {
    const adminToken = await login(base, 'admin');
    const crewToken = await login(base, 'crew');
    const vehicleId = (await api(base, adminToken, 'GET', '/api/vehicles')).body.vehicles[0].id as string;
    const defect = await api(base, crewToken, 'POST', '/api/defects', {
      vehicleId,
      locationNote: 'LF wheel',
      severity: 'critical',
      notes: 'Play at the wheel',
    });
    assert.equal(defect.status, 201);
    const blocked = await api(base, crewToken, 'GET', `/api/vehicles/${vehicleId}/assessment`);
    assert.equal(blocked.body.readiness.blocksReady, true);
    const denied = await api(base, crewToken, 'POST', `/api/defects/${defect.body.defect.id}/resolve`, {
      resolutionNotes: 'crew tried to close it',
    });
    assert.equal(denied.status, 403);
    const stillBlocked = await api(base, adminToken, 'GET', `/api/vehicles/${vehicleId}/assessment`);
    assert.equal(stillBlocked.body.readiness.blocksReady, true);
    assert.equal(stillBlocked.body.readiness.reasons.some((reason: string) => /critical defect/i.test(reason)), true);
    const closed = await api(base, adminToken, 'POST', `/api/defects/${defect.body.defect.id}/resolve`, {
      resolutionNotes: 'Administrator closed it',
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.defect.status, 'resolved');
    const audit = await api(base, adminToken, 'GET', '/api/audit-records');
    assert.equal(
      audit.body.auditRecords.some((row: { action: string; entityId: string }) => row.action === 'defect_resolved' && row.entityId === defect.body.defect.id),
      true,
    );
  });
});
