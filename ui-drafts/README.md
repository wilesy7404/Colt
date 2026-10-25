# UI drafts — Race Team Maintenance System

Static phone-first mockups for a one-car team (2004 Nissan 350Z, NASA/SCCA). These pages are drawings for review. They are not a working app, they do not save data, and they do not calculate maintenance.

Open `index.html` in a browser. There is no build step.

Sample values are example data. Where a real value would go, the screens say `— not set —`, `EXAMPLE`, `UNKNOWN`, or `TBD (admin rule required)`. No interval number, torque number, part number, or maintenance history is invented. Status line on every screen: `Sync: not implemented`.

The wheel stud service rule shows source `Team policy (community research) v1` and revision `v1`, with the statement “Team starting point, not a factory interval or a guarantee.” Its lap, engine-hour, and calendar intervals stay `TBD (admin rule required)`. Other example rules show source and revision as `— not set —`.

The Version 2 prototype at the repository root is a separate file. These drafts do not modify it.

## Screens

### 1. Event prep — `event-prep.html`

Race-day readiness. Safety-critical items, overdue and approaching maintenance, open defects, stock, required inspections, and tools.

Entities: vehicle, safety check, inspection, service rule (source, revision, lap interval, engine-hour interval), defect, component, kit/stock, reorder threshold, event (name and date unset). The wheel stud rule source is `Team policy (community research) v1`. Other rules on this screen have source and revision `— not set —`.

### Stud break — `stud-break.html`

Fast phone log for a wheel stud break. Linked from event prep and from the stud-set screen. Corner (FL, FR, RL, RR), stud position in the set of five, kit / stock ID, laps and engine hours, event, torque method (words only, no torque number), wheel type, nut type, notes, and a photo placeholder.

Laps and engine hours are prefilled only in an example “known reading” state, using the token `EXAMPLE`. Otherwise they are `UNKNOWN`. They are never `0`, and a blank is not treated as okay. The photo control does not attach a file. Nothing is saved.

Entities: defect / failure evidence, wheel position, stud position, kit/stock ID, lap reading, engine-hour reading, event, torque method (not a torque value), wheel type, nut type, notes, photo placeholder.

### 2. Pre-session — `pre-session.html`

Checklist and usage capture before an outing. Laps and engine hours are separate inputs.

Entities: checklist line, session usage (laps), session usage (engine hours), vehicle readings. The two usage metrics are not converted.

### 3. Component life — `component-life.html`

One example card for each status: not due, approaching due, due, overdue, failed inspection, and unknown. Unknown is hatched and is never shown as healthy. Labels are not calculations.

Entities: component, component ID, catalog part number, kit/stock ID, lap reading, engine-hour reading, service rule (source, revision, intervals), inspection result. The wheel stud card uses source `Team policy (community research) v1`. The other cards use source and revision `— not set —`.

### 4. Defects — `defects.html`

Report, then triage, then resolve. Resolve stays blocked until a work record or an inspection record is linked. Linked states are example tokens and are not saved.

Entities: defect, severity, component, inspection, work / maintenance record, technician, sign-off, evidence.

### 5. Replacement sign-off — `replacement.html`

All-or-nothing replacement. Partial / failed validation and an example commit state. Nothing is saved, no stock is consumed, and no interval is reset unless every required field validates and the whole transaction commits. This mockup never commits.

Entities: installation/removal record, old component ID, new component ID, approved catalog part number, vehicle position, lap reading, engine-hour reading, required measurement, required inspection, technician, removal reason, disposition, notes, service rule source, service rule revision, stock movement, service baseline (laps and engine hours stay independent). The example rule is the wheel stud rule: source `Team policy (community research) v1`, revision `v1`, intervals `TBD (admin rule required)`. Showing that rule does not commit the transaction.

### 6. Wheel studs — `wheel-studs.html`

Sealed sets of five. Kit/stock ID per set, sealed versus opened/used, per-stud IDs and wheel positions where tracked, a block on mixing studs from different sets, removal reason and failure evidence, and an early reorder warning.

Entities: kit/stock ID, sealed set, stud component ID, wheel position, opened/used state, catalog part number, removal reason, failure evidence, disposition, reorder threshold, stock count, service rule source, service rule revision. Source `Team policy (community research) v1`. Intervals `TBD (admin rule required)`. The break log is linked from this screen.

### 7. Component detail — `component-detail.html`

Admin, on a phone and on a desktop. Catalog part number, component ID, and kit/stock ID are separate. Installation and removal history stays after removal.

Entities: catalog part number, component ID, kit/stock ID, installation record, removal record, vehicle position, lap reading, engine-hour reading, technician, procedure/source revision, removal reason, disposition, measurement, inspection, notes.

### 8. Service rules — `service-rules.html`

Admin editor and a locked race-day view, showing the wheel stud rule. Lap interval, engine-hour interval, calendar interval, warning threshold, critical threshold, inspection limits, required measurements, required sign-offs, safety criticality, approved procedure, source, and revision. Source is `Team policy (community research) v1`. Revision is `v1`. Intervals are `TBD (admin rule required)`, not numbers. Lap and hour thresholds are independent and are not converted. Edits are admin-only and would be audited. This draft writes no audit row. Race-day users see the same source and revision and cannot change them.

Entities: service rule, audit entry (shape only), admin role, race-day role.

Index of the screens: `index.html`.

## Open questions for the backend

1. Event prep blocks a ready status on a failed safety check or an unresolved critical defect. Does unknown on a safety-critical component also block, or only display as unknown?
2. Is a safety check its own record, an inspection, a checklist line, or some of each?
3. Are session laps and engine hours deltas or meter totals? Who may correct a reading, and is the correction audited? No conversion between the two metrics is defined.
4. May a replacement commit while measurement limits on the service rule are still unset? This draft refuses.
5. The commit is the maintenance record, the stock movement, and the service baseline together. Which other rows must be in that same commit (defect link, stud-set opened/used)? What rolls back if one write fails?
6. Are notes required? This draft treats notes as optional and the other sign-off fields named in the handoff as required.
7. Removal reason and disposition need a vocabulary, or they stay free text. Neither list exists yet.
8. Is a sealed stud set always five studs for one wheel? When does the set flip from sealed to opened/used? Are individual stud IDs mandatory or only when someone tracks them?
9. Mixing is blocked at assignment in this draft. Should a stock move that would split a set be blocked the same way?
10. Reorder counts sealed sets only, or opened sets as well? The threshold is an admin setting and is not supplied.
11. What failure evidence must be attached before a stud removal can commit? The fields are empty here.
12. Which component-history fields are immutable after commit? Confirm a removed component row is never deleted and its ID is never reused.
13. Does a rule allow one approved catalog part number or a list of alternates? None are supplied.
14. Who may publish a rule revision, and which audit fields are stored? Race day is read-only in the draft; the server still has to refuse a rule change from that role.
15. An inspection without replacement is a separate record. Confirm it does not move a lap baseline or an hour baseline.
16. IDs that start with `EXAMPLE` must never be loaded as inventory or history for the car. How will seed data be kept out of the real vehicle?
17. ID formats (component, kit, stud, work, inspection) are not chosen.
18. Forecasts, purchasing, and user administration are in the handoff and are not screens in this draft.
19. The stud-break photo control is a placeholder. What a stored evidence file must contain, and who may attach it, is undecided. This draft does not take or keep a photo.
20. When laps or engine hours are unknown at a break, the value stored should be an explicit unknown, not zero and not an empty field that later reads as healthy. Who is allowed to replace that unknown with a reading later is undecided.
