import fs from 'node:fs';
import path from 'node:path';
import { setPasswordAsOperator } from './auth.ts';
import { prepareDatabase } from './bootstrap.ts';
import { isAppError } from './errors.ts';

const username = process.argv[2];
const password = process.argv[3];
if (!username || password === undefined) {
  console.error('Usage: node src/password-cli.ts <username> <new-password>');
  process.exit(1);
}

const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'maintenance.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const { db } = prepareDatabase(dbPath);
try {
  setPasswordAsOperator(db, username, password);
} catch (error) {
  const message = isAppError(error) ? error.message : 'Password was not changed.';
  console.error(message);
  process.exit(1);
}
console.log(`Password updated for ${username}.`);
