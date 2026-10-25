import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.ts';
import { assertBindAllowed, startupLogLines } from './auth.ts';
import { prepareDatabase } from './bootstrap.ts';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST?.trim() || '127.0.0.1';
const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'maintenance.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const { db, seededDefaultAdminPassword, seededDefaultCrewPassword } = prepareDatabase(dbPath);
assertBindAllowed(db, host);
const server = createApp(db);

server.listen(port, host, () => {
  for (const line of startupLogLines({
    host,
    port,
    dbPath,
    seededDefaultAdminPassword,
    seededDefaultCrewPassword,
  })) {
    console.log(line);
  }
});
