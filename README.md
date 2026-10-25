# Race Team Maintenance

Phase 1 ledger for a one-car road-course team (2004 Nissan 350Z, NASA/SCCA). It is a local API and SQLite database with server-enforced roles, stable record IDs, sealed wheel-stud sets of five, all-or-nothing replacement commits, and a tested backup/restore path.

The old browser prototype is archived under `archive/prototype/` for reference. It is not the application, and the API does not serve that directory. `PROJECT_HANDOFF.md` is still the product requirements document.

## Stack

Default for this phase: Node.js 22 and its built-in SQLite (`node:sqlite`), with local usernames and passwords. There is nothing to install beyond Node, no separate database server, and no paid host. The schema is ordinary SQL and sign-in lives in `src/auth.ts`, so the database or login can be swapped later without rewriting the ledger.

The service is the source of truth. The page at `/` is a smoke check, not the race-day phone UI.

### Confirm before anything is deployed or costs money

Nothing in this repository is deployed. These are the choices to confirm before a host or a paid login is introduced:

1. **Recommended for now.** Keep this Node.js + SQLite process on a computer you already use, with the `admin` and `crew` passwords. Backups are the tested JSON export. Cost: none beyond that computer.
2. **Same program, your own always-on machine.** A shop PC you already own can serve phones on that network only after two steps. Change both `admin` and `crew` off the default passwords (`POST /api/me/password` while signed in, or `npm run password -- <username> <new-password>`). Then start with an explicit `HOST`, for example `HOST=0.0.0.0 npm start`. On every startup the process refuses a non-local bind while either default password still works. Those defaults are DEV ONLY - not for real data or networks. Still SQLite. Copy or export the database file yourself. No new hosting account.
3. **Defer.** A rented server, hosted Postgres, or a paid login service (Apple, Google, Auth0, Clerk, and similar) is a later decision. Those can cost money and are not required for the ledger, the roles, or the backup test.

Do not treat option 3 as selected.

## Run locally

Requires Node.js 22.18 or newer.

```bash
npm start
```

Then open `http://localhost:8080`.

The first launch creates `data/maintenance.sqlite`. It seeds:

- The vehicle identity only (2004 Nissan 350Z). Lap and engine-hour totals stay empty until a session is recorded. There is no maintenance history.
- Two local users, if the user table is empty.

Default local passwords (DEV ONLY - not for real data or networks). The server log prints that label and a password only for an account that was actually created with the default on that launch:

| Role | Username | Password |
| --- | --- | --- |
| Administrator | `admin` | `local-dev-admin` |
| Race-day | `crew` | `local-dev-crew` |

Set `ADMIN_PASSWORD` and `CREW_PASSWORD` before the first launch to choose different passwords. `NODE_ENV=production` refuses to create the defaults. Changing the environment variables later does not rewrite an existing database. Delete `data/maintenance.sqlite` to start over. This build expects schema version 2 and will not guess a migration from an older file.

`PORT` defaults to `8080`. `HOST` defaults to `127.0.0.1` (it does not listen on every interface). `DB_PATH` overrides the database file.

Change a password after launch with `POST /api/me/password` (`currentPassword` and `newPassword`) or locally with `npm run password -- <username> <new-password>`. The command does not print the new password. Failed sign-ins are rate limited in memory (5 failures, then HTTP 429 for 15 minutes). That limit resets when the process restarts.

## Tests

```bash
npm test
```

GitHub Actions runs that same command on Node.js 22 (`.github/workflows/test.yml`).

## What this milestone includes

- Tables and relationships for vehicles, users, parts, sealed kits, stock movements, components, installations, removals, maintenance rules, inspections, sessions, events, defects, maintenance transactions, service baselines, and audit records. Domain records use stable text IDs.
- Part number, component ID, and kit/stock ID are different records. Component history is append-only. A component's kit ID cannot be changed, so studs cannot be moved from one sealed set to another.
- Wheel studs are a `sealed_stud_set` part. The database requires exactly five studs per set. Opening a set records five component IDs and does not consume stock. A set is consumed only inside a committed maintenance transaction.
- Maintenance rules store lap, engine-hour, and calendar intervals separately, plus a required source and revision. No intervals are seeded. An illustrative draft cannot be marked active.
- Missing readings, missing baselines, and missing rules are reported as **unknown**. Unknown is not treated as healthy. A failed inspection or an open critical defect blocks a "no known blockers" result. The API does not certify the car.
- Administrator and race-day roles are checked on the server. A race-day user can record sessions, inspections, defects, and completed work. That user cannot create or edit rules, manage users, create parts or kits, adjust stock, configure events or vehicles, export or restore a backup, read the audit log, or close a critical defect.
- Sealed stud-set rules are assessed per corner, and an inspection counts only for the corner of the stud that was inspected. A pass at one corner does not clear a fail at another. A corner with no recorded set is unknown, and a corner with no inspection stays unknown when the rule requires one, rather than healthy. Unknown blocks the car. One overdue corner makes the car overdue even if another corner was just serviced. Other rules are assessed for the vehicle.
- A replacement or initial installation of a five-stud set commits in one database transaction: validation, installations, removals, stock consumption, the service baseline, sign-offs, and the audit row succeed or roll back together. Sign-offs record the signed-in user and a server timestamp. A client-supplied signer id or time is not accepted. An administrator may name a different active signer only by setting an explicit verified sign-off (`adminVerified: true`), and an inactive signer is rejected. The technician is the signed-in user. At most one active component is allowed per position. Installing over an occupied corner requires a replacement that records the removal in that same transaction. A draft, an abort, a missing sign-off, or a missing required reading leaves stock and baselines unchanged. Committing the same transaction again does not consume the set twice. An inspection or a session does not reset an interval.
- JSON backup export and restore (`GET /api/admin/export`, `POST /api/admin/restore`, or `npm run backup:export -- <file>` / `npm run backup:restore -- <file>`). `npm test` covers a checksum mismatch, a round trip of every table, and restores rejected for an integrity failure, a missing table, a wrong schema version, or malformed JSON. Each rejected restore leaves the existing database unchanged. A successful restore replaces audit history and sessions with the snapshot, then writes one restore audit row in that same transaction. Copying the SQLite file is not what the automated test covers.

## API sketch

Sign in:

```bash
curl -s -X POST http://localhost:8080/api/session \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"local-dev-admin"}'
```

Send `Authorization: Bearer <token>` on later requests. Useful routes include `/api/health`, `/api/vehicles`, `/api/vehicles/:id/assessment`, `/api/parts`, `/api/kits`, `/api/kits/:id/open`, `/api/maintenance-rules`, `/api/maintenance-transactions`, `/api/inspections`, `/api/sessions`, `/api/events`, `/api/defects`, and `/api/admin/export`.

Backup files contain password hashes. Keep them private. An export is the tested restore path. It is not an offsite backup service.

## How a stud-set replacement stays atomic

1. Create a draft maintenance transaction. That write does not touch stock or baselines.
2. Commit re-checks, inside the write transaction, the active rule, the opened set of five, component IDs, readings required by that rule, measurements, and sign-offs. The kit row is updated only when that update changes exactly one opened set.
3. If validation fails, the transaction stays a draft and stock, baselines, installations, and kit state are unchanged.
4. If validation passes, the same SQLite transaction marks it committed, writes installations and removals, consumes the set, inserts the service baseline, and writes the audit row. Database triggers reject a baseline or a stock consumption unless that transaction is already committed. A failure rolls the whole unit back.
5. The previous component rows stay in the database. A replacement supersedes the old installation and records a removal. It does not delete history, and it does not edit the rule's interval.

## Remaining limitations

- Offline reading and writing are not implemented. There is no sync queue, conflict handling, or cross-device sync.
- There is no native iPhone app. The smoke page is not a phone workflow for race day.
- Nothing here is a verified service interval, torque spec, procedure, or replacement recommendation. Those fields stay empty until an administrator enters a source and revision.
- No historical maintenance is loaded. Recorded lap and engine-hour totals count only sessions saved in this database. Life before that is unknown.
- This is not a production deployment. Authentication is a local username and password, not an identity provider. Session tokens last seven days.
- The JSON restore path is tested for a full-table round trip and for rejected snapshots. Restore replaces the database, including audit history and sessions, then adds one restore audit row. It does not merge with rows that were added after the export. Copying the SQLite file is possible, but that file copy is not what the automated test covers. There is no offsite or scheduled backup.
- Audit rows are written in the same transaction as the change they record, including user creation, sign-in (success and failure), sign-out, and password changes. Failed sign-in attempts are not stored with the password. The in-memory sign-in limit resets when the process restarts. The log is not a complete workshop management system.
- The process binds to `127.0.0.1` unless `HOST` is set. A non-local `HOST` is refused on every startup while either default password still matches. Those passwords are DEV ONLY - not for real data or networks.
- There is no schema migration. Delete `data/maintenance.sqlite` to move off an older file.
- `archive/prototype/` is reference material. The API does not serve it.
- Concurrent edits are not covered by an automated race test. The commit path re-checks kit and component state inside the write transaction, and the database allows only one active component per position.
- Purchasing, supplier lead times, and event forecasting are not implemented. Reorder status is only a comparison with an administrator-entered threshold, and an unset threshold stays unknown.
- The stud transaction that is tested installs or replaces one wheel's five studs from a single opened set. Other component types, partial sets, and backdated corrections are not built out.
- Timestamps on sessions use server time. Work transactions require an explicit `performedAt`.
- The software does not certify that the vehicle is safe to race.
