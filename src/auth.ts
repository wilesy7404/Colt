import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { many, newId, nowIso, one } from './db.ts';
import { AppError } from './errors.ts';

export const LOCAL_DEV_ADMIN_USERNAME = 'admin';
export const LOCAL_DEV_CREW_USERNAME = 'crew';
export const LOCAL_DEV_ADMIN_PASSWORD = 'local-dev-admin';
export const LOCAL_DEV_CREW_PASSWORD = 'local-dev-crew';

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

export function seedUsersAndVehicle(db: DatabaseSync): { usedDefaultPasswords: boolean } {
  const userCount = one<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM users');
  let usedDefaultPasswords = false;
  if (!userCount || userCount.c === 0) {
    const adminPassword = process.env.ADMIN_PASSWORD || LOCAL_DEV_ADMIN_PASSWORD;
    const crewPassword = process.env.CREW_PASSWORD || LOCAL_DEV_CREW_PASSWORD;
    usedDefaultPasswords =
      adminPassword === LOCAL_DEV_ADMIN_PASSWORD || crewPassword === LOCAL_DEV_CREW_PASSWORD;
    if (process.env.NODE_ENV === 'production' && usedDefaultPasswords) {
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
  return { usedDefaultPasswords };
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
  try {
    db.prepare(
      `INSERT INTO users (id, username, display_name, role, password_hash, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, input.username.trim(), input.displayName.trim(), input.role, hashPassword(input.password), createdAt, createdAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE/.test(message)) throw new AppError(409, 'That username already exists.', 'conflict');
    throw error;
  }
  const created = findUserById(db, id);
  if (!created) throw new Error('User insert did not persist.');
  return created;
}

export function login(db: DatabaseSync, username: string, password: string): { token: string; user: User; expiresAt: string } {
  const found = findUserByUsername(db, username.trim());
  if (!found || !found.active || !verifyPassword(password, found.passwordHash)) {
    throw new AppError(401, 'Username or password is incorrect.', 'unauthorized');
  }
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  db.prepare(
    `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  ).run(newId(), found.id, tokenHash, createdAt, expiresAt);
  return {
    token,
    expiresAt,
    user: { id: found.id, username: found.username, displayName: found.displayName, role: found.role, active: found.active },
  };
}

export function logout(db: DatabaseSync, token: string): void {
  db.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`).run(nowIso(), hashToken(token));
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
