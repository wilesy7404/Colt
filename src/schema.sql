-- Phase 1 schema for the race-team maintenance ledger.
-- Identifiers are stable text IDs. Usage totals stay NULL until a session
-- is actually recorded. NULL means unknown, never "healthy" or zero.

CREATE TABLE schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER,
  make TEXT,
  model TEXT,
  notes TEXT NOT NULL DEFAULT '',
  laps_total REAL,
  engine_hours_total REAL,
  usage_tracking_started_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'race_day')),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

-- Catalog identity. A part number is not a physical component and not a kit.
CREATE TABLE parts (
  id TEXT PRIMARY KEY,
  catalog_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  reorder_threshold REAL,
  minimum_quantity REAL,
  desired_quantity REAL,
  supplier_name TEXT NOT NULL DEFAULT '',
  purchasing_notes TEXT NOT NULL DEFAULT '',
  kit_kind TEXT NOT NULL DEFAULT 'none' CHECK (kit_kind IN ('none', 'sealed_stud_set')),
  sealed_set_size INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (kit_kind = 'none' AND sealed_set_size IS NULL)
    OR (kit_kind = 'sealed_stud_set' AND sealed_set_size = 5)
  )
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  name TEXT NOT NULL,
  series TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  starts_on TEXT,
  ends_on TEXT,
  expected_laps REAL,
  expected_engine_hours REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE maintenance_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  part_id TEXT REFERENCES parts(id),
  category TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('inspect', 'replace', 'inspect_and_replace')),
  lap_interval REAL CHECK (lap_interval IS NULL OR lap_interval >= 0),
  engine_hour_interval REAL CHECK (engine_hour_interval IS NULL OR engine_hour_interval >= 0),
  calendar_interval_days INTEGER CHECK (calendar_interval_days IS NULL OR calendar_interval_days >= 0),
  warning_threshold_laps REAL CHECK (warning_threshold_laps IS NULL OR warning_threshold_laps >= 0),
  warning_threshold_hours REAL CHECK (warning_threshold_hours IS NULL OR warning_threshold_hours >= 0),
  warning_threshold_days INTEGER CHECK (warning_threshold_days IS NULL OR warning_threshold_days >= 0),
  critical_threshold_laps REAL CHECK (critical_threshold_laps IS NULL OR critical_threshold_laps >= 0),
  critical_threshold_hours REAL CHECK (critical_threshold_hours IS NULL OR critical_threshold_hours >= 0),
  critical_threshold_days INTEGER CHECK (critical_threshold_days IS NULL OR critical_threshold_days >= 0),
  required_measurements_json TEXT NOT NULL DEFAULT '[]',
  required_signoffs_json TEXT NOT NULL DEFAULT '[]',
  procedure_source TEXT NOT NULL CHECK (length(trim(procedure_source)) > 0),
  procedure_revision TEXT NOT NULL CHECK (length(trim(procedure_revision)) > 0),
  safety_critical INTEGER NOT NULL DEFAULT 0 CHECK (safety_critical IN (0, 1)),
  rule_status TEXT NOT NULL DEFAULT 'draft' CHECK (rule_status IN ('draft', 'active', 'retired')),
  illustrative_draft INTEGER NOT NULL DEFAULT 0 CHECK (illustrative_draft IN (0, 1)),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (illustrative_draft = 0 OR rule_status = 'draft')
);

-- Drafts do not consume stock or establish a service baseline.
-- Status becomes committed only inside the same transaction as those effects.
CREATE TABLE maintenance_transactions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  rule_id TEXT REFERENCES maintenance_rules(id),
  kind TEXT NOT NULL CHECK (kind IN ('initial_installation', 'replacement', 'inspection_only')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'committed', 'aborted')),
  payload_json TEXT NOT NULL,
  validation_error TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  committed_at TEXT,
  committed_by_user_id TEXT REFERENCES users(id)
);

-- One row per physical sealed set. Stock of wheel studs is counted in sets of five.
CREATE TABLE kits (
  id TEXT PRIMARY KEY,
  human_label TEXT NOT NULL UNIQUE,
  part_id TEXT NOT NULL REFERENCES parts(id),
  status TEXT NOT NULL CHECK (status IN ('sealed', 'opened', 'consumed')),
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  opened_at TEXT,
  opened_by_user_id TEXT REFERENCES users(id),
  consumed_at TEXT,
  consumed_by_transaction_id TEXT REFERENCES maintenance_transactions(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES parts(id),
  kit_id TEXT REFERENCES kits(id),
  movement_type TEXT NOT NULL CHECK (
    movement_type IN ('receive', 'reserve', 'release_reservation', 'consume', 'adjust', 'open_kit')
  ),
  quantity_delta REAL NOT NULL,
  authorized_negative_exception INTEGER NOT NULL DEFAULT 0 CHECK (authorized_negative_exception IN (0, 1)),
  exception_reason TEXT,
  maintenance_transaction_id TEXT REFERENCES maintenance_transactions(id),
  notes TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (movement_type != 'consume' OR maintenance_transaction_id IS NOT NULL),
  CHECK (authorized_negative_exception = 0 OR length(trim(COALESCE(exception_reason, ''))) > 0)
);

-- Physical component identity. kit_id is immutable once written (see triggers).
CREATE TABLE components (
  id TEXT PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES parts(id),
  kit_id TEXT REFERENCES kits(id),
  status TEXT NOT NULL CHECK (
    status IN ('in_stock', 'installed', 'removed', 'failed', 'scrapped', 'evidence')
  ),
  physical_mark TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL REFERENCES components(id),
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  position TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  installed_by_user_id TEXT NOT NULL REFERENCES users(id),
  lap_reading REAL,
  engine_hours_reading REAL,
  measurements_json TEXT NOT NULL DEFAULT '{}',
  procedure_source TEXT NOT NULL DEFAULT '',
  procedure_revision TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
  maintenance_transaction_id TEXT NOT NULL REFERENCES maintenance_transactions(id),
  created_at TEXT NOT NULL
);

CREATE TABLE removals (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id),
  component_id TEXT NOT NULL REFERENCES components(id),
  removed_at TEXT NOT NULL,
  removed_by_user_id TEXT NOT NULL REFERENCES users(id),
  lap_reading REAL,
  engine_hours_reading REAL,
  reason TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (
    disposition IN ('reused', 'failed', 'scrapped', 'inspected', 'retained_as_evidence', 'unknown')
  ),
  failure_evidence_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  maintenance_transaction_id TEXT NOT NULL REFERENCES maintenance_transactions(id),
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  event_id TEXT REFERENCES events(id),
  name TEXT NOT NULL,
  laps_completed REAL NOT NULL CHECK (laps_completed >= 0),
  engine_hours_added REAL NOT NULL CHECK (engine_hours_added >= 0),
  laps_total_after REAL,
  engine_hours_total_after REAL,
  totals_before_were_unknown INTEGER NOT NULL CHECK (totals_before_were_unknown IN (0, 1)),
  meter_note TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL
);

CREATE TABLE inspections (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  event_id TEXT REFERENCES events(id),
  session_id TEXT REFERENCES sessions(id),
  rule_id TEXT REFERENCES maintenance_rules(id),
  component_id TEXT REFERENCES components(id),
  inspection_kind TEXT NOT NULL CHECK (inspection_kind IN ('pre_event', 'pre_session', 'component', 'other')),
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'incomplete', 'unknown')),
  measurements_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  performed_by_user_id TEXT NOT NULL REFERENCES users(id),
  performed_at TEXT NOT NULL,
  maintenance_transaction_id TEXT REFERENCES maintenance_transactions(id),
  created_at TEXT NOT NULL
);

-- A baseline may exist only when established_by_transaction_id is already committed.
CREATE TABLE service_baselines (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES maintenance_rules(id),
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  position TEXT,
  baseline_laps REAL,
  baseline_engine_hours REAL,
  baseline_date TEXT NOT NULL,
  established_by_transaction_id TEXT NOT NULL REFERENCES maintenance_transactions(id),
  created_at TEXT NOT NULL
);

CREATE TABLE defects (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  component_id TEXT REFERENCES components(id),
  location_note TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('needs_review', 'critical')),
  notes TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')) DEFAULT 'open',
  reported_by_user_id TEXT NOT NULL REFERENCES users(id),
  reported_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE audit_records (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_components_kit ON components(kit_id);
CREATE INDEX idx_stock_part ON stock_movements(part_id);
CREATE INDEX idx_installations_component ON installations(component_id);
CREATE INDEX idx_baselines_rule_vehicle ON service_baselines(rule_id, vehicle_id);
CREATE INDEX idx_audit_entity ON audit_records(entity_type, entity_id);
CREATE INDEX idx_inspections_rule ON inspections(rule_id, vehicle_id);

INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1');
