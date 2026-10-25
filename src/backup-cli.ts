import fs from 'node:fs';
import path from 'node:path';
import { exportSnapshot, restoreSnapshot, type Snapshot } from './backup.ts';
import { prepareDatabase } from './bootstrap.ts';

const command = process.argv[2];
const file = process.argv[3];
const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'maintenance.sqlite');

if ((command !== 'export' && command !== 'restore') || !file) {
  console.error('Usage: node src/backup-cli.ts export <file.json>');
  console.error('       node src/backup-cli.ts restore <file.json>');
  process.exit(1);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const { db } = prepareDatabase(dbPath);

if (command === 'export') {
  fs.writeFileSync(file, JSON.stringify(exportSnapshot(db), null, 2));
  console.log(`Exported ${file}`);
} else {
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as Snapshot;
  const result = restoreSnapshot(db, snapshot, { actorUserId: null, note: 'CLI restore' });
  console.log(`Restored ${file}`);
  console.log(JSON.stringify(result.restoredCounts));
}

db.close();
