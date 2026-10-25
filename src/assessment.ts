import type { DatabaseSync } from 'node:sqlite';
import { many, one } from './db.ts';
import { getVehicle, mapVehicle, type RuleRow } from './maintenance.ts';
import {
  combineStatus,
  evaluateMetric,
  summarizeReadiness,
  type AssessmentItem,
  type InspectionResult,
  type MetricStatus,
} from './status.ts';

const CORNERS = ['LF', 'RF', 'LR', 'RR'] as const;

export function assessVehicle(db: DatabaseSync, vehicleId: string, now = new Date()) {
  const vehicle = getVehicle(db, vehicleId);
  const rules = many<RuleRow>(
    db,
    `SELECT * FROM maintenance_rules WHERE rule_status != 'retired' ORDER BY created_at`,
  );
  const items: AssessmentItem[] = rules.flatMap((rule) => {
    if (isSealedStudRule(db, rule)) return CORNERS.map((corner) => evaluateCorner(db, vehicle, rule, corner, now));
    return [evaluateCorner(db, vehicle, rule, null, now)];
  });
  const openCritical = one<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM defects WHERE vehicle_id = ? AND status = 'open' AND severity = 'critical'`,
    [vehicle.id],
  );
  return {
    vehicle: mapVehicle(vehicle),
    items,
    readiness: summarizeReadiness({ items, openCriticalDefects: openCritical?.c ?? 0 }),
  };
}

function isSealedStudRule(db: DatabaseSync, rule: RuleRow): boolean {
  if (!rule.part_id) return false;
  const part = one<{ kit_kind: string }>(db, 'SELECT kit_kind FROM parts WHERE id = ?', [rule.part_id]);
  return part?.kit_kind === 'sealed_stud_set';
}

function evaluateCorner(
  db: DatabaseSync,
  vehicle: ReturnType<typeof getVehicle>,
  rule: RuleRow,
  corner: (typeof CORNERS)[number] | null,
  now: Date,
): AssessmentItem {
  const kitIds = corner ? activeKitIds(db, vehicle.id, corner) : [];
  const kitId = kitIds.length === 1 ? kitIds[0] : null;
  const hasActiveSet = corner === null || kitIds.length === 1;
  const baseline = hasActiveSet
    ? one<{ baseline_laps: number | null; baseline_engine_hours: number | null; baseline_date: string }>(
        db,
        corner
          ? `SELECT baseline_laps, baseline_engine_hours, baseline_date
             FROM service_baselines
             WHERE rule_id = ? AND vehicle_id = ? AND position = ?
             ORDER BY created_at DESC
             LIMIT 1`
          : `SELECT baseline_laps, baseline_engine_hours, baseline_date
             FROM service_baselines
             WHERE rule_id = ? AND vehicle_id = ? AND position IS NULL
             ORDER BY created_at DESC
             LIMIT 1`,
        corner ? [rule.id, vehicle.id, corner] : [rule.id, vehicle.id],
      )
    : undefined;
  const inspection = hasActiveSet
    ? one<{ result: InspectionResult }>(
        db,
        `SELECT result FROM inspections
         WHERE rule_id = ? AND vehicle_id = ?
         ORDER BY performed_at DESC
         LIMIT 1`,
        [rule.id, vehicle.id],
      )
    : undefined;

  const unknownMetrics = {
    laps: (rule.lap_interval === null ? 'not_applicable' : 'unknown') as MetricStatus,
    engineHours: (rule.engine_hour_interval === null ? 'not_applicable' : 'unknown') as MetricStatus,
    calendar: (rule.calendar_interval_days === null ? 'not_applicable' : 'unknown') as MetricStatus,
  };

  let metrics = unknownMetrics;
  let combined = {
    status: 'unknown' as AssessmentItem['status'],
    reasons: [
      corner
        ? `No stud set is recorded at ${corner}. Missing data is unknown, not healthy.`
        : 'No baseline is recorded. Missing data is unknown, not healthy.',
    ],
  };

  if (hasActiveSet) {
    let calendarCurrent: number | null = null;
    let calendarBaseline: number | null = null;
    if (rule.calendar_interval_days !== null && baseline?.baseline_date) {
      calendarBaseline = 0;
      calendarCurrent = (now.getTime() - Date.parse(baseline.baseline_date)) / 86_400_000;
    }
    metrics = {
      laps: evaluateMetric({
        interval: rule.lap_interval,
        warning: rule.warning_threshold_laps,
        critical: rule.critical_threshold_laps,
        baseline: baseline?.baseline_laps ?? null,
        current: vehicle.laps_total,
      }),
      engineHours: evaluateMetric({
        interval: rule.engine_hour_interval,
        warning: rule.warning_threshold_hours,
        critical: rule.critical_threshold_hours,
        baseline: baseline?.baseline_engine_hours ?? null,
        current: vehicle.engine_hours_total,
      }),
      calendar: evaluateMetric({
        interval: rule.calendar_interval_days,
        warning: rule.warning_threshold_days,
        critical: rule.critical_threshold_days,
        baseline: calendarBaseline,
        current: calendarCurrent,
      }),
    };
    combined = combineStatus({
      metrics,
      action: rule.action,
      latestInspection: inspection?.result ?? null,
    });
  }

  const name = corner ? `${rule.name} ${corner}` : rule.name;
  return {
    ruleId: rule.id,
    name,
    corner,
    kitId,
    safetyCritical: rule.safety_critical === 1,
    illustrativeDraft: rule.illustrative_draft === 1,
    ruleStatus: rule.rule_status,
    status: combined.status,
    metrics,
    reasons: combined.reasons,
    label: rule.illustrative_draft === 1 ? 'ILLUSTRATIVE DRAFT — not an approved interval' : null,
  };
}

function activeKitIds(db: DatabaseSync, vehicleId: string, corner: string): string[] {
  const rows = many<{ kit_id: string | null }>(
    db,
    `SELECT DISTINCT c.kit_id AS kit_id
     FROM installations i
     JOIN components c ON c.id = i.component_id
     WHERE i.vehicle_id = ? AND i.status = 'active' AND i.position LIKE ?`,
    [vehicleId, `${corner}-%`],
  );
  return rows.map((row) => row.kit_id).filter((id): id is string => Boolean(id));
}
