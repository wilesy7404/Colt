import { seedUsersAndVehicle } from './auth.ts';
import { openDatabase } from './db.ts';
import type { DatabaseSync } from 'node:sqlite';

export function prepareDatabase(dbPath: string): {
  db: DatabaseSync;
  seededDefaultAdminPassword: boolean;
  seededDefaultCrewPassword: boolean;
} {
  const db = openDatabase(dbPath);
  const seeded = seedUsersAndVehicle(db);
  return { db, ...seeded };
}
