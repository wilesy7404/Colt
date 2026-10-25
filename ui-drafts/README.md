# UI drafts — Race Team Maintenance System

1. Download the repo ZIP from the ui/raceday-draft branch and unzip it.
2. Open the ui-drafts folder.
3. Double-click index.html.

That opens the preview in a browser from the file on disk. Nothing else needs to be installed, and no server is required.

Static phone-first mockups for a one-car team (2004 Nissan 350Z, NASA/SCCA). These pages are drawings for review. They do not save data, and they do not calculate maintenance. Links and scripts use relative paths only.

Open `index.html` in a browser. There is no build step.

Each screen has one quiet `Example data` tag. Sample readings include the word `EXAMPLE`. Empty values say `— not set —` or `UNKNOWN`. A rule or practice the owner has not approved shows as `Proposed - not approved`. No interval number, part number, or maintenance history is invented.

Status chips are Ready, Due, Blocked, or Unknown. Unknown is grey and outlined. It is not a pass. Missing data stays Unknown. Blocking problems are one short line.

The safety line and `Sync: not implemented` are only on Settings (`about.html`).

The old prototype lives under `archive/prototype/`. These drafts do not modify it.

## Main screens

The index and the bottom nav lead with these five:

1. Car overview — `overview.html`. Brakes expands to pads, rotors, and fluid. Fluids and oils, tires, suspension, engine and drivetrain, and wheels and studs are separate systems. One chip per item. Missing data is Unknown.
2. Event prep — `event-prep.html`. Checklist. A critical defect blocks the screen.
3. Session — `session-log.html`. Laps and engine hours are separate fields. A blank is not zero.
4. Defects — `defects.html`. Report, triage, resolve. Only an admin can close a critical defect. Resolve still needs linked work or an inspection.
5. Log maintenance — `log-maintenance.html`. Any system. Nothing is saved until the whole form commits. Technician defaults to the signed-in user (EXAMPLE User) and a timestamp is kept. Performed at cannot be in the future. Earlier than logged time is marked Backdated. Measurement is none required, not stated (blocks commit), or an entered value.

## Torque

Lug nut torque is `80 ft-lb`, admin-editable on the stud rule. Source: `Owner's manual p. 6-6 · approved by Colton 2026-10-25`. The stud rule also shows `(2004 350Z owner's manual, third-party copy)`.

It appears on the event-prep lug-nut check, the maintenance log when Wheels is selected, the stud rule, and the stud sign-off. The stud-break log records the torque method in words and does not show this value.

## Wheel studs

Secondary pages: `wheel-studs.html`, `stud-break.html`, `replacement.html`.

A set is one labeled bag of 5 for one corner (LF, RF, LR, RR). The UI shows and scans one label. There are no per-stud IDs. Replacement and removal are the whole set. Removed sets are scrapped. Photo or notes stay on the set record. Stud break stores that label, plus an optional “Which position broke” value from 1 to 5 on the same record.

Approved stud name: ARP extended. Part number: — not set —, admin must enter. The set opens only on a successful commit. Stock is sealed bags only. Target 4. Warning at 4 or fewer.

Life: No calendar, lap or hour life. Managed by inspection plus failure data (owner decision 2026-10-25). Source: Colton decision 2026-10-25 (relayed by Sarg). Torque keeps its own source and is not this decision.

## Other screens

`component-detail.html`, `component-life.html`, `service-rules.html` (admin), `restore.html`, `about.html`.

Service rules are admin-editable and locked for race day. Restore is allowed only into an empty system. If the system has data, recovery is a command-line process that archives the database first and does not overwrite.

## Decided

- Corners are LF, RF, LR, and RR.
- A wheel-stud set is one labeled bag of 5 for one corner. One label is shown and scanned. There are no per-stud IDs.
- Replacement and removal are the whole set. The set opens only when the commit succeeds. It is not split.
- Removed sets are scrapped. There is no reuse choice. Failure evidence (photo or notes) is stored on the set record.
- Which position broke (1–5) is optional and is stored on the set record.
- Stock is sealed sets only. Pre-event target is 4. Warning at 4 or fewer.
- Approved stud name is ARP extended. Part number is — not set —, admin must enter.
- Technician defaults to the signed-in user. Every sign-off stores technician and timestamp.
- Performed at in the future is rejected. Earlier than logged time is marked Backdated.
- A measurement is none required, not stated, or an entered value. Not stated blocks commit.
- Only an admin can close a critical defect.
- Restore runs only into an empty system. A system that already has data is recovered from the command line, which archives the database first.
- Lug nut torque is 80 ft-lb. Source: Owner's manual p. 6-6 · approved by Colton 2026-10-25. Admin can edit the value. Detail on the stud rule: (2004 350Z owner's manual, third-party copy).
- Wheel stud life: No calendar, lap or hour life. Managed by inspection plus failure data (owner decision 2026-10-25). Source: Colton decision 2026-10-25 (relayed by Sarg).
- Any other rule or practice the owner has not approved shows as Proposed - not approved. No interval number is invented.

## Open questions

1. Does unknown on a safety-critical part block the event, or only display as Unknown?
2. Is a safety check its own record, an inspection, a checklist line, or some of each?
3. Are session laps and engine hours deltas or meter totals? Who may correct a reading?
4. May a maintenance log commit while measurement limits are still unset? This draft refuses when a measurement is not stated.
5. Which other rows join the commit, and what rolls back if one write fails?
6. Are notes required on an ordinary log? This draft treats them as optional. A stud-set failure still needs a photo or notes.
7. Removal reason still needs a vocabulary, or it stays free text.
8. What must a stored evidence file contain, and who may attach it? This draft does not take a photo.
9. Which history fields are immutable after commit?
10. Does a rule allow one approved part number or a list? None are supplied for studs.
11. Who may publish a rule revision, and which audit fields are stored?
12. Confirm an inspection without replacement does not move a lap or hour baseline.
13. How are values that contain EXAMPLE kept out of the real car?
14. ID formats are not chosen. A stud set uses one label.
15. Forecasts, purchasing, and user administration are not screens here.
16. Who may later replace an explicit UNKNOWN reading?
