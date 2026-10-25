# Complete Project Handoff — Race Team Maintenance System

The disposable localStorage prototype has been moved to `archive/prototype/` and is not the product. Phase 1 is the Node.js and SQLite ledger in the root README. The requirements below still apply. This repository does not ship with service intervals or maintenance history.

## Mission
Build a dependable maintenance and inventory application for a one-car road-racing team. Prevent failures before race weekends, track component life, document completed work, and ensure parts are available before events.

## Vehicle and use
- Vehicle: 2004 Nissan 350Z.
- Competition: NASA and SCCA road-course events.
- Start with fresh records; never invent historical maintenance.
- Track usage in both laps and engine hours.
- Failure prevention is the priority, especially safety-critical failures such as snapped wheel studs.

## Platforms and architecture
- Responsive web interface that works on desktop and phone.
- Simple mobile/race-day workflow.
- Detailed admin interface accessible from both desktop and phone.
- Long-term iPhone app in addition to the web app.
- Offline use is required for the paddock; synchronize safely when connectivity returns.
- Preferred direction: responsive PWA first, backed by a real shared database/API; evaluate a native iPhone client later.
- Do not claim cross-device sync/offline sync until implemented and tested.

## Roles
### Admin
Can manage users/permissions, part catalog, inventory, service rules, intervals, inspection procedures, measurements, event plans, forecasts, and reports. Admin access must work on desktop and phone.

### Race-day user
Can complete pre-event/pre-session checklists, record laps/hours, report defects, see due/overdue items, follow approved work instructions, record replacement work, and sign off. Mobile users must not silently change service intervals or approved rules.

## Identity and component history
Keep these distinct:
- Catalog/part number: type of part.
- Component ID: identity of a specific physical component/assembly.
- Kit/stock ID: identity of a sealed kit or stock unit.
- Installation/removal record: history of a physical component's use.

Preserve old-component history forever. Replacement records should capture old/new component IDs, approved part number, date, vehicle position, lap/hour readings, measurements, inspection results, technician, removal reason/disposition, notes, and procedure/source revision.

## Wheel studs and sets of five
Wheel studs need special tracking because studs have snapped previously.
- Support sealed, labeled sets of five.
- Each set has its own kit/stock ID and remains traceable.
- Do not silently mix studs from different sets.
- Track inventory in complete sets and record when a set is opened/used.
- Where individually tracked, retain each stud ID and wheel position.
- Record removal reason and failure evidence.
- Provide early reorder warnings.
- Do not invent replacement intervals; derive rules from verified specifications, team engineering policy, applicable racing rules, and documented failure investigation.

## Maintenance rules
Admin-configurable fields may include component/category, action, lap interval, engine-hour interval, calendar interval, warning threshold, critical threshold, inspection limits, required measurements/sign-offs, safety criticality, approved procedure, source and revision.

Statuses should distinguish not due, approaching due, due, overdue, failed inspection, and unknown due to missing history/readings. Missing data must not mean healthy. Lap and engine-hour thresholds are independent metrics; do not convert between them without an approved rule.

### Atomic replacement/sign-off requirement
Do not reset an interval because a form was opened or a button clicked. A replacement transaction must validate the approved part, component identities, readings, required inspection/measurements, and sign-offs. Save the maintenance record, stock movement, and service baseline as one atomic transaction. If validation or persistence fails, do not consume inventory or reset the interval. Inspections without replacement are separate records.

## Race readiness and event prep
Before an event, review safety-critical items, overdue/approaching maintenance, defects, stock, tools, and required inspections. Before each outing, provide a quick checklist and usage capture. Failed safety checks or unresolved critical defects must produce a clear warning and prevent a false ready status; the software does not certify vehicle safety.

Forecast likely maintenance before the next event using current readings, approved rules, expected laps/hours, schedule, stock, and supplier lead times. Label forecasts as estimates, not guarantees.

## Inventory and purchasing
Support approved catalog items, units, sealed kits, locations, stock movements, reorder thresholds, minimum/desired stock, suppliers, purchase notes/orders, stock reserved for events, and traceability from installed components to stock. Deduct inventory only when a valid completed transaction consumes it. Prevent negative stock unless an authorized exception is explicitly recorded.

## Offline/sync
Eventually support offline reads, inspections, session logs, draft maintenance transactions, and a pending-sync queue. Use stable IDs, transaction IDs, idempotent submission, permission checks, conflict detection, and visible audit trails. Never silently overwrite a newer admin rule with a stale offline edit. Flag safety-critical conflicts.

## Security and audit
Use real authentication and server-enforced authorization. Validate maintenance/inventory changes server-side. Audit rule edits, component changes, stock movements, and sign-offs. Implement tested backup/restore. Browser local storage is not the production source of truth.

## Existing prototype status
The earlier Version 2 prototype had a responsive single-page interface, overview, race-day checklist/session logging, parts/kits, service rules, event prep, a replacement sign-off modal, PWA manifest/icon, and app-shell service worker. Its data was local browser storage and it used illustrative demo data. JavaScript syntax had been checked, but this did not prove complete behavior or safety. The original ZIP download was failing in ChatGPT; this GitHub repository is the intended access path.

## Not yet complete
- Production/shared database and API.
- Real user accounts/permissions.
- Cross-device sync and conflict resolution.
- Robust offline write queue.
- Production backups/restore.
- Full audit trail.
- Push notifications.
- Native iPhone package.
- Verified maintenance rules and procedures.
- Full automated/integration tests.
- Production deployment.

## Recommended implementation order
1. Inspect existing prototype; establish data model, stable IDs, permissions, server validation, backup/restore.
2. Implement atomic maintenance transactions and tests for invalid/incomplete/duplicate work.
3. Build race-day checklist, session usage logging, component life, defects, and warning states.
4. Add sealed kit inventory, stock movements, reorder workflow, and event forecast.
5. Implement offline queue, safe synchronization, and admin on phone/desktop.
6. Test permissions, interrupted transactions, sync conflicts, backups/restoration, and demo-data isolation before release.

## Product principles
- Make mobile workflows fast and simple.
- Admin must work on phone and desktop.
- Prevent failures, not merely record them.
- Preserve component identities and history.
- Never reset intervals without completed, validated work.
- Never fabricate maintenance history or technical recommendations.
- Make unknown data explicit.
- Do not claim a feature is complete until it is implemented and tested.
