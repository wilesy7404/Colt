import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { audit } from './audit.ts';
import { many, newId, nowIso, one, withTransaction } from './db.ts';
import { AppError } from './errors.ts';

export const LOCAL_DEV_ADMIN_USERNAME = 'admin';
export const LOCAL_DEV_CREW_USERNAME = 'crew';
// DEV ONLY - not for real data or networks
export const LOCAL_DEV_ADMIN_PASSWORD = 'local-dev-admin';
// DEV ONLY - not for real data or networks
export const LOCAL_DEV_CREW_PASSWORD = 'local-dev-crew';
export const DEV_ONLY_PASSWORD_LABEL = 'DEV ONLY - not for real data or networks';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const loginFailures = new Map<string, { count: number; resetAt: number }>();

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type Role = 'administrator' | 'race_day';

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  password_hash: string;
  active: number;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const n = 16384;
  const r = 8;
  const p = 1;
  const hash = scryptSync(password, salt, 32, { N: n, r, p }).toString('hex');
  return `scrypt$${n}$${r}$${p}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 32, { N: Number(n), r: Number(r), p: Number(p) });
  const expected = Buffer.from(hash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export type SeedResult = {
  seededDefaultAdminPassword: boolean;
  seededDefaultCrewPassword: boolean;
};

export function seedUsersAndVehicle(db: DatabaseSync): SeedResult {
  const userCount = one<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM users');
  let seededDefaultAdminPassword = false;
  let seededDefaultCrewPassword = false;
  if (!userCount || userCount.c === 0) {
    const adminPassword = process.env.ADMIN_PASSWORD || LOCAL_DEV_ADMIN_PASSWORD;
    const crewPassword = process.env.CREW_PASSWORD || LOCAL_DEV_CREW_PASSWORD;
    seededDefaultAdminPassword = adminPassword === LOCAL_DEV_ADMIN_PASSWORD;
    seededDefaultCrewPassword = crewPassword === LOCAL_DEV_CREW_PASSWORD;
    if (process.env.NODE_ENV === 'production' && (seededDefaultAdminPassword || seededDefaultCrewPassword)) {
      throw new Error(
        'Refusing to create default local passwords when NODE_ENV=production. Set ADMIN_PASSWORD and CREW_PASSWORD.',
      );
    }
    const createdAt = nowIso();
    insertUser(db, {
      username: LOCAL_DEV_ADMIN_USERNAME,
      displayName: 'Administrator',
      role: 'administrator',
      password: adminPassword,
      createdAt,
    });
    insertUser(db, {
      username: LOCAL_DEV_CREW_USERNAME,
      displayName: 'Race-day crew',
      role: 'race_day',
      password: crewPassword,
      createdAt,
    });
  }

  const vehicleCount = one<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM vehicles');
  if (!vehicleCount || vehicleCount.c === 0) {
    const createdAt = nowIso();
    db.prepare(
      `INSERT INTO vehicles (
        id, name, year, make, model, notes, laps_total, engine_hours_total, usage_tracking_started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    ).run(
      newId(),
      '350Z',
      2004,
      'Nissan',
      '350Z',
      'Team vehicle identity only. No maintenance history is stored. Lap and engine-hour totals stay unknown until a session is recorded.',
      createdAt,
      createdAt,
    );
  }
  return { seededDefaultAdminPassword, seededDefaultCrewPassword };
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost' || normalized.startsWith('127.');
}

export function defaultPasswordsStillInUse(db: DatabaseSync): { admin: boolean; crew: boolean } {
  const admin = findUserByUsername(db, LOCAL_DEV_ADMIN_USERNAME);
  const crew = findUserByUsername(db, LOCAL_DEV_CREW_USERNAME);
  return {
    admin: Boolean(admin && verifyPassword(LOCAL_DEV_ADMIN_PASSWORD, admin.passwordHash)),
    crew: Boolean(crew && verifyPassword(LOCAL_DEV_CREW_PASSWORD, crew.passwordHash)),
  };
}

export function assertBindAllowed(db: DatabaseSync, host: string): void {
  if (isLoopbackHost(host)) return;
  const inUse = defaultPasswordsStillInUse(db);
  if (inUse.admin || inUse.crew) {
    throw new Error(
      `Refusing to listen on ${host} while a default password is still in use. Change both passwords, then set HOST. ${DEV_ONLY_PASSWORD_LABEL}`,
    );
  }
}

export function startupLogLines(input: {
  host: string;
  port: number;
  dbPath: string;
  seededDefaultAdminPassword: boolean;
  seededDefaultCrewPassword: boolean;
}): string[] {
  const lines = [
    `Race Team Maintenance API listening on http://${input.host}:${input.port}`,
    `SQLite database: ${input.dbPath}`,
    'Phase 1 foundation. Offline sync, cross-device sync, and a native iPhone app are not implemented.',
  ];
  if (input.seededDefaultAdminPassword || input.seededDefaultCrewPassword) {
    lines.push(DEV_ONLY_PASSWORD_LABEL);
    if (input.seededDefaultAdminPassword) {
      lines.push(`  administrator  ${LOCAL_DEV_ADMIN_USERNAME} / ${LOCAL_DEV_ADMIN_PASSWORD}`);
    }
    if (input.seededDefaultCrewPassword) {
      lines.push(`  race-day       ${LOCAL_DEV_CREW_USERNAME} / ${LOCAL_DEV_CREW_PASSWORD}`);
    }
    lines.push('Set ADMIN_PASSWORD and CREW_PASSWORD before first launch to choose different passwords.');
    lines.push('NODE_ENV=production refuses these defaults.');
  }
  return lines;
}

export function resetLoginRateLimit(): void {
  loginFailures.clear();
}

function insertUser(
  db: DatabaseSync,
  input: { username: string; displayName: string; role: Role; password: string; createdAt: string },
): void {
  db.prepare(
    `INSERT INTO users (id, username, display_name, role, password_hash, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(newId(), input.username, input.displayName, input.role, hashPassword(input.password), input.createdAt, input.createdAt);
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: row.active === 1,
  };
}

export function requireUser(user: User | null): User {
  if (!user || !user.active) throw new AppError(401, 'Sign in is required.', 'unauthorized');
  return user;
}

export function assertAdmin(user: User, message = 'Only an administrator can do that.'): void {
  if (user.role !== 'administrator') throw new AppError(403, message, 'forbidden');
}

export function findUserByUsername(db: DatabaseSync, username: string): (User & { passwordHash: string }) | undefined {
  const row = one<UserRow>(db, 'SELECT * FROM users WHERE username = ?', [username]);
  if (!row) return undefined;
  return { ...toUser(row), passwordHash: row.password_hash };
}

export function findUserById(db: DatabaseSync, id: string): User | undefined {
  const row = one<UserRow>(db, 'SELECT * FROM users WHERE id = ?', [id]);
  return row ? toUser(row) : undefined;
}

export function listUsers(db: DatabaseSync): User[] {
  return many<UserRow>(db, 'SELECT * FROM users ORDER BY username').map(toUser);
}

export function createUser(
  db: DatabaseSync,
  actor: User,
  input: { username: string; displayName: string; role: Role; password: string },
): User {
  assertAdmin(actor, 'Only an administrator can manage users.');
  if (!input.username.trim() || !input.displayName.trim()) {
    throw new AppError(400, 'Username and display name are required.', 'validation');
  }
  if (input.role !== 'administrator' && input.role !== 'race_day') {
    throw new AppError(400, 'Role must be administrator or race_day.', 'validation');
  }
  if (input.password.length < 8) {
    throw new AppError(400, 'Password must be at least 8 characters.', 'validation');
  }
  const createdAt = nowIso();
  const id = newId();
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  try {
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO users (id, username, display_name, role, password_hash, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(id, username, displayName, input.role, hashPassword(input.password), createdAt, createdAt);
      audit(db, {
        actorUserId: actor.id,
        action: 'user_created',
        entityType: 'user',
        entityId: id,
        after: { username, displayName, role: input.role },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE/.test(message)) throw new AppError(409, 'That username already exists.', 'conflict');
    throw error;
  }
  const created = findUserById(db, id);
  if (!created) throw new Error('User insert did not persist.');
  return created;
}

export function changePassword(db: DatabaseSync, actor: User, currentPassword: string, newPassword: string): void {
  if (newPassword.length < 8) throw new AppError(400, 'Password must be at least 8 characters.', 'validation');
  const found = findUserByUsername(db, actor.username);
  if (!found || !found.active || !verifyPassword(currentPassword, found.passwordHash)) {
    throw new AppError(401, 'Current password is incorrect.', 'unauthorized');
  }
  writePassword(db, found.id, found.username, newPassword, found.id, 'session');
}

export function setPasswordAsOperator(db: DatabaseSync, username: string, newPassword: string): void {
  if (newPassword.length < 8) throw new AppError(400, 'Password must be at least 8 characters.', 'validation');
  const found = findUserByUsername(db, username.trim());
  if (!found) throw new AppError(404, 'User was not found.', 'not_found');
  writePassword(db, found.id, found.username, newPassword, found.id, 'cli');
}

function writePassword(
  db: DatabaseSync,
  userId: string,
  username: string,
  newPassword: string,
  actorUserId: string,
  via: 'session' | 'cli',
): void {
  const updatedAt = nowIso();
  withTransaction(db, () => {
    const result = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      updatedAt,
      userId,
    );
    if (Number(result.changes) !== 1) throw new AppError(409, 'Password was not changed.', 'conflict');
    audit(db, {
      actorUserId,
      action: 'password_changed',
      entityType: 'user',
      entityId: userId,
      after: { username, via },
    });
  });
}

export function login(db: DatabaseSync, username: string, password: string): { token: string; user: User; expiresAt: string } {
  const key = username.trim();
  assertWithinLoginLimit(key);
  const found = findUserByUsername(db, key);
  if (!found || !found.active || !verifyPassword(password, found.passwordHash)) {
    audit(db, {
      actorUserId: found?.id ?? null,
      action: 'login_failed',
      entityType: 'user',
      entityId: found?.id ?? 'unknown',
      after: { username: key },
    });
    recordLoginFailure(key);
    throw new AppError(401, 'Username or password is incorrect.', 'unauthorized');
  }
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  const sessionId = newId();
  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    ).run(sessionId, found.id, tokenHash, createdAt, expiresAt);
    audit(db, {
      actorUserId: found.id,
      action: 'login',
      entityType: 'auth_session',
      entityId: sessionId,
      after: { username: found.username },
    });
  });
  clearLoginFailures(key);
  return {
    token,
    expiresAt,
    user: { id: found.id, username: found.username, displayName: found.displayName, role: found.role, active: found.active },
  };
}

export function logout(db: DatabaseSync, token: string): void {
  const tokenHash = hashToken(token);
  const session = one<{ id: string; user_id: string }>(
    db,
    'SELECT id, user_id FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL',
    [tokenHash],
  );
  if (!session) return;
  const revokedAt = nowIso();
  withTransaction(db, () => {
    db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(revokedAt, session.id);
    audit(db, {
      actorUserId: session.user_id,
      action: 'logout',
      entityType: 'auth_session',
      entityId: session.id,
    });
  });
}

function assertWithinLoginLimit(username: string): void {
  const entry = currentLoginFailures(username);
  if (entry && entry.count >= LOGIN_MAX_FAILURES) {
    throw new AppError(429, 'Too many sign-in attempts. Try again later.', 'rate_limited');
  }
}

function recordLoginFailure(username: string): void {
  const key = loginKey(username);
  const entry = currentLoginFailures(username);
  if (!entry) {
    loginFailures.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function clearLoginFailures(username: string): void {
  loginFailures.delete(loginKey(username));
}

function currentLoginFailures(username: string): { count: number; resetAt: number } | undefined {
  const key = loginKey(username);
  const entry = loginFailures.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.resetAt) {
    loginFailures.delete(key);
    return undefined;
  }
  return entry;
}

function loginKey(username: string): string {
  return username.trim().toLowerCase();
}

export function userFromToken(db: DatabaseSync, token: string | null): User | null {
  if (!token) return null;
  const row = one<{ user_id: string; expires_at: string }>(
    db,
    `SELECT user_id, expires_at FROM auth_sessions
     WHERE token_hash = ? AND revoked_at IS NULL`,
    [hashToken(token)],
  );
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  const user = findUserById(db, row.user_id);
  if (!user || !user.active) return null;
  return user;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
