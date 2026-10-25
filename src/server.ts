import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.ts';
import { LOCAL_DEV_ADMIN_PASSWORD, LOCAL_DEV_ADMIN_USERNAME, LOCAL_DEV_CREW_PASSWORD, LOCAL_DEV_CREW_USERNAME } from './auth.ts';
import { prepareDatabase } from './bootstrap.ts';

const port = Number(process.env.PORT ?? 8080);
const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'maintenance.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const { db, usedDefaultPasswords } = prepareDatabase(dbPath);
const server = createApp(db);

server.listen(port, () => {
  console.log(`Race Team Maintenance API listening on http://localhost:${port}`);
  console.log(`SQLite database: ${dbPath}`);
  console.log('Phase 1 foundation. Offline sync, cross-device sync, and a native iPhone app are not implemented.');
  if (usedDefaultPasswords) {
    console.log('Local development accounts were created with the default passwords.');
    console.log(`  administrator  ${LOCAL_DEV_ADMIN_USERNAME} / ${LOCAL_DEV_ADMIN_PASSWORD}`);
    console.log(`  race-day       ${LOCAL_DEV_CREW_USERNAME} / ${LOCAL_DEV_CREW_PASSWORD}`);
    console.log('Set ADMIN_PASSWORD and CREW_PASSWORD before first launch to choose different passwords.');
    console.log('NODE_ENV=production refuses these defaults.');
  }
});
