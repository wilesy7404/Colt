import type { DatabaseSync } from 'node:sqlite';
import { many, one } from './db.ts';
import { getVehicle, mapVehicle, type RuleRow } from './maintenance.ts';
import { combineStatus, evaluateMetric, summarizeReadiness, type AssessmentItem, type InspectionResult } from './status.ts';

export function assessVehicle(db: DatabaseSync, vehicleId: string, now = new Date()) {
  const vehicle = getVehicle(db, vehicleId);
  const rules = many<RuleRow>(
    db,
    `SELECT * FROM maintenance_rules WHERE rule_status != 'retired' ORDER BY created_at`,
  );
  const items: AssessmentItem[] = rules.map((rule) => {
    const baseline = one<{
      baseline_laps: number | null;
      baseline_engine_hours: number | null;
      baseline_date: string;
    }>(
      db,
      `SELECT baseline_laps, baseline_engine_hours, baseline_date
       FROM service_baselines
       WHERE rule_id = ? AND vehicle_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [rule.id, vehicle.id],
    );
    const inspection = one<{ result: InspectionResult }>(
      db,
      `SELECT result FROM inspections
       WHERE rule_id = ? AND vehicle_id = ?
       ORDER BY performed_at DESC
       LIMIT 1`,
      [rule.id, vehicle.id],
    );
    let calendarCurrent: number | null = null;
    let calendarBaseline: number | null = null;
    if (rule.calendar_interval_days !== null && baseline?.baseline_date) {
      const elapsedDays = (now.getTime() - Date.parse(baseline.baseline_date)) / 86_400_000;
      calendarBaseline = 0;
      calendarCurrent = elapsedDays;
    }
    const metrics = {
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
    const combined = combineStatus({
      metrics,
      action: rule.action,
      latestInspection: inspection?.result ?? null,
    });
    return {
      ruleId: rule.id,
      name: rule.name,
      safetyCritical: rule.safety_critical === 1,
      illustrativeDraft: rule.illustrative_draft === 1,
      ruleStatus: rule.rule_status,
      status: combined.status,
      metrics,
      reasons: combined.reasons,
      label: rule.illustrative_draft === 1 ? 'ILLUSTRATIVE DRAFT — not an approved interval' : null,
    };
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
