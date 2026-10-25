import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.ts';
import { findUserByUsername, LOCAL_DEV_ADMIN_PASSWORD, LOCAL_DEV_CREW_PASSWORD, type User } from '../src/auth.ts';
import { prepareDatabase } from '../src/bootstrap.ts';
import { createKit, createPart, openKit } from '../src/inventory.ts';
import { createRule, listVehicles, type StudWorkPayload } from '../src/maintenance.ts';

export function tempDb(): DatabaseSync {
  return prepareDatabase(':memory:').db;
}

export function actor(db: DatabaseSync, username: 'admin' | 'crew'): User {
  const found = findUserByUsername(db, username);
  if (!found) throw new Error(`Missing seeded user ${username}`);
  return {
    id: found.id,
    username: found.username,
    displayName: found.displayName,
    role: found.role,
    active: found.active,
  };
}

export async function withServer(fn: (ctx: { db: DatabaseSync; base: string }) => Promise<void>): Promise<void> {
  const db = tempDb();
  const server: Server = createApp(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  try {
    await fn({ db, base: `http://127.0.0.1:${address.port}` });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
}

export async function api(base: string, token: string | null, method: string, pathname: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  return { status: response.status, body: parsed };
}

export async function login(base: string, username: 'admin' | 'crew'): Promise<string> {
  const password = username === 'admin' ? LOCAL_DEV_ADMIN_PASSWORD : LOCAL_DEV_CREW_PASSWORD;
  const response = await fetch(`${base}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Login failed: ${JSON.stringify(body)}`);
  return body.token as string;
}

export function studFixture(db: DatabaseSync, label: string) {
  const admin = actor(db, 'admin');
  const vehicle = listVehicles(db)[0];
  const part = createPart(db, admin, {
    catalogNumber: `STUD-${label}`,
    description: 'Wheel stud, test catalog item',
    unitOfMeasure: 'sealed set of 5',
    category: 'wheel-stud',
    reorderThreshold: null,
    minimumQuantity: null,
    desiredQuantity: null,
    supplierName: '',
    purchasingNotes: '',
    kitKind: 'sealed_stud_set',
  });
  const rule = createRule(db, admin, {
    name: `Wheel stud rule ${label}`,
    partId: part.id,
    category: 'wheel-stud',
    action: 'replace',
    lapInterval: 100,
    engineHourInterval: 10,
    calendarIntervalDays: null,
    warningThresholdLaps: 10,
    warningThresholdHours: 1,
    warningThresholdDays: null,
    criticalThresholdLaps: 120,
    criticalThresholdHours: null,
    criticalThresholdDays: null,
    requiredMeasurements: [],
    requiredSignoffs: ['work_completed'],
    procedureSource: 'Test fixture only. Not an approved service interval.',
    procedureRevision: 'test',
    safetyCritical: true,
    ruleStatus: 'active',
    illustrativeDraft: false,
  });
  const sealed = createKit(db, admin, {
    partId: part.id,
    humanLabel: `SET-${label}`,
    location: 'cabinet',
    notes: '',
  });
  const kit = openKit(db, admin, sealed.id);
  return { admin, vehicle, part, rule, kit };
}

export function studPayload(kit: { id: string; components: { id: string }[] }, technicianUserId: string, extras: Partial<StudWorkPayload> = {}): StudWorkPayload {
  return {
    kitId: kit.id,
    wheel: 'LF',
    studs: kit.components.map((component, index) => ({ index: index + 1, componentId: component.id })),
    lapReading: 0,
    engineHoursReading: 0,
    performedAt: new Date().toISOString(),
    measurements: {},
    signoffs: ['work_completed'],
    technicianUserId,
    notes: '',
    ...extras,
  };
}
