export type MetricStatus = 'not_due' | 'approaching' | 'due' | 'overdue' | 'unknown' | 'not_applicable';
export type OverallStatus = 'not_due' | 'approaching' | 'due' | 'overdue' | 'failed_inspection' | 'unknown';
export type RuleAction = 'inspect' | 'replace' | 'inspect_and_replace';
export type InspectionResult = 'pass' | 'fail' | 'incomplete' | 'unknown' | null;

export type MetricInput = {
  interval: number | null;
  warning: number | null;
  critical: number | null;
  baseline: number | null;
  current: number | null;
};

const RANK: Record<OverallStatus, number> = {
  failed_inspection: 6,
  overdue: 5,
  due: 4,
  unknown: 3,
  approaching: 2,
  not_due: 1,
};

export function evaluateMetric(input: MetricInput): MetricStatus {
  if (input.interval === null || input.interval === undefined) return 'not_applicable';
  if (input.baseline === null || input.baseline === undefined) return 'unknown';
  if (input.current === null || input.current === undefined) return 'unknown';
  const elapsed = input.current - input.baseline;
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'unknown';
  if (input.critical !== null && input.critical !== undefined && elapsed >= input.critical) return 'overdue';
  if (elapsed >= input.interval) return 'due';
  if (input.warning !== null && input.warning !== undefined && input.interval - elapsed <= input.warning) {
    return 'approaching';
  }
  return 'not_due';
}

export function combineStatus(input: {
  metrics: { laps: MetricStatus; engineHours: MetricStatus; calendar: MetricStatus };
  action: RuleAction;
  latestInspection: InspectionResult;
}): { status: OverallStatus; reasons: string[] } {
  const reasons: string[] = [];
  const applicable = [input.metrics.laps, input.metrics.engineHours, input.metrics.calendar].filter(
    (status) => status !== 'not_applicable',
  );

  if (applicable.length === 0) {
    reasons.push('No lap, engine-hour, or calendar interval is configured. This is not treated as healthy.');
  }
  if (input.metrics.laps === 'unknown') reasons.push('Lap status is unknown because the interval, baseline, or current reading is missing or inconsistent.');
  if (input.metrics.engineHours === 'unknown') {
    reasons.push('Engine-hour status is unknown because the interval, baseline, or current reading is missing or inconsistent.');
  }
  if (input.metrics.calendar === 'unknown') {
    reasons.push('Calendar status is unknown because the interval or baseline date is missing or inconsistent.');
  }

  const inspectionRequired = input.action === 'inspect' || input.action === 'inspect_and_replace';
  let inspectionStatus: OverallStatus | null = null;
  if (input.latestInspection === 'fail') {
    inspectionStatus = 'failed_inspection';
    reasons.push('The latest inspection result is a failure.');
  } else if (input.latestInspection === 'incomplete' || input.latestInspection === 'unknown') {
    inspectionStatus = 'unknown';
    reasons.push('The latest inspection is incomplete or explicitly unknown.');
  } else if (inspectionRequired && input.latestInspection === null) {
    inspectionStatus = 'unknown';
    reasons.push('No inspection is recorded for a rule that requires one.');
  }

  let metricStatus: OverallStatus = 'not_due';
  if (applicable.length === 0 || applicable.includes('unknown')) metricStatus = 'unknown';
  else if (applicable.includes('overdue')) metricStatus = 'overdue';
  else if (applicable.includes('due')) metricStatus = 'due';
  else if (applicable.includes('approaching')) metricStatus = 'approaching';

  const candidates: OverallStatus[] = [metricStatus];
  if (inspectionStatus) candidates.push(inspectionStatus);
  const status = candidates.sort((a, b) => RANK[b] - RANK[a])[0] ?? 'unknown';
  if (status === 'not_due' && reasons.length === 0) {
    reasons.push('Configured metrics are inside the administrator-entered intervals. This is not a safety certification.');
  }
  return { status, reasons };
}

export type AssessmentItem = {
  ruleId: string;
  name: string;
  corner: 'LF' | 'RF' | 'LR' | 'RR' | null;
  kitId: string | null;
  safetyCritical: boolean;
  illustrativeDraft: boolean;
  ruleStatus: string;
  status: OverallStatus;
  metrics: { laps: MetricStatus; engineHours: MetricStatus; calendar: MetricStatus };
  reasons: string[];
  label: string | null;
};

const STATUS_RANK: Record<OverallStatus, number> = {
  failed_inspection: 6,
  overdue: 5,
  due: 4,
  unknown: 3,
  approaching: 2,
  not_due: 1,
};

export function worstStatus(statuses: OverallStatus[]): OverallStatus {
  if (statuses.length === 0) return 'unknown';
  return statuses.reduce((worst, status) => (STATUS_RANK[status] > STATUS_RANK[worst] ? status : worst));
}

export function summarizeReadiness(input: {
  items: AssessmentItem[];
  openCriticalDefects: number;
}): {
  state: 'blocked' | 'no_known_blockers';
  status: OverallStatus;
  blocksReady: boolean;
  reasons: string[];
  notes: string[];
  disclaimer: string;
} {
  const disclaimer = 'This is a check of recorded data, not a certification that the vehicle is safe to race.';
  const reasons: string[] = [];
  const notes: string[] = [];
  if (input.openCriticalDefects > 0) {
    reasons.push(`${input.openCriticalDefects} open critical defect${input.openCriticalDefects === 1 ? '' : 's'}.`);
  }
  if (input.items.length === 0) {
    reasons.push('No maintenance rules are configured. Missing rules are unknown, not healthy.');
  }
  const safety = input.items.filter((item) => item.safetyCritical && item.ruleStatus === 'active');
  if (input.items.length > 0 && safety.length === 0) {
    reasons.push('No active safety-critical rule is configured, so safety status is unknown.');
  }
  for (const item of input.items) {
    if (item.illustrativeDraft) {
      reasons.push(`${item.name} is an illustrative draft and is not an approved interval.`);
    }
    if (item.status === 'approaching') notes.push(`${item.name} is approaching the administrator-entered interval.`);
    if (item.status === 'unknown' || item.status === 'failed_inspection' || item.status === 'overdue' || item.status === 'due') {
      reasons.push(`${item.name}: ${item.status.replaceAll('_', ' ')}.`);
    }
  }
  const blocksReady = reasons.length > 0;
  return {
    state: blocksReady ? 'blocked' : 'no_known_blockers',
    status: worstStatus(input.items.map((item) => item.status)),
    blocksReady,
    reasons,
    notes,
    disclaimer,
  };
}
