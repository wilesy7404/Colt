import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { assessVehicle } from './assessment.ts';
import { changePassword, createUser, listUsers, login, logout, requireUser, userFromToken, type User } from './auth.ts';
import { exportSnapshot, restoreSnapshot, type Snapshot } from './backup.ts';
import { SCHEMA_VERSION } from './db.ts';
import { AppError, isAppError } from './errors.ts';
import {
  createKit,
  createPart,
  listComponents,
  listKits,
  listParts,
  listStockMovements,
  openKit,
  recordStockMovement,
} from './inventory.ts';
import {
  abortTransaction,
  commitTransaction,
  createDraftTransaction,
  createEvent,
  createRule,
  createVehicle,
  getRule,
  getTransaction,
  listAudit,
  listBaselines,
  listDefects,
  listEvents,
  listInspections,
  listInstallations,
  listRemovals,
  listRules,
  listSessions,
  listVehicles,
  mapRule,
  recordInspection,
  recordSession,
  reportDefect,
  resolveDefect,
  updateRule,
  type MeasurementSpec,
} from './maintenance.ts';
import { many } from './db.ts';
import {
  asObject,
  nonNegative,
  optString,
  readBoolean,
  readOptionalNumber,
  reqNumber,
  reqString,
} from './validate.ts';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicDir = path.join(rootDir, 'public');

type Handler = (ctx: {
  db: DatabaseSync;
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  params: Record<string, string>;
  user: User | null;
  body: unknown;
}) => Promise<void> | void;

type Route = { method: string; pattern: RegExp; keys: string[]; handler: Handler };

export function createApp(db: DatabaseSync): http.Server {
  const routes = buildRoutes();
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (!url.pathname.startsWith('/api/')) {
        serveStatic(url.pathname, res);
        return;
      }
      const body = await readBody(req, url.pathname === '/api/admin/restore' ? 20_000_000 : 1_000_000);
      const user = userFromToken(db, bearer(req));
      const match = matchRoute(routes, req.method ?? 'GET', url.pathname);
      if (!match) throw new AppError(404, 'That API route does not exist.', 'not_found');
      await match.route.handler({ db, req, res, url, params: match.params, user, body });
    } catch (error) {
      if (isAppError(error)) {
        send(res, error.status, { error: error.code, message: error.message });
        return;
      }
      console.error(error);
      send(res, 500, { error: 'server_error', message: 'The server could not complete that request.' });
    }
  });
}

function buildRoutes(): Route[] {
  return [
    route('GET', '/api/health', ({ res }) => {
      send(res, 200, {
        ok: true,
        phase: 1,
        schemaVersion: SCHEMA_VERSION,
        database: 'sqlite',
        offlineSync: false,
        crossDeviceSync: false,
        nativeIphoneApp: false,
        serviceIntervalsVerified: false,
        maintenanceHistorySeeded: false,
      });
    }),
    route('POST', '/api/session', ({ db, res, body }) => {
      const obj = asObject(body);
      const result = login(db, reqString(obj, 'username'), String(obj.password ?? ''));
      send(res, 200, result);
    }),
    route('DELETE', '/api/session', ({ db, req, res }) => {
      const token = bearer(req);
      if (token) logout(db, token);
      send(res, 200, { ok: true });
    }),
    route('POST', '/api/me/password', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      changePassword(db, actor, reqString(obj, 'currentPassword'), reqString(obj, 'newPassword'));
      send(res, 200, { ok: true });
    }),
    route('GET', '/api/me', ({ res, user }) => {
      send(res, 200, { user: requireUser(user) });
    }),
    route('GET', '/api/vehicles', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { vehicles: listVehicles(db) });
    }),
    route('POST', '/api/vehicles', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      const year = readOptionalNumber(obj, 'year');
      send(res, 201, {
        vehicle: createVehicle(db, actor, {
          name: reqString(obj, 'name'),
          year: year === undefined ? null : year,
          make: optString(obj, 'make'),
          model: optString(obj, 'model'),
          notes: optString(obj, 'notes'),
        }),
      });
    }),
    route('GET', '/api/vehicles/:id/assessment', ({ db, res, user, params }) => {
      requireUser(user);
      send(res, 200, assessVehicle(db, params.id));
    }),
    route('GET', '/api/users', ({ db, res, user }) => {
      const actor = requireUser(user);
      if (actor.role !== 'administrator') throw new AppError(403, 'Only an administrator can list users.', 'forbidden');
      send(res, 200, { users: listUsers(db) });
    }),
    route('POST', '/api/users', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      const role = reqString(obj, 'role');
      if (role !== 'administrator' && role !== 'race_day') {
        throw new AppError(400, 'role must be administrator or race_day.', 'validation');
      }
      send(res, 201, {
        user: createUser(db, actor, {
          username: reqString(obj, 'username'),
          displayName: reqString(obj, 'displayName'),
          role,
          password: reqString(obj, 'password'),
        }),
      });
    }),
    route('GET', '/api/parts', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { parts: listParts(db) });
    }),
    route('POST', '/api/parts', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      const kitKind = reqString(obj, 'kitKind');
      if (kitKind !== 'none' && kitKind !== 'sealed_stud_set') {
        throw new AppError(400, 'kitKind must be none or sealed_stud_set.', 'validation');
      }
      send(res, 201, {
        part: createPart(db, actor, {
          catalogNumber: reqString(obj, 'catalogNumber'),
          description: reqString(obj, 'description'),
          unitOfMeasure: reqString(obj, 'unitOfMeasure'),
          category: optString(obj, 'category'),
          reorderThreshold: nullableNumber(obj, 'reorderThreshold'),
          minimumQuantity: nullableNumber(obj, 'minimumQuantity'),
          desiredQuantity: nullableNumber(obj, 'desiredQuantity'),
          supplierName: optString(obj, 'supplierName'),
          purchasingNotes: optString(obj, 'purchasingNotes'),
          kitKind,
        }),
      });
    }),
    route('GET', '/api/kits', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { kits: listKits(db) });
    }),
    route('POST', '/api/kits', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      send(res, 201, {
        kit: createKit(db, actor, {
          partId: reqString(obj, 'partId'),
          humanLabel: reqString(obj, 'humanLabel'),
          location: optString(obj, 'location'),
          notes: optString(obj, 'notes'),
        }),
      });
    }),
    route('POST', '/api/kits/:id/open', ({ db, res, user, params }) => {
      const actor = requireUser(user);
      send(res, 200, { kit: openKit(db, actor, params.id) });
    }),
    route('GET', '/api/stock-movements', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { stockMovements: camelize(listStockMovements(db)) });
    }),
    route('POST', '/api/stock-movements', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      const movementType = reqString(obj, 'movementType');
      if (movementType === 'consume') {
        throw new AppError(422, 'Stock is consumed only when a maintenance transaction commits.', 'incomplete_transaction');
      }
      if (movementType !== 'receive' && movementType !== 'adjust') {
        throw new AppError(400, 'movementType must be receive or adjust.', 'validation');
      }
      send(res, 201, {
        stockMovement: camelize(
          recordStockMovement(db, actor, {
            partId: reqString(obj, 'partId'),
            movementType,
            quantityDelta: reqNumber(obj, 'quantityDelta'),
            notes: optString(obj, 'notes'),
            authorizedNegativeException: readBoolean(obj, 'authorizedNegativeException'),
            exceptionReason: optString(obj, 'exceptionReason'),
          }),
        ),
      });
    }),
    route('GET', '/api/components', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { components: camelize(listComponents(db)) });
    }),
    route('GET', '/api/installations', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { installations: camelize(listInstallations(db)) });
    }),
    route('GET', '/api/removals', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { removals: camelize(listRemovals(db)) });
    }),
    route('GET', '/api/maintenance-rules', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { rules: listRules(db) });
    }),
    route('POST', '/api/maintenance-rules', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      send(res, 201, { rule: createRule(db, actor, ruleWrite(asObject(body))) });
    }),
    route('PATCH', '/api/maintenance-rules/:id', ({ db, res, user, body, params }) => {
      const actor = requireUser(user);
      const existing = mapRule(getRule(db, params.id));
      send(res, 200, { rule: updateRule(db, actor, params.id, ruleWrite(asObject(body), existing)) });
    }),
    route('GET', '/api/inspections', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { inspections: camelize(listInspections(db)) });
    }),
    route('POST', '/api/inspections', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      const measurements = obj.measurements;
      send(res, 201, {
        inspection: camelize(
          recordInspection(db, actor, {
            vehicleId: reqString(obj, 'vehicleId'),
            eventId: optionalId(obj, 'eventId'),
            sessionId: optionalId(obj, 'sessionId'),
            ruleId: optionalId(obj, 'ruleId'),
            componentId: optionalId(obj, 'componentId'),
            inspectionKind: reqString(obj, 'inspectionKind'),
            result: reqString(obj, 'result'),
            measurements: measurements && typeof measurements === 'object' && !Array.isArray(measurements) ? measurements as Record<string, unknown> : {},
            notes: optString(obj, 'notes'),
            performedAt: reqString(obj, 'performedAt'),
            maintenanceTransactionId: null,
          }),
        ),
      });
    }),
    route('GET', '/api/sessions', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { sessions: camelize(listSessions(db)) });
    }),
    route('POST', '/api/sessions', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      send(res, 201, {
        session: camelize(
          recordSession(db, actor, {
            vehicleId: reqString(obj, 'vehicleId'),
            eventId: optionalId(obj, 'eventId'),
            name: reqString(obj, 'name'),
            lapsCompleted: reqNumber(obj, 'lapsCompleted'),
            engineHoursAdded: reqNumber(obj, 'engineHoursAdded'),
            meterNote: optString(obj, 'meterNote'),
            notes: optString(obj, 'notes'),
          }),
        ),
      });
    }),
    route('GET', '/api/events', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { events: camelize(listEvents(db)) });
    }),
    route('POST', '/api/events', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      send(res, 201, {
        event: camelize(
          createEvent(db, actor, {
            vehicleId: reqString(obj, 'vehicleId'),
            name: reqString(obj, 'name'),
            series: optString(obj, 'series'),
            location: optString(obj, 'location'),
            startsOn: optionalId(obj, 'startsOn'),
            endsOn: optionalId(obj, 'endsOn'),
            expectedLaps: nullableNumber(obj, 'expectedLaps'),
            expectedEngineHours: nullableNumber(obj, 'expectedEngineHours'),
            notes: optString(obj, 'notes'),
          }),
        ),
      });
    }),
    route('GET', '/api/defects', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { defects: camelize(listDefects(db)) });
    }),
    route('POST', '/api/defects', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      send(res, 201, {
        defect: camelize(
          reportDefect(db, actor, {
            vehicleId: reqString(obj, 'vehicleId'),
            componentId: optionalId(obj, 'componentId'),
            locationNote: reqString(obj, 'locationNote'),
            severity: reqString(obj, 'severity'),
            notes: reqString(obj, 'notes'),
          }),
        ),
      });
    }),
    route('POST', '/api/defects/:id/resolve', ({ db, res, user, body, params }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      send(res, 200, { defect: camelize(resolveDefect(db, actor, params.id, reqString(obj, 'resolutionNotes'))) });
    }),
    route('GET', '/api/audit-records', ({ db, res, user }) => {
      const actor = requireUser(user);
      send(res, 200, { auditRecords: camelize(listAudit(db, actor)) });
    }),
    route('GET', '/api/service-baselines', ({ db, res, user }) => {
      requireUser(user);
      send(res, 200, { serviceBaselines: camelize(listBaselines(db)) });
    }),
    route('GET', '/api/maintenance-transactions', ({ db, res, user }) => {
      requireUser(user);
      const rows = many<{ id: string }>(db, 'SELECT id FROM maintenance_transactions ORDER BY created_at');
      send(res, 200, { transactions: rows.map((row) => getTransaction(db, row.id)) });
    }),
    route('POST', '/api/maintenance-transactions', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      const obj = asObject(body);
      send(res, 201, {
        transaction: createDraftTransaction(db, actor, {
          idempotencyKey: reqString(obj, 'idempotencyKey'),
          vehicleId: reqString(obj, 'vehicleId'),
          ruleId: reqString(obj, 'ruleId'),
          kind: reqString(obj, 'kind'),
          payload: obj.payload ?? {},
        }),
      });
    }),
    route('GET', '/api/maintenance-transactions/:id', ({ db, res, user, params }) => {
      requireUser(user);
      send(res, 200, { transaction: getTransaction(db, params.id) });
    }),
    route('POST', '/api/maintenance-transactions/:id/commit', ({ db, res, user, params }) => {
      const actor = requireUser(user);
      send(res, 200, commitTransaction(db, actor, params.id));
    }),
    route('POST', '/api/maintenance-transactions/:id/abort', ({ db, res, user, params }) => {
      const actor = requireUser(user);
      send(res, 200, { transaction: abortTransaction(db, actor, params.id) });
    }),
    route('GET', '/api/admin/export', ({ db, res, user }) => {
      const actor = requireUser(user);
      if (actor.role !== 'administrator') throw new AppError(403, 'Only an administrator can export a backup.', 'forbidden');
      send(res, 200, exportSnapshot(db));
    }),
    route('POST', '/api/admin/restore', ({ db, res, user, body }) => {
      const actor = requireUser(user);
      if (actor.role !== 'administrator') throw new AppError(403, 'Only an administrator can restore a backup.', 'forbidden');
      const result = restoreSnapshot(db, body as Snapshot, { actorUserId: actor.id, note: 'HTTP restore' });
      send(res, 200, { ok: true, ...result });
    }),
  ];
}

function ruleWrite(obj: Record<string, unknown>, existing?: ReturnType<typeof mapRule>) {
  const action = existing && !Object.prototype.hasOwnProperty.call(obj, 'action') ? existing.action : reqString(obj, 'action');
  if (action !== 'inspect' && action !== 'replace' && action !== 'inspect_and_replace') {
    throw new AppError(400, 'action must be inspect, replace, or inspect_and_replace.', 'validation');
  }
  const ruleStatus = existing && !Object.prototype.hasOwnProperty.call(obj, 'ruleStatus')
    ? existing.ruleStatus
    : (optString(obj, 'ruleStatus', 'draft') as 'draft' | 'active' | 'retired');
  const measurements = Object.prototype.hasOwnProperty.call(obj, 'requiredMeasurements')
    ? obj.requiredMeasurements
    : existing?.requiredMeasurements ?? [];
  const signoffs = Object.prototype.hasOwnProperty.call(obj, 'requiredSignoffs')
    ? obj.requiredSignoffs
    : existing?.requiredSignoffs ?? [];
  if (!Array.isArray(measurements) || !Array.isArray(signoffs)) {
    throw new AppError(400, 'requiredMeasurements and requiredSignoffs must be arrays.', 'validation');
  }
  return {
    name: pickedString(obj, 'name', existing?.name),
    partId: pickedNullableString(obj, 'partId', existing?.partId ?? null),
    category: pickedOptionalString(obj, 'category', existing?.category ?? ''),
    action,
    lapInterval: nonNegative(pickedNumber(obj, 'lapInterval', existing?.lapInterval ?? null), 'lapInterval') ?? null,
    engineHourInterval: nonNegative(pickedNumber(obj, 'engineHourInterval', existing?.engineHourInterval ?? null), 'engineHourInterval') ?? null,
    calendarIntervalDays: nonNegative(pickedNumber(obj, 'calendarIntervalDays', existing?.calendarIntervalDays ?? null), 'calendarIntervalDays') ?? null,
    warningThresholdLaps: nonNegative(pickedNumber(obj, 'warningThresholdLaps', existing?.warningThresholdLaps ?? null), 'warningThresholdLaps') ?? null,
    warningThresholdHours: nonNegative(pickedNumber(obj, 'warningThresholdHours', existing?.warningThresholdHours ?? null), 'warningThresholdHours') ?? null,
    warningThresholdDays: nonNegative(pickedNumber(obj, 'warningThresholdDays', existing?.warningThresholdDays ?? null), 'warningThresholdDays') ?? null,
    criticalThresholdLaps: nonNegative(pickedNumber(obj, 'criticalThresholdLaps', existing?.criticalThresholdLaps ?? null), 'criticalThresholdLaps') ?? null,
    criticalThresholdHours: nonNegative(pickedNumber(obj, 'criticalThresholdHours', existing?.criticalThresholdHours ?? null), 'criticalThresholdHours') ?? null,
    criticalThresholdDays: nonNegative(pickedNumber(obj, 'criticalThresholdDays', existing?.criticalThresholdDays ?? null), 'criticalThresholdDays') ?? null,
    requiredMeasurements: measurements as MeasurementSpec[],
    requiredSignoffs: signoffs.map(String),
    procedureSource: pickedString(obj, 'procedureSource', existing?.procedureSource),
    procedureRevision: pickedString(obj, 'procedureRevision', existing?.procedureRevision),
    safetyCritical: Object.prototype.hasOwnProperty.call(obj, 'safetyCritical') ? readBoolean(obj, 'safetyCritical') : existing?.safetyCritical ?? false,
    ruleStatus,
    illustrativeDraft: Object.prototype.hasOwnProperty.call(obj, 'illustrativeDraft')
      ? readBoolean(obj, 'illustrativeDraft')
      : existing?.illustrativeDraft ?? false,
  };
}

function pickedOptionalString(obj: Record<string, unknown>, key: string, fallback: string): string {
  if (!Object.prototype.hasOwnProperty.call(obj, key) || obj[key] === null) return fallback;
  return optString(obj, key);
}

function pickedString(obj: Record<string, unknown>, key: string, fallback: string | undefined): string {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    if (fallback === undefined) throw new AppError(400, `${key} is required.`, 'validation');
    return fallback;
  }
  return reqString(obj, key);
}

function pickedNullableString(obj: Record<string, unknown>, key: string, fallback: string | null): string | null {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return fallback;
  if (obj[key] === null) return null;
  return reqString(obj, key);
}

function pickedNumber(obj: Record<string, unknown>, key: string, fallback: number | null): number | null {
  const value = readOptionalNumber(obj, key);
  if (value === undefined) return fallback;
  return value;
}

function nullableNumber(obj: Record<string, unknown>, key: string): number | null {
  const value = readOptionalNumber(obj, key);
  return value === undefined ? null : value;
}

function optionalId(obj: Record<string, unknown>, key: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(obj, key) || obj[key] === null || obj[key] === undefined || obj[key] === '') return null;
  return reqString(obj, key);
}

function route(method: string, pathname: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${pathname.replace(/:([A-Za-z]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    })}$`,
  );
  return { method, pattern, keys, handler };
}

function matchRoute(routes: Route[], method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const match = candidate.pattern.exec(pathname);
    if (!match) continue;
    const params: Record<string, string> = {};
    candidate.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });
    return { route: candidate, params };
  }
  return null;
}

function bearer(req: http.IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || Array.isArray(header)) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}

async function readBody(req: http.IncomingMessage, limit: number): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'DELETE') return {};
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new AppError(413, 'Request body is too large.', 'payload_too_large');
    chunks.push(buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, 'Request body must be JSON.', 'json');
  }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        camelize(inner),
      ]),
    );
  }
  return value;
}

function serveStatic(pathname: string, res: http.ServerResponse): void {
  const base = publicDir;
  const relative = pathname.replace(/^\//, '');
  const requested = relative === '' ? 'index.html' : relative;
  const full = path.normalize(path.join(base, requested));
  if (full !== base && !full.startsWith(`${base}${path.sep}`)) {
    send(res, 400, { error: 'bad_path', message: 'That path is not available.' });
    return;
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    send(res, 404, { error: 'not_found', message: 'That file was not found.' });
    return;
  }
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
    '.md': 'text/plain; charset=utf-8',
  };
  res.writeHead(200, { 'content-type': types[path.extname(full)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(full).pipe(res);
}
