import type { DatabaseSync } from 'node:sqlite';
import { audit } from './audit.ts';
import type { User } from './auth.ts';
import { assertAdmin, findUserById } from './auth.ts';
import { many, newId, nowIso, one, rethrowSqlite, withTransaction } from './db.ts';
import { AppError } from './errors.ts';
import { getKit, getPart } from './inventory.ts';
import type { RuleAction } from './status.ts';

const WHEELS = new Set(['LF', 'RF', 'LR', 'RR']);
const DISPOSITIONS = new Set(['reused', 'failed', 'scrapped', 'inspected', 'retained_as_evidence', 'unknown']);
const DISPOSITION_STATUS: Record<string, string> = {
  reused: 'removed',
  failed: 'failed',
  scrapped: 'scrapped',
  inspected: 'removed',
  retained_as_evidence: 'evidence',
  unknown: 'removed',
};

export type RuleRow = {
  id: string;
  name: string;
  part_id: string | null;
  category: string;
  action: RuleAction;
  lap_interval: number | null;
  engine_hour_interval: number | null;
  calendar_interval_days: number | null;
  warning_threshold_laps: number | null;
  warning_threshold_hours: number | null;
  warning_threshold_days: number | null;
  critical_threshold_laps: number | null;
  critical_threshold_hours: number | null;
  critical_threshold_days: number | null;
  required_measurements_json: string;
  required_signoffs_json: string;
  procedure_source: string;
  procedure_revision: string;
  safety_critical: number;
  rule_status: 'draft' | 'active' | 'retired';
  illustrative_draft: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type MeasurementSpec = {
  key: string;
  label?: string;
  min?: number | null;
  max?: number | null;
  unit?: string;
};

export type StudLine = {
  index: number;
  componentId: string;
  oldComponentId?: string;
};

export type StudWorkPayload = {
  kitId: string;
  wheel: 'LF' | 'RF' | 'LR' | 'RR';
  studs: StudLine[];
  lapReading: number | null;
  engineHoursReading: number | null;
  performedAt: string;
  measurements: Record<string, number | string>;
  signoffs: string[];
  technicianUserId: string;
  notes: string;
  removalReason?: string;
  disposition?: string;
  failureEvidenceNotes?: string;
};

type RuleWrite = {
  name: string;
  partId: string | null;
  category: string;
  action: RuleAction;
  lapInterval: number | null;
  engineHourInterval: number | null;
  calendarIntervalDays: number | null;
  warningThresholdLaps: number | null;
  warningThresholdHours: number | null;
  warningThresholdDays: number | null;
  criticalThresholdLaps: number | null;
  criticalThresholdHours: number | null;
  criticalThresholdDays: number | null;
  requiredMeasurements: MeasurementSpec[];
  requiredSignoffs: string[];
  procedureSource: string;
  procedureRevision: string;
  safetyCritical: boolean;
  ruleStatus: 'draft' | 'active' | 'retired';
  illustrativeDraft: boolean;
};

export function mapRule(rule: RuleRow) {
  return {
    id: rule.id,
    name: rule.name,
    partId: rule.part_id,
    category: rule.category,
    action: rule.action,
    lapInterval: rule.lap_interval,
    engineHourInterval: rule.engine_hour_interval,
    calendarIntervalDays: rule.calendar_interval_days,
    warningThresholdLaps: rule.warning_threshold_laps,
    warningThresholdHours: rule.warning_threshold_hours,
    warningThresholdDays: rule.warning_threshold_days,
    criticalThresholdLaps: rule.critical_threshold_laps,
    criticalThresholdHours: rule.critical_threshold_hours,
    criticalThresholdDays: rule.critical_threshold_days,
    requiredMeasurements: parseJson<MeasurementSpec[]>(rule.required_measurements_json, []),
    requiredSignoffs: parseJson<string[]>(rule.required_signoffs_json, []),
    procedureSource: rule.procedure_source,
    procedureRevision: rule.procedure_revision,
    safetyCritical: rule.safety_critical === 1,
    ruleStatus: rule.rule_status,
    illustrativeDraft: rule.illustrative_draft === 1,
    label: rule.illustrative_draft === 1 ? 'ILLUSTRATIVE DRAFT — not an approved interval' : null,
    createdByUserId: rule.created_by_user_id,
    createdAt: rule.created_at,
    updatedAt: rule.updated_at,
  };
}

export function listRules(db: DatabaseSync) {
  return many<RuleRow>(db, 'SELECT * FROM maintenance_rules ORDER BY created_at').map(mapRule);
}

export function getRule(db: DatabaseSync, id: string): RuleRow {
  const rule = one<RuleRow>(db, 'SELECT * FROM maintenance_rules WHERE id = ?', [id]);
  if (!rule) throw new AppError(404, 'Maintenance rule was not found.', 'not_found');
  return rule;
}

export function createRule(db: DatabaseSync, actor: User, input: RuleWrite) {
  assertAdmin(actor, 'Race-day users cannot create or change maintenance rules.');
  validateRuleWrite(db, input);
  const id = newId();
  const createdAt = nowIso();
  try {
    db.prepare(
      `INSERT INTO maintenance_rules (
        id, name, part_id, category, action, lap_interval, engine_hour_interval, calendar_interval_days,
        warning_threshold_laps, warning_threshold_hours, warning_threshold_days,
        critical_threshold_laps, critical_threshold_hours, critical_threshold_days,
        required_measurements_json, required_signoffs_json, procedure_source, procedure_revision,
        safety_critical, rule_status, illustrative_draft, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.partId,
      input.category,
      input.action,
      input.lapInterval,
      input.engineHourInterval,
      input.calendarIntervalDays,
      input.warningThresholdLaps,
      input.warningThresholdHours,
      input.warningThresholdDays,
      input.criticalThresholdLaps,
      input.criticalThresholdHours,
      input.criticalThresholdDays,
      JSON.stringify(input.requiredMeasurements),
      JSON.stringify(input.requiredSignoffs),
      input.procedureSource,
      input.procedureRevision,
      input.safetyCritical ? 1 : 0,
      input.ruleStatus,
      input.illustrativeDraft ? 1 : 0,
      actor.id,
      createdAt,
      createdAt,
    );
  } catch (error) {
    rethrowSqlite(error);
  }
  const rule = getRule(db, id);
  audit(db, { actorUserId: actor.id, action: 'rule_created', entityType: 'maintenance_rule', entityId: id, after: mapRule(rule) });
  return mapRule(rule);
}

export function updateRule(db: DatabaseSync, actor: User, id: string, input: RuleWrite) {
  assertAdmin(actor, 'Race-day users cannot create or change maintenance rules.');
  const before = getRule(db, id);
  validateRuleWrite(db, input);
  const updatedAt = nowIso();
  try {
    db.prepare(
      `UPDATE maintenance_rules SET
        name = ?, part_id = ?, category = ?, action = ?, lap_interval = ?, engine_hour_interval = ?,
        calendar_interval_days = ?, warning_threshold_laps = ?, warning_threshold_hours = ?, warning_threshold_days = ?,
        critical_threshold_laps = ?, critical_threshold_hours = ?, critical_threshold_days = ?,
        required_measurements_json = ?, required_signoffs_json = ?, procedure_source = ?, procedure_revision = ?,
        safety_critical = ?, rule_status = ?, illustrative_draft = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.name,
      input.partId,
      input.category,
      input.action,
      input.lapInterval,
      input.engineHourInterval,
      input.calendarIntervalDays,
      input.warningThresholdLaps,
      input.warningThresholdHours,
      input.warningThresholdDays,
      input.criticalThresholdLaps,
      input.criticalThresholdHours,
      input.criticalThresholdDays,
      JSON.stringify(input.requiredMeasurements),
      JSON.stringify(input.requiredSignoffs),
      input.procedureSource,
      input.procedureRevision,
      input.safetyCritical ? 1 : 0,
      input.ruleStatus,
      input.illustrativeDraft ? 1 : 0,
      updatedAt,
      id,
    );
  } catch (error) {
    rethrowSqlite(error);
  }
  const after = getRule(db, id);
  audit(db, {
    actorUserId: actor.id,
    action: 'rule_updated',
    entityType: 'maintenance_rule',
    entityId: id,
    before: mapRule(before),
    after: mapRule(after),
  });
  return mapRule(after);
}

function validateRuleWrite(db: DatabaseSync, input: RuleWrite): void {
  if (!['inspect', 'replace', 'inspect_and_replace'].includes(input.action)) {
    throw new AppError(400, 'action must be inspect, replace, or inspect_and_replace.', 'validation');
  }
  if (!['draft', 'active', 'retired'].includes(input.ruleStatus)) {
    throw new AppError(400, 'ruleStatus must be draft, active, or retired.', 'validation');
  }
  if (input.illustrativeDraft && input.ruleStatus !== 'draft') {
    throw new AppError(400, 'An illustrative draft cannot be marked active or retired. It is not an approved interval.', 'validation');
  }
  if (!input.procedureSource.trim() || !input.procedureRevision.trim()) {
    throw new AppError(400, 'procedureSource and procedureRevision are required. This system does not supply them.', 'validation');
  }
  for (const [key, value] of [
    ['lapInterval', input.lapInterval],
    ['engineHourInterval', input.engineHourInterval],
    ['calendarIntervalDays', input.calendarIntervalDays],
    ['warningThresholdLaps', input.warningThresholdLaps],
    ['warningThresholdHours', input.warningThresholdHours],
    ['warningThresholdDays', input.warningThresholdDays],
    ['criticalThresholdLaps', input.criticalThresholdLaps],
    ['criticalThresholdHours', input.criticalThresholdHours],
    ['criticalThresholdDays', input.criticalThresholdDays],
  ] as const) {
    if (value !== null && value < 0) throw new AppError(400, `${key} cannot be negative.`, 'validation');
  }
  if (input.partId) getPart(db, input.partId);
  if (!Array.isArray(input.requiredSignoffs) || input.requiredSignoffs.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new AppError(400, 'requiredSignoffs must be an array of strings.', 'validation');
  }
  if (!Array.isArray(input.requiredMeasurements)) {
    throw new AppError(400, 'requiredMeasurements must be an array.', 'validation');
  }
  for (const measurement of input.requiredMeasurements) {
    if (!measurement || typeof measurement.key !== 'string' || !measurement.key.trim()) {
      throw new AppError(400, 'Each required measurement needs a key.', 'validation');
    }
  }
}

export function createDraftTransaction(
  db: DatabaseSync,
  actor: User,
  input: { idempotencyKey: string; vehicleId: string; ruleId: string; kind: string; payload: unknown },
) {
  if (!['initial_installation', 'replacement', 'inspection_only'].includes(input.kind)) {
    throw new AppError(400, 'kind must be initial_installation, replacement, or inspection_only.', 'validation');
  }
  getVehicle(db, input.vehicleId);
  getRule(db, input.ruleId);
  const existing = one<{ id: string; payload_json: string; created_by_user_id: string }>(
    db,
    'SELECT id, payload_json, created_by_user_id FROM maintenance_transactions WHERE idempotency_key = ?',
    [input.idempotencyKey],
  );
  if (existing) {
    if (existing.payload_json !== JSON.stringify(input.payload) || existing.created_by_user_id !== actor.id) {
      throw new AppError(409, 'That idempotency key was already used for a different transaction.', 'conflict');
    }
    return getTransaction(db, existing.id);
  }
  const id = newId();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO maintenance_transactions (
      id, idempotency_key, vehicle_id, rule_id, kind, status, payload_json, validation_error,
      created_by_user_id, created_at, committed_at, committed_by_user_id
    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, NULL, ?, ?, NULL, NULL)`,
  ).run(id, input.idempotencyKey, input.vehicleId, input.ruleId, input.kind, JSON.stringify(input.payload), actor.id, createdAt);
  audit(db, {
    actorUserId: actor.id,
    action: 'transaction_drafted',
    entityType: 'maintenance_transaction',
    entityId: id,
    after: { kind: input.kind, status: 'draft' },
  });
  return getTransaction(db, id);
}

export function getTransaction(db: DatabaseSync, id: string) {
  const row = one<Record<string, unknown>>(db, 'SELECT * FROM maintenance_transactions WHERE id = ?', [id]);
  if (!row) throw new AppError(404, 'Maintenance transaction was not found.', 'not_found');
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    vehicleId: String(row.vehicle_id),
    ruleId: row.rule_id ? String(row.rule_id) : null,
    kind: String(row.kind),
    status: String(row.status),
    payload: parseJson(String(row.payload_json), null),
    validationError: row.validation_error ? String(row.validation_error) : null,
    createdByUserId: String(row.created_by_user_id),
    createdAt: String(row.created_at),
    committedAt: row.committed_at ? String(row.committed_at) : null,
    committedByUserId: row.committed_by_user_id ? String(row.committed_by_user_id) : null,
  };
}

export function abortTransaction(db: DatabaseSync, actor: User, id: string) {
  const current = getTransaction(db, id);
  if (current.status === 'aborted') return current;
  if (current.status !== 'draft') throw new AppError(409, 'Only a draft transaction can be aborted.', 'conflict');
  db.prepare(`UPDATE maintenance_transactions SET status = 'aborted', validation_error = NULL WHERE id = ?`).run(id);
  audit(db, { actorUserId: actor.id, action: 'transaction_aborted', entityType: 'maintenance_transaction', entityId: id });
  return getTransaction(db, id);
}

export function commitTransaction(db: DatabaseSync, actor: User, id: string) {
  const current = getTransaction(db, id);
  if (current.status === 'committed') return { transaction: current, alreadyCommitted: true };
  if (current.status !== 'draft') throw new AppError(409, 'Only a draft transaction can be committed.', 'conflict');
  const rule = getRule(db, String(current.ruleId));
  const validationError = validateCommit(db, current.kind, current.payload, rule, current.vehicleId);
  if (validationError) {
    db.prepare('UPDATE maintenance_transactions SET validation_error = ? WHERE id = ? AND status = ?').run(validationError, id, 'draft');
    throw new AppError(422, validationError, 'incomplete_transaction');
  }
  const countsBefore = effectCounts(db);
  try {
    withTransaction(db, () => {
      const fresh = one<{ status: string }>(db, 'SELECT status FROM maintenance_transactions WHERE id = ?', [id]);
      if (!fresh) throw new AppError(404, 'Maintenance transaction was not found.', 'not_found');
      if (fresh.status === 'committed') return;
      if (fresh.status !== 'draft') throw new AppError(409, 'Only a draft transaction can be committed.', 'conflict');
      const committedAt = nowIso();
      db.prepare(
        `UPDATE maintenance_transactions
         SET status = 'committed', committed_at = ?, committed_by_user_id = ?, validation_error = NULL
         WHERE id = ?`,
      ).run(committedAt, actor.id, id);
      if (current.kind === 'inspection_only') {
        insertInspection(db, actor, inspectionFromPayload(current.payload, current.vehicleId, String(current.ruleId), id));
      } else {
        applyStudWork(db, actor, id, current.kind, current.payload as StudWorkPayload, rule, current.vehicleId);
      }
      audit(db, {
        actorUserId: actor.id,
        action: 'transaction_committed',
        entityType: 'maintenance_transaction',
        entityId: id,
        after: { kind: current.kind, status: 'committed' },
      });
    });
  } catch (error) {
    const countsAfter = effectCounts(db);
    if (countsAfter.baselines !== countsBefore.baselines || countsAfter.consumes !== countsBefore.consumes) {
      throw new Error('Rolled-back transaction changed stock or baselines.');
    }
    rethrowSqlite(error);
  }
  return { transaction: getTransaction(db, id), alreadyCommitted: false };
}

export function effectCounts(db: DatabaseSync): { baselines: number; consumes: number; installations: number } {
  const baselines = one<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM service_baselines')?.c ?? 0;
  const consumes = one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM stock_movements WHERE movement_type = 'consume'`,
  )?.c ?? 0;
  const installations = one<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM installations')?.c ?? 0;
  return { baselines, consumes, installations };
}

function validateCommit(db: DatabaseSync, kind: string, payload: unknown, rule: RuleRow, vehicleId: string): string | null {
  if (rule.rule_status !== 'active') return 'The maintenance rule is not active. A draft or retired rule cannot establish a baseline or consume stock.';
  if (rule.illustrative_draft === 1) return 'Illustrative draft rules cannot be used for maintenance transactions.';
  if (kind === 'inspection_only') return validateInspectionPayload(payload);
  if (rule.lap_interval === null && rule.engine_hour_interval === null && rule.calendar_interval_days === null) {
    return 'The rule has no lap, engine-hour, or calendar interval. Refusing to invent one.';
  }
  return validateStudPayload(db, kind, payload, rule, vehicleId);
}

function validateInspectionPayload(payload: unknown): string | null {
  const body = asRecord(payload);
  if (!body) return 'Inspection payload must be an object.';
  if (!['pre_event', 'pre_session', 'component', 'other'].includes(String(body.inspectionKind))) {
    return 'inspectionKind is required.';
  }
  if (!['pass', 'fail', 'incomplete', 'unknown'].includes(String(body.result))) return 'Inspection result is required.';
  if (!isTimestamp(body.performedAt)) return 'performedAt is required and cannot be in the future.';
  return null;
}

function validateStudPayload(db: DatabaseSync, kind: string, payload: unknown, rule: RuleRow, vehicleId: string): string | null {
  const body = asRecord(payload);
  if (!body) return 'Transaction payload must be an object.';
  if (typeof body.kitId !== 'string' || !body.kitId) return 'kitId is required.';
  if (!WHEELS.has(String(body.wheel))) return 'wheel must be LF, RF, LR, or RR.';
  if (!Array.isArray(body.studs) || body.studs.length !== 5) return 'A sealed stud set transaction must include exactly five studs.';
  if (!isTimestamp(body.performedAt)) return 'performedAt is required and cannot be in the future.';
  if (!Array.isArray(body.signoffs) || body.signoffs.length === 0 || body.signoffs.some((item) => typeof item !== 'string' || !item.trim())) {
    return 'At least one sign-off is required. An empty or missing sign-off does not complete the transaction.';
  }
  const requiredSignoffs = parseJson<string[]>(rule.required_signoffs_json, []);
  for (const required of requiredSignoffs) {
    if (!body.signoffs.includes(required)) return `Missing required sign-off: ${required}.`;
  }
  if (typeof body.technicianUserId !== 'string' || !findUserById(db, body.technicianUserId)?.active) {
    return 'technicianUserId must be an active user.';
  }
  if (rule.lap_interval !== null && !isNonNegativeNumber(body.lapReading)) return 'A lap reading is required because the rule has a lap interval.';
  if (rule.engine_hour_interval !== null && !isNonNegativeNumber(body.engineHoursReading)) {
    return 'An engine-hour reading is required because the rule has an engine-hour interval.';
  }
  if (body.lapReading !== null && body.lapReading !== undefined && !isNonNegativeNumber(body.lapReading)) return 'lapReading must be a number or null.';
  if (body.engineHoursReading !== null && body.engineHoursReading !== undefined && !isNonNegativeNumber(body.engineHoursReading)) {
    return 'engineHoursReading must be a number or null.';
  }
  const measurements = asRecord(body.measurements) ?? {};
  const measurementError = measurementProblems(rule, measurements);
  if (measurementError) return measurementError;
  if (!rule.part_id) return 'The rule is not linked to a part, so it cannot consume a sealed set.';

  let kit;
  try {
    kit = getKit(db, String(body.kitId));
  } catch {
    return 'Kit was not found.';
  }
  if (kit.status !== 'opened') return 'The sealed set must be opened before its studs can be installed, and it cannot already be consumed.';
  if (kit.part_id !== rule.part_id) return 'The kit part does not match the part on the maintenance rule.';
  const kitComponents = many<{ id: string; status: string; kit_id: string }>(
    db,
    'SELECT id, status, kit_id FROM components WHERE kit_id = ?',
    [kit.id],
  );
  if (kitComponents.length !== 5) return 'The opened set does not contain exactly five studs.';

  const seenIndexes = new Set<number>();
  const seenComponents = new Set<string>();
  const seenOld = new Set<string>();
  for (const raw of body.studs as unknown[]) {
    const line = asRecord(raw);
    if (!line) return 'Each stud line must be an object.';
    const index = line.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 1 || index > 5 || seenIndexes.has(index)) {
      return 'Stud positions must be 1 through 5 with no duplicates.';
    }
    seenIndexes.add(index);
    if (typeof line.componentId !== 'string' || seenComponents.has(line.componentId)) return 'Each new stud component must be present exactly once.';
    seenComponents.add(line.componentId);
    const component = kitComponents.find((item) => item.id === line.componentId);
    if (!component || component.status !== 'in_stock') return 'Every new stud must be an in-stock component from the same sealed set.';
    if (kind === 'replacement') {
      if (typeof line.oldComponentId !== 'string' || !line.oldComponentId) return 'Replacement requires the old component id for every stud.';
      if (line.oldComponentId === line.componentId || seenOld.has(line.oldComponentId)) {
        return 'Old component ids must be unique and different from the new studs.';
      }
      seenOld.add(String(line.oldComponentId));
      const position = `${body.wheel}-${index}`;
      const installation = one(
        db,
        `SELECT id FROM installations
         WHERE component_id = ? AND vehicle_id = ? AND position = ? AND status = 'active'`,
        [line.oldComponentId, vehicleId, position],
      );
      if (!installation) return `No active installation was found for the old stud at ${position}.`;
    }
  }
  if (kind === 'replacement') {
    if (typeof body.removalReason !== 'string' || !body.removalReason.trim()) return 'removalReason is required.';
    if (!DISPOSITIONS.has(String(body.disposition))) return 'disposition is required.';
  }
  return null;
}

function measurementProblems(rule: RuleRow, measurements: Record<string, unknown>): string | null {
  const specs = parseJson<MeasurementSpec[]>(rule.required_measurements_json, []);
  for (const spec of specs) {
    if (!Object.prototype.hasOwnProperty.call(measurements, spec.key)) return `Missing required measurement: ${spec.key}.`;
    const value = measurements[spec.key];
    if ((spec.min !== null && spec.min !== undefined) || (spec.max !== null && spec.max !== undefined)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `Measurement ${spec.key} must be a number.`;
      if (spec.min !== null && spec.min !== undefined && value < spec.min) return `Measurement ${spec.key} is below the administrator-entered minimum.`;
      if (spec.max !== null && spec.max !== undefined && value > spec.max) return `Measurement ${spec.key} is above the administrator-entered maximum.`;
    }
  }
  return null;
}

function applyStudWork(
  db: DatabaseSync,
  actor: User,
  transactionId: string,
  kind: string,
  payload: StudWorkPayload,
  rule: RuleRow,
  vehicleId: string,
): void {
  const createdAt = nowIso();
  const measurements = JSON.stringify(payload.measurements ?? {});
  for (const stud of [...payload.studs].sort((a, b) => a.index - b.index)) {
    const position = `${payload.wheel}-${stud.index}`;
    if (kind === 'replacement') {
      const installation = one<{ id: string; component_id: string }>(
        db,
        `SELECT id, component_id FROM installations
         WHERE component_id = ? AND vehicle_id = ? AND position = ? AND status = 'active'`,
        [stud.oldComponentId, vehicleId, position],
      );
      if (!installation) throw new AppError(422, `No active installation was found at ${position}.`, 'incomplete_transaction');
      db.prepare(
        `INSERT INTO removals (
          id, installation_id, component_id, removed_at, removed_by_user_id, lap_reading, engine_hours_reading,
          reason, disposition, failure_evidence_notes, notes, maintenance_transaction_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(),
        installation.id,
        stud.oldComponentId,
        payload.performedAt,
        actor.id,
        payload.lapReading,
        payload.engineHoursReading,
        payload.removalReason,
        payload.disposition,
        payload.failureEvidenceNotes ?? '',
        payload.notes ?? '',
        transactionId,
        createdAt,
      );
      db.prepare(`UPDATE installations SET status = 'superseded' WHERE id = ?`).run(installation.id);
      db.prepare(`UPDATE components SET status = ?, updated_at = ? WHERE id = ?`).run(
        DISPOSITION_STATUS[String(payload.disposition)] ?? 'removed',
        createdAt,
        stud.oldComponentId,
      );
    }
    db.prepare(
      `INSERT INTO installations (
        id, component_id, vehicle_id, position, installed_at, installed_by_user_id, lap_reading, engine_hours_reading,
        measurements_json, procedure_source, procedure_revision, notes, status, maintenance_transaction_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    ).run(
      newId(),
      stud.componentId,
      vehicleId,
      position,
      payload.performedAt,
      actor.id,
      payload.lapReading,
      payload.engineHoursReading,
      measurements,
      rule.procedure_source,
      rule.procedure_revision,
      payload.notes ?? '',
      transactionId,
      createdAt,
    );
    db.prepare(`UPDATE components SET status = 'installed', updated_at = ? WHERE id = ?`).run(createdAt, stud.componentId);
  }
  const remaining = one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM components WHERE kit_id = ? AND status = 'in_stock'`,
    [payload.kitId],
  );
  if (!remaining || remaining.c !== 0) {
    throw new AppError(422, 'The sealed set still has in-stock studs, so it was not consumed.', 'incomplete_transaction');
  }
  db.prepare(
    `UPDATE kits SET status = 'consumed', consumed_at = ?, consumed_by_transaction_id = ?, updated_at = ? WHERE id = ? AND status = 'opened'`,
  ).run(payload.performedAt, transactionId, createdAt, payload.kitId);
  const kit = getKit(db, payload.kitId);
  db.prepare(
    `INSERT INTO stock_movements (
      id, part_id, kit_id, movement_type, quantity_delta, authorized_negative_exception, exception_reason,
      maintenance_transaction_id, notes, actor_user_id, created_at
    ) VALUES (?, ?, ?, 'consume', -1, 0, NULL, ?, ?, ?, ?)`,
  ).run(newId(), kit.part_id, kit.id, transactionId, 'Consumed sealed set on committed maintenance transaction', actor.id, createdAt);
  db.prepare(
    `INSERT INTO service_baselines (
      id, rule_id, vehicle_id, position, baseline_laps, baseline_engine_hours, baseline_date,
      established_by_transaction_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    rule.id,
    vehicleId,
    payload.wheel,
    rule.lap_interval === null ? null : payload.lapReading,
    rule.engine_hour_interval === null ? null : payload.engineHoursReading,
    payload.performedAt,
    transactionId,
    createdAt,
  );
}

export function recordInspection(
  db: DatabaseSync,
  actor: User,
  input: {
    vehicleId: string;
    eventId: string | null;
    sessionId: string | null;
    ruleId: string | null;
    componentId: string | null;
    inspectionKind: string;
    result: string;
    measurements: Record<string, unknown>;
    notes: string;
    performedAt: string;
    maintenanceTransactionId: string | null;
  },
) {
  getVehicle(db, input.vehicleId);
  if (input.ruleId) getRule(db, input.ruleId);
  if (!['pre_event', 'pre_session', 'component', 'other'].includes(input.inspectionKind)) {
    throw new AppError(400, 'inspectionKind is invalid.', 'validation');
  }
  if (!['pass', 'fail', 'incomplete', 'unknown'].includes(input.result)) {
    throw new AppError(400, 'result must be pass, fail, incomplete, or unknown.', 'validation');
  }
  if (!isTimestamp(input.performedAt)) throw new AppError(400, 'performedAt is required and cannot be in the future.', 'validation');
  const before = effectCounts(db);
  const id = insertInspection(db, actor, input);
  const after = effectCounts(db);
  if (before.baselines !== after.baselines || before.consumes !== after.consumes) {
    throw new Error('Inspection changed stock or a service baseline.');
  }
  return one(db, 'SELECT * FROM inspections WHERE id = ?', [id]);
}

function insertInspection(
  db: DatabaseSync,
  actor: User,
  input: {
    vehicleId: string;
    eventId: string | null;
    sessionId: string | null;
    ruleId: string | null;
    componentId: string | null;
    inspectionKind: string;
    result: string;
    measurements: Record<string, unknown>;
    notes: string;
    performedAt: string;
    maintenanceTransactionId: string | null;
  },
): string {
  const id = newId();
  db.prepare(
    `INSERT INTO inspections (
      id, vehicle_id, event_id, session_id, rule_id, component_id, inspection_kind, result, measurements_json,
      notes, performed_by_user_id, performed_at, maintenance_transaction_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.vehicleId,
    input.eventId,
    input.sessionId,
    input.ruleId,
    input.componentId,
    input.inspectionKind,
    input.result,
    JSON.stringify(input.measurements ?? {}),
    input.notes,
    actor.id,
    input.performedAt,
    input.maintenanceTransactionId,
    nowIso(),
  );
  audit(db, {
    actorUserId: actor.id,
    action: 'inspection_recorded',
    entityType: 'inspection',
    entityId: id,
    after: { result: input.result, ruleId: input.ruleId },
  });
  return id;
}

function inspectionFromPayload(payload: unknown, vehicleId: string, ruleId: string, transactionId: string) {
  const body = asRecord(payload) ?? {};
  return {
    vehicleId,
    eventId: typeof body.eventId === 'string' ? body.eventId : null,
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
    ruleId,
    componentId: typeof body.componentId === 'string' ? body.componentId : null,
    inspectionKind: String(body.inspectionKind),
    result: String(body.result),
    measurements: (asRecord(body.measurements) ?? {}) as Record<string, unknown>,
    notes: typeof body.notes === 'string' ? body.notes : '',
    performedAt: String(body.performedAt),
    maintenanceTransactionId: transactionId,
  };
}

export function recordSession(
  db: DatabaseSync,
  actor: User,
  input: {
    vehicleId: string;
    eventId: string | null;
    name: string;
    lapsCompleted: number;
    engineHoursAdded: number;
    meterNote: string;
    notes: string;
  },
) {
  if (!input.name.trim()) throw new AppError(400, 'Session name is required.', 'validation');
  if (!isNonNegativeNumber(input.lapsCompleted) || !isNonNegativeNumber(input.engineHoursAdded)) {
    throw new AppError(400, 'lapsCompleted and engineHoursAdded must be zero or positive numbers.', 'validation');
  }
  const vehicle = getVehicle(db, input.vehicleId);
  if (input.eventId) {
    const event = one(db, 'SELECT id FROM events WHERE id = ? AND vehicle_id = ?', [input.eventId, vehicle.id]);
    if (!event) throw new AppError(404, 'Event was not found for this vehicle.', 'not_found');
  }
  const before = effectCounts(db);
  const recordedAt = nowIso();
  const totalsBeforeWereUnknown = vehicle.laps_total === null || vehicle.engine_hours_total === null;
  const lapsTotal = (vehicle.laps_total ?? 0) + input.lapsCompleted;
  const hoursTotal = (vehicle.engine_hours_total ?? 0) + input.engineHoursAdded;
  const id = newId();
  withTransaction(db, () => {
    db.prepare(
      `UPDATE vehicles
       SET laps_total = ?, engine_hours_total = ?, usage_tracking_started_at = COALESCE(usage_tracking_started_at, ?), updated_at = ?
       WHERE id = ?`,
    ).run(lapsTotal, hoursTotal, recordedAt, recordedAt, vehicle.id);
    db.prepare(
      `INSERT INTO sessions (
        id, vehicle_id, event_id, name, laps_completed, engine_hours_added, laps_total_after, engine_hours_total_after,
        totals_before_were_unknown, meter_note, notes, recorded_by_user_id, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      vehicle.id,
      input.eventId,
      input.name,
      input.lapsCompleted,
      input.engineHoursAdded,
      lapsTotal,
      hoursTotal,
      totalsBeforeWereUnknown ? 1 : 0,
      input.meterNote,
      input.notes,
      actor.id,
      recordedAt,
    );
    audit(db, { actorUserId: actor.id, action: 'session_recorded', entityType: 'session', entityId: id });
  });
  const after = effectCounts(db);
  if (before.baselines !== after.baselines || before.consumes !== after.consumes) {
    throw new Error('Recording a session changed stock or a service baseline.');
  }
  return {
    ...(one(db, 'SELECT * FROM sessions WHERE id = ?', [id]) as object),
    usageMeaning: 'recorded_since_tracking_started',
    earlierLifeIsUnknown: totalsBeforeWereUnknown,
  };
}

export function createEvent(
  db: DatabaseSync,
  actor: User,
  input: {
    vehicleId: string;
    name: string;
    series: string;
    location: string;
    startsOn: string | null;
    endsOn: string | null;
    expectedLaps: number | null;
    expectedEngineHours: number | null;
    notes: string;
  },
) {
  assertAdmin(actor, 'Only an administrator can configure events.');
  getVehicle(db, input.vehicleId);
  if (!input.name.trim()) throw new AppError(400, 'Event name is required.', 'validation');
  const id = newId();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO events (
      id, vehicle_id, name, series, location, starts_on, ends_on, expected_laps, expected_engine_hours, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.vehicleId,
    input.name.trim(),
    input.series,
    input.location,
    input.startsOn,
    input.endsOn,
    input.expectedLaps,
    input.expectedEngineHours,
    input.notes,
    createdAt,
    createdAt,
  );
  audit(db, { actorUserId: actor.id, action: 'event_created', entityType: 'event', entityId: id });
  return one(db, 'SELECT * FROM events WHERE id = ?', [id]);
}

export function listEvents(db: DatabaseSync) {
  return many(db, 'SELECT * FROM events ORDER BY created_at');
}

export function reportDefect(
  db: DatabaseSync,
  actor: User,
  input: { vehicleId: string; componentId: string | null; locationNote: string; severity: string; notes: string },
) {
  getVehicle(db, input.vehicleId);
  if (!input.locationNote.trim() || !input.notes.trim()) throw new AppError(400, 'locationNote and notes are required.', 'validation');
  if (!['needs_review', 'critical'].includes(input.severity)) {
    throw new AppError(400, 'severity must be needs_review or critical.', 'validation');
  }
  const id = newId();
  const reportedAt = nowIso();
  db.prepare(
    `INSERT INTO defects (
      id, vehicle_id, component_id, location_note, severity, notes, status, reported_by_user_id, reported_at, resolved_at, resolution_notes
    ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL, '')`,
  ).run(id, input.vehicleId, input.componentId, input.locationNote.trim(), input.severity, input.notes.trim(), actor.id, reportedAt);
  audit(db, { actorUserId: actor.id, action: 'defect_reported', entityType: 'defect', entityId: id, after: { severity: input.severity } });
  return one(db, 'SELECT * FROM defects WHERE id = ?', [id]);
}

export function resolveDefect(db: DatabaseSync, actor: User, id: string, resolutionNotes: string) {
  const defect = one<{ id: string; status: string }>(db, 'SELECT id, status FROM defects WHERE id = ?', [id]);
  if (!defect) throw new AppError(404, 'Defect was not found.', 'not_found');
  if (!resolutionNotes.trim()) throw new AppError(400, 'resolutionNotes are required.', 'validation');
  db.prepare(`UPDATE defects SET status = 'resolved', resolved_at = ?, resolution_notes = ? WHERE id = ?`).run(
    nowIso(),
    resolutionNotes.trim(),
    id,
  );
  audit(db, { actorUserId: actor.id, action: 'defect_resolved', entityType: 'defect', entityId: id });
  return one(db, 'SELECT * FROM defects WHERE id = ?', [id]);
}

export function listDefects(db: DatabaseSync) {
  return many(db, 'SELECT * FROM defects ORDER BY reported_at DESC');
}

export function getVehicle(db: DatabaseSync, id: string) {
  const vehicle = one<{
    id: string;
    name: string;
    year: number | null;
    make: string | null;
    model: string | null;
    notes: string;
    laps_total: number | null;
    engine_hours_total: number | null;
    usage_tracking_started_at: string | null;
    created_at: string;
    updated_at: string;
  }>(db, 'SELECT * FROM vehicles WHERE id = ?', [id]);
  if (!vehicle) throw new AppError(404, 'Vehicle was not found.', 'not_found');
  return vehicle;
}

export function mapVehicle(vehicle: ReturnType<typeof getVehicle>) {
  return {
    id: vehicle.id,
    name: vehicle.name,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    notes: vehicle.notes,
    lapsTotal: vehicle.laps_total,
    engineHoursTotal: vehicle.engine_hours_total,
    lapsKnown: vehicle.laps_total !== null,
    engineHoursKnown: vehicle.engine_hours_total !== null,
    usageMeaning: 'recorded_since_tracking_started',
    usageTrackingStartedAt: vehicle.usage_tracking_started_at,
    createdAt: vehicle.created_at,
    updatedAt: vehicle.updated_at,
  };
}

export function listVehicles(db: DatabaseSync) {
  return many<{ id: string }>(db, 'SELECT id FROM vehicles ORDER BY created_at').map((row) => mapVehicle(getVehicle(db, row.id)));
}

export function createVehicle(
  db: DatabaseSync,
  actor: User,
  input: { name: string; year: number | null; make: string; model: string; notes: string },
) {
  assertAdmin(actor, 'Only an administrator can add vehicles.');
  if (!input.name.trim()) throw new AppError(400, 'Vehicle name is required.', 'validation');
  const id = newId();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO vehicles (
      id, name, year, make, model, notes, laps_total, engine_hours_total, usage_tracking_started_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
  ).run(id, input.name.trim(), input.year, input.make, input.model, input.notes, createdAt, createdAt);
  audit(db, { actorUserId: actor.id, action: 'vehicle_created', entityType: 'vehicle', entityId: id });
  return mapVehicle(getVehicle(db, id));
}

export function listInstallations(db: DatabaseSync) {
  return many(db, 'SELECT * FROM installations ORDER BY created_at');
}

export function listRemovals(db: DatabaseSync) {
  return many(db, 'SELECT * FROM removals ORDER BY created_at');
}

export function listInspections(db: DatabaseSync) {
  return many(db, 'SELECT * FROM inspections ORDER BY performed_at');
}

export function listSessions(db: DatabaseSync) {
  return many(db, 'SELECT * FROM sessions ORDER BY recorded_at');
}

export function listBaselines(db: DatabaseSync) {
  return many(db, 'SELECT * FROM service_baselines ORDER BY created_at');
}

export function listAudit(db: DatabaseSync, actor: User) {
  assertAdmin(actor, 'Only an administrator can read the audit log.');
  return many(db, 'SELECT * FROM audit_records ORDER BY created_at');
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function asRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isTimestamp(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return parsed <= Date.now() + 5 * 60 * 1000;
}
