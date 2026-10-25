import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUser } from '../src/auth.ts';
import { AppError } from '../src/errors.ts';
import { newId } from '../src/db.ts';
import { createKit, listComponents, onHand, openKit, sealedCount } from '../src/inventory.ts';
import {
  abortTransaction,
  commitTransaction,
  createDraftTransaction,
  effectCounts,
  getRule,
  getTransaction,
  listInstallations,
  listRemovals,
  recordInspection,
  recordSession,
  setCommitTestHook,
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
  const signoffs = committed.transaction.recordedSignoffs as { userId: string; label: string; signedAt: string }[];
  assert.equal(signoffs.length, 1);
  assert.equal(signoffs[0].userId, admin.id);
  assert.equal(signoffs[0].label, 'work_completed');
  assert.ok(Math.abs(Date.parse(signoffs[0].signedAt) - Date.now()) < 60_000);
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

test('a real commit rolls back when a baseline insert or the commit audit fails', () => {
  for (const kind of ['initial_installation', 'replacement'] as const) {
    for (const failure of ['baseline', 'audit'] as const) {
      const db = tempDb();
      const trigger = failure === 'baseline' ? 'qa_fail_baseline' : 'qa_fail_audit';
      try {
        const { admin, vehicle, rule, kit, part } = studFixture(db, `${kind}-${failure}`);
        const first = createDraftTransaction(db, admin, {
          idempotencyKey: `first-${kind}-${failure}`,
          vehicleId: vehicle.id,
          ruleId: rule.id,
          kind: 'initial_installation',
          payload: studPayload(kit, admin.id),
        });
        if (kind === 'replacement') {
          commitTransaction(db, admin, first.id);
          const secondKit = openKit(
            db,
            admin,
            createKit(db, admin, {
              partId: part.id,
              humanLabel: `SET-next-${kind}-${failure}`,
              location: 'cabinet',
              notes: '',
            }).id,
          );
          const replacement = createDraftTransaction(db, admin, {
            idempotencyKey: `replace-${kind}-${failure}`,
            vehicleId: vehicle.id,
            ruleId: rule.id,
            kind: 'replacement',
            payload: {
              ...studPayload(secondKit, admin.id, { lapReading: 40, engineHoursReading: 2 }),
              studs: secondKit.components.map((component, index) => ({
                index: index + 1,
                componentId: component.id,
                oldComponentId: kit.components[index].id,
              })),
              removalReason: 'Injected failure check',
              disposition: 'retained_as_evidence',
            },
          });
          expectRollback(db, admin, replacement.id, rule.id, part.id, trigger, failure);
        } else {
          expectRollback(db, admin, first.id, rule.id, part.id, trigger, failure);
        }
      } finally {
        db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
        db.close();
      }
    }
  }
});

function expectRollback(
  db: ReturnType<typeof tempDb>,
  admin: ReturnType<typeof actor>,
  draftId: string,
  ruleId: string,
  partId: string,
  trigger: string,
  failure: 'baseline' | 'audit',
): void {
  const before = ledgerSnapshot(db, draftId, ruleId, partId);
  if (failure === 'baseline') {
    db.exec(
      `CREATE TEMP TRIGGER ${trigger} BEFORE INSERT ON service_baselines BEGIN SELECT RAISE(ABORT, 'injected baseline failure'); END;`,
    );
  } else {
    db.exec(
      `CREATE TEMP TRIGGER ${trigger} BEFORE INSERT ON audit_records WHEN NEW.action = 'transaction_committed' BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END;`,
    );
  }
  assert.throws(() => commitTransaction(db, admin, draftId));
  assert.deepEqual(ledgerSnapshot(db, draftId, ruleId, partId), before);
}

function ledgerSnapshot(db: ReturnType<typeof tempDb>, draftId: string, ruleId: string, partId: string) {
  const plain = (sql: string, params: unknown[] = []) =>
    db.prepare(sql).all(...params).map((row) => ({ ...(row as object) }));
  return {
    stock: onHand(db, partId),
    kits: plain('SELECT id, status FROM kits ORDER BY id'),
    components: plain('SELECT id, status FROM components ORDER BY id'),
    installs: plain('SELECT id, status, position FROM installations ORDER BY id'),
    removals: plain('SELECT id, component_id FROM removals ORDER BY id'),
    baselines: plain('SELECT id, position, baseline_laps FROM service_baselines ORDER BY id'),
    audit: plain('SELECT action, entity_type, entity_id FROM audit_records').sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
    draft: {
      ...(db.prepare('SELECT status, validation_error FROM maintenance_transactions WHERE id = ?').get(draftId) as object),
    },
    interval: getRule(db, ruleId).lap_interval,
  };
}

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

test('a second first-time install on an occupied corner changes nothing', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit, part } = studFixture(db, 'occupied');
  const first = createDraftTransaction(db, admin, {
    idempotencyKey: 'occupied-first',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id),
  });
  commitTransaction(db, admin, first.id);
  const secondKit = openKit(
    db,
    admin,
    createKit(db, admin, { partId: part.id, humanLabel: 'SET-occupied-2', location: 'cabinet', notes: '' }).id,
  );
  const before = {
    installs: effectCounts(db).installations,
    baselines: effectCounts(db).baselines,
    stock: onHand(db, part.id),
    kitStatus: (db.prepare('SELECT status FROM kits WHERE id = ?').get(secondKit.id) as { status: string }).status,
  };
  const second = createDraftTransaction(db, admin, {
    idempotencyKey: 'occupied-second',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(secondKit, admin.id),
  });
  assert.throws(() => commitTransaction(db, admin, second.id), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 422);
    return true;
  });
  assert.equal(effectCounts(db).installations, before.installs);
  assert.equal(effectCounts(db).baselines, before.baselines);
  assert.equal(onHand(db, part.id), before.stock);
  assert.equal((db.prepare('SELECT status FROM kits WHERE id = ?').get(secondKit.id) as { status: string }).status, before.kitStatus);
  assert.equal(getTransaction(db, second.id).status, 'draft');
  assert.throws(() => {
    db.prepare(
      `INSERT INTO installations (
        id, component_id, vehicle_id, position, installed_at, installed_by_user_id, measurements_json,
        procedure_source, procedure_revision, notes, status, maintenance_transaction_id, created_at
      ) VALUES (?, ?, ?, 'LF-1', ?, ?, '{}', '', '', '', 'active', ?, ?)`,
    ).run(newId(), secondKit.components[0].id, vehicle.id, new Date().toISOString(), admin.id, first.id, new Date().toISOString());
  }, /UNIQUE/);
  assert.equal(effectCounts(db).installations, before.installs);
  db.close();
});

test('sign-off records the signer and server time, and an inactive signer is rejected', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit, part } = studFixture(db, 'signoff');
  const clientTime = '1999-01-01T00:00:00.000Z';
  const draft = createDraftTransaction(db, admin, {
    idempotencyKey: 'signoff-active',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id, {
      signoffs: [{ label: 'work_completed', userId: admin.id, signedAt: clientTime }],
    }),
  });
  const committed = commitTransaction(db, admin, draft.id);
  const recorded = committed.transaction.recordedSignoffs as { userId: string; label: string; signedAt: string }[];
  assert.equal(recorded[0].userId, admin.id);
  assert.equal(recorded[0].label, 'work_completed');
  assert.notEqual(recorded[0].signedAt, clientTime);
  assert.ok(Math.abs(Date.parse(recorded[0].signedAt) - Date.now()) < 60_000);

  const inactive = createUser(db, admin, {
    username: 'former',
    displayName: 'Former crew',
    role: 'race_day',
    password: 'long-enough',
  });
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(inactive.id);
  const secondKit = openKit(
    db,
    admin,
    createKit(db, admin, { partId: part.id, humanLabel: 'SET-signoff-2', location: 'cabinet', notes: '' }).id,
  );
  const before = effectCounts(db);
  const stock = onHand(db, part.id);
  const rejected = createDraftTransaction(db, admin, {
    idempotencyKey: 'signoff-inactive',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(secondKit, admin.id, {
      wheel: 'RF',
      signoffs: [{ label: 'work_completed', userId: inactive.id, signedAt: clientTime }],
    }),
  });
  assert.throws(() => commitTransaction(db, admin, rejected.id), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 422);
    return true;
  });
  assert.deepEqual(effectCounts(db), before);
  assert.equal(onHand(db, part.id), stock);
  assert.equal(getTransaction(db, rejected.id).status, 'draft');
  assert.deepEqual(getTransaction(db, rejected.id).recordedSignoffs, []);
  db.close();
});

test('a crew user cannot sign off as another user, and a self sign-off records server time', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit, part } = studFixture(db, 'crew-signer');
  const crew = actor(db, 'crew');
  const other = createUser(db, admin, {
    username: 'other',
    displayName: 'Other crew',
    role: 'race_day',
    password: 'long-enough',
  });
  const clientTime = '1999-01-01T00:00:00.000Z';
  const rejected = [
    studPayload(kit, crew.id, { signoffs: [{ label: 'work_completed', userId: admin.id, signedAt: clientTime }] }),
    studPayload(kit, crew.id, { signoffs: [{ label: 'work_completed', userId: other.id }] }),
    studPayload(kit, crew.id, {
      signoffs: [{ label: 'work_completed', userId: admin.id, adminVerified: true }],
    }),
    studPayload(kit, admin.id, { signoffs: ['work_completed'] }),
  ];
  for (const [index, payload] of rejected.entries()) {
    const draft = createDraftTransaction(db, crew, {
      idempotencyKey: `crew-reject-${index}`,
      vehicleId: vehicle.id,
      ruleId: rule.id,
      kind: 'initial_installation',
      payload,
    });
    const before = effectCounts(db);
    const stock = onHand(db, part.id);
    assert.throws(() => commitTransaction(db, crew, draft.id), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 422);
      return true;
    });
    assert.deepEqual(effectCounts(db), before);
    assert.equal(onHand(db, part.id), stock);
    assert.equal(getTransaction(db, draft.id).status, 'draft');
    assert.deepEqual(getTransaction(db, draft.id).recordedSignoffs, []);
  }
  const accepted = createDraftTransaction(db, crew, {
    idempotencyKey: 'crew-self',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, crew.id, {
      signoffs: [{ label: 'work_completed', userId: crew.id, signedAt: clientTime }],
    }),
  });
  const committed = commitTransaction(db, crew, accepted.id);
  const recorded = committed.transaction.recordedSignoffs as { userId: string; label: string; signedAt: string }[];
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].userId, crew.id);
  assert.equal(recorded[0].label, 'work_completed');
  assert.notEqual(recorded[0].signedAt, clientTime);
  assert.ok(Math.abs(Date.parse(recorded[0].signedAt) - Date.now()) < 60_000);
  assert.equal(onHand(db, part.id), 0);
  db.close();
});

test('an administrator can record only an explicitly verified active signer', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit, part } = studFixture(db, 'admin-verify');
  const crew = actor(db, 'crew');
  const unnamed = createDraftTransaction(db, admin, {
    idempotencyKey: 'admin-unverified',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id, { signoffs: [{ label: 'work_completed', userId: crew.id }] }),
  });
  assert.throws(() => commitTransaction(db, admin, unnamed.id), (error: unknown) => error instanceof AppError && error.status === 422);
  assert.equal(onHand(db, part.id), 1);
  assert.equal(getTransaction(db, unnamed.id).status, 'draft');

  const inactive = createUser(db, admin, {
    username: 'inactive-signer',
    displayName: 'Inactive',
    role: 'race_day',
    password: 'long-enough',
  });
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(inactive.id);
  const inactiveDraft = createDraftTransaction(db, admin, {
    idempotencyKey: 'admin-inactive-verified',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id, {
      signoffs: [{ label: 'work_completed', userId: inactive.id, adminVerified: true }],
    }),
  });
  assert.throws(() => commitTransaction(db, admin, inactiveDraft.id), (error: unknown) => error instanceof AppError && error.status === 422);
  assert.equal(effectCounts(db).consumes, 0);

  const verified = createDraftTransaction(db, admin, {
    idempotencyKey: 'admin-verified',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id, {
      signoffs: [{ label: 'work_completed', userId: crew.id, adminVerified: true, signedAt: '1999-01-01T00:00:00.000Z' }],
    }),
  });
  const committed = commitTransaction(db, admin, verified.id);
  const recorded = committed.transaction.recordedSignoffs as { userId: string; signedAt: string }[];
  assert.equal(recorded[0].userId, crew.id);
  assert.notEqual(recorded[0].signedAt, '1999-01-01T00:00:00.000Z');
  assert.ok(Math.abs(Date.parse(recorded[0].signedAt) - Date.now()) < 60_000);
  db.close();
});

test('a kit changed after validation is not consumed', () => {
  const db = tempDb();
  const { admin, vehicle, rule, kit, part } = studFixture(db, 'race');
  const draft = createDraftTransaction(db, admin, {
    idempotencyKey: 'kit-race',
    vehicleId: vehicle.id,
    ruleId: rule.id,
    kind: 'initial_installation',
    payload: studPayload(kit, admin.id),
  });
  const before = ledgerSnapshot(db, draft.id, rule.id, part.id);
  setCommitTestHook(draft.id, (database) => {
    database.prepare(`UPDATE kits SET status = 'sealed' WHERE id = ?`).run(kit.id);
  });
  assert.throws(() => commitTransaction(db, admin, draft.id), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 422);
    return true;
  });
  const after = ledgerSnapshot(db, draft.id, rule.id, part.id);
  assert.equal(after.stock, before.stock);
  assert.deepEqual(after.kits, before.kits);
  assert.deepEqual(after.components, before.components);
  assert.deepEqual(after.installs, before.installs);
  assert.deepEqual(after.removals, before.removals);
  assert.deepEqual(after.baselines, before.baselines);
  assert.equal(after.interval, before.interval);
  assert.equal((after.draft as { status: string }).status, 'draft');
  db.close();
});
