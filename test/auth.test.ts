import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  assertBindAllowed,
  createUser,
  LOCAL_DEV_ADMIN_PASSWORD,
  LOCAL_DEV_CREW_PASSWORD,
  login,
  logout,
  resetLoginRateLimit,
  setPasswordAsOperator,
  startupLogLines,
  verifyPassword,
  findUserByUsername,
} from '../src/auth.ts';
import { openDatabase } from '../src/db.ts';
import { AppError } from '../src/errors.ts';
import { api, actor, login as httpLogin, tempDb, withServer } from './helpers.ts';

test('creating a user, signing in, a failed sign-in, and signing out are audited without passwords', () => {
  const db = tempDb();
  const admin = actor(db, 'admin');
  const secret = 'crew-member-secret';
  const created = createUser(db, admin, {
    username: 'newcrew',
    displayName: 'New crew',
    role: 'race_day',
    password: secret,
  });
  const createdAudit = db.prepare(`SELECT after_json FROM audit_records WHERE action = 'user_created' AND entity_id = ?`).get(created.id) as {
    after_json: string;
  };
  assert.equal(createdAudit.after_json.includes(secret), false);
  assert.equal(JSON.parse(createdAudit.after_json).username, 'newcrew');

  assert.throws(() => login(db, 'newcrew', 'wrong-password'), (error: unknown) => error instanceof AppError && error.status === 401);
  const failed = db.prepare(`SELECT after_json FROM audit_records WHERE action = 'login_failed'`).all() as { after_json: string }[];
  assert.equal(failed.length, 1);
  assert.equal(failed[0].after_json.includes('wrong-password'), false);
  assert.equal(JSON.parse(failed[0].after_json).username, 'newcrew');

  const session = login(db, 'newcrew', secret);
  const success = db.prepare(`SELECT after_json, entity_id FROM audit_records WHERE action = 'login'`).get() as {
    after_json: string;
    entity_id: string;
  };
  assert.equal(success.after_json.includes(secret), false);
  assert.equal(JSON.parse(success.after_json).username, 'newcrew');
  const stored = db.prepare('SELECT token_hash FROM auth_sessions WHERE id = ?').get(success.entity_id) as { token_hash: string };
  assert.notEqual(stored.token_hash, session.token);

  logout(db, session.token);
  const signedOut = db.prepare(`SELECT action FROM audit_records WHERE action = 'logout'`).all();
  assert.equal(signedOut.length, 1);
  const revoked = db.prepare('SELECT revoked_at FROM auth_sessions WHERE id = ?').get(success.entity_id) as { revoked_at: string | null };
  assert.ok(revoked.revoked_at);
  db.close();
});

test('repeated failed sign-ins are rate limited without counting the blocked attempt', () => {
  resetLoginRateLimit();
  const db = tempDb();
  const admin = actor(db, 'admin');
  createUser(db, admin, {
    username: 'limited',
    displayName: 'Limited',
    role: 'race_day',
    password: 'long-enough',
  });
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.throws(() => login(db, 'limited', 'nope'), (error: unknown) => error instanceof AppError && error.status === 401);
    }
    assert.throws(() => login(db, 'limited', 'long-enough'), (error: unknown) => error instanceof AppError && error.status === 429);
    const failures = db.prepare(`SELECT COUNT(*) AS c FROM audit_records WHERE action = 'login_failed'`).get() as { c: number };
    assert.equal(failures.c, 5);
  } finally {
    resetLoginRateLimit();
    db.close();
  }
});

test('a non-local bind is refused while either default password is still in use', () => {
  const db = tempDb();
  assertBindAllowed(db, '127.0.0.1');
  assertBindAllowed(db, 'localhost');
  assertBindAllowed(db, '::1');
  assert.throws(() => assertBindAllowed(db, '0.0.0.0'), /default password/);
  setPasswordAsOperator(db, 'admin', 'admin-changed');
  assert.throws(() => assertBindAllowed(db, '0.0.0.0'), /default password/);
  setPasswordAsOperator(db, 'crew', 'crew-changed');
  assertBindAllowed(db, '0.0.0.0');
  const admin = findUserByUsername(db, 'admin');
  const crew = findUserByUsername(db, 'crew');
  assert.equal(verifyPassword('admin-changed', admin?.passwordHash ?? ''), true);
  assert.equal(verifyPassword(LOCAL_DEV_ADMIN_PASSWORD, admin?.passwordHash ?? ''), false);
  assert.equal(verifyPassword('crew-changed', crew?.passwordHash ?? ''), true);
  const audits = JSON.stringify(db.prepare(`SELECT after_json FROM audit_records WHERE action = 'password_changed'`).all());
  assert.equal(audits.includes('admin-changed'), false);
  assert.equal(audits.includes('crew-changed'), false);
  db.close();
});

test('startup log prints only the default password that was actually seeded', () => {
  const lines = startupLogLines({
    host: '127.0.0.1',
    port: 8080,
    dbPath: 'data/maintenance.sqlite',
    seededDefaultAdminPassword: false,
    seededDefaultCrewPassword: true,
  }).join('\n');
  assert.match(lines, /DEV ONLY - not for real data or networks/);
  assert.match(lines, /127\.0\.0\.1:8080/);
  assert.equal(lines.includes(LOCAL_DEV_ADMIN_PASSWORD), false);
  assert.match(lines, /local-dev-crew/);
});

test('the signed-in user can change a password and the command can too', async () => {
  await withServer(async ({ base }) => {
    const token = await httpLogin(base, 'admin');
    const changed = await api(base, token, 'POST', '/api/me/password', {
      currentPassword: LOCAL_DEV_ADMIN_PASSWORD,
      newPassword: 'route-changed',
    });
    assert.equal(changed.status, 200);
    const oldLogin = await api(base, null, 'POST', '/api/session', {
      username: 'admin',
      password: LOCAL_DEV_ADMIN_PASSWORD,
    });
    assert.equal(oldLogin.status, 401);
    const newLogin = await api(base, null, 'POST', '/api/session', {
      username: 'admin',
      password: 'route-changed',
    });
    assert.equal(newLogin.status, 200);
  });

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-password-'));
  const dbPath = path.join(directory, 'maintenance.sqlite');
  const result = spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', 'src/password-cli.ts', 'crew', 'cli-changed'],
    { cwd: process.cwd(), env: { ...process.env, DB_PATH: dbPath }, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes('cli-changed'), false);
  assert.match(result.stdout, /Password updated for crew/);
  const db = openDatabase(dbPath);
  const crew = findUserByUsername(db, 'crew');
  assert.equal(verifyPassword('cli-changed', crew?.passwordHash ?? ''), true);
  assert.equal(verifyPassword(LOCAL_DEV_CREW_PASSWORD, crew?.passwordHash ?? ''), false);
  const audit = JSON.stringify(db.prepare(`SELECT after_json FROM audit_records WHERE action = 'password_changed'`).all());
  assert.equal(audit.includes('cli-changed'), false);
  db.close();
});
