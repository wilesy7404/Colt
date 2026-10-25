# Test plan — Colton's Race Team Maintenance System

This is the acceptance plan for the rebuild of the maintenance and inventory system for the team's 2004 Nissan 350Z (NASA and SCCA road racing).

The current `index.html` prototype is a throwaway. These tests are written against `PROJECT_HANDOFF.md`. They do not describe that prototype, and a pass on the prototype does not count.

The plan does not assume a programming framework, a database product, or a screen layout. Where a result depends on a decision the handoff does not make, the case says **Open question** and gives an ID. Do not fill that gap by observing whatever the software happens to do.

## How to read a case

Each case has an ID, a priority, and a mode.

| Priority | Meaning |
| --- | --- |
| P0 | Stop. Do not put real car records in this build, and do not take it to a race weekend. |
| P1 | Fix before calling that feature done. A crew member could be misled or could have to redo work. |
| P2 | Fix when practical. Wording, layout, or a rare edge that still fails safe. |

| Mode | Meaning |
| --- | --- |
| Automatable | A script can decide pass or fail from stored records and server answers. |
| Manual | A person checks a screen, a file, or a printout. |
| Both | A script checks the records, and a person checks what the crew would read. |

**Refuse** means the server rejects the request. The shelf, the service clock, and the history stay as they were. Hiding a button is not a pass.

**Allow** means a signed-in person with that role can complete the action, and the server still checks the rest of the rules.

**TBD** means the handoff does not name who may do it. Until the team writes Allow or Refuse in the role matrix, the server refuses the write.

## Words used in the tests

| Word | Meaning |
| --- | --- |
| Catalog part | The kind of part, for example a sealed wheel-stud set. |
| Component | One physical part or assembly on the car, with its own ID. |
| Kit / stock ID | The ID of one sealed set or one stock unit. Stud sets are not mixed in silence. |
| Baseline | The lap reading, engine-hour reading, and date the interval counts from. |
| Ready lamp | The single indicator a crew member could read as "good to go." Green, or the words Ready, OK, Good, or Healthy, count as the lamp on. |
| UNKNOWN | The word UNKNOWN, on screen and in the stored status. A blank, a dash, a zero, or "not due" is not UNKNOWN. |
| Complete job | The history line, the stock movement, the new baseline, and the log effects are all present. Anything less is a failed test. |
| Demo data | Sample records for training or screenshots. They are not the car's history. |

The only role names in this plan are the two in the handoff: **Admin** and **Race-day user**. Any other role is TBD until it is added to the role matrix.

## Standard test garage

Use this setup unless a case says otherwise. None of these names are real Nissan part numbers, and none of the rules are a real service interval.

- The garage has no demo data in the real car's records.
- Two accounts exist: one Admin, one Race-day user. No other roles.
- The car is the team's 2004 Nissan 350Z. History starts empty.
- Catalog item: `TEST-STUD-SET`, described as a test wheel-stud set, sealed, five studs.
- Two kits on the shelf: `TEST-KIT-001` and `TEST-KIT-002`. Both sealed, five studs each, both the test catalog item.
- One component for the wheel under test, ID `TEST-WHEEL-STUDS`. The wheel position is whichever position the tester selects and then keeps using.
- The Admin enters one approved rule for that component. The source text is exactly `TEST SOURCE — not a real interval`. The revision is `TEST-REV-1`. The Admin types the lap interval, the engine-hour interval, and the calendar interval during setup. This plan deliberately contains no interval numbers, torque values, or wear limits.
- The rule lists the measurements and failure evidence that the job requires. The happy-path job includes every item on that list.
- The Race-day user is the person who signs off a replacement, unless the case names someone else.

A script may create this garage. A person may create it on screen. Either way, the records must be the ones the test entered.

## What "unchanged" means

When a case says the garage is unchanged, all of the following are true:

- The same kits are sealed, and the sealed count is the same.
- The baseline readings and date are the same.
- No installation or removal line was added.
- The approved rule still has the same source, revision, and intervals.
- The maintenance log has no new success entry.
- No demo record appeared.

## Documents

| Document | What it decides |
| --- | --- |
| [atomic-transactions.md](atomic-transactions.md) | A stud job is saved completely, or the garage is unchanged. Sealed sets of five, partial sets, short stock, and a set opened by mistake. |
| [roles-and-authorization.md](roles-and-authorization.md) | The server enforces the role matrix, including direct requests and replayed requests. |
| [unknown-and-readiness.md](unknown-and-readiness.md) | Missing, stale, or corrupt data shows UNKNOWN. The ready lamp stays off. |
| [audit-trail.md](audit-trail.md) | Each committed create, update, delete, consume, and reset is logged once, with who, when, what, before, and after. |
| [backup-restore.md](backup-restore.md) | Export, empty restore target, compare. Bad files do nothing. Demo data stays separate. |
| [concurrency.md](concurrency.md) | Two people, one set left, two resets, a stale save, and an edit racing a delete. |
| [release-honesty.md](release-honesty.md) | The short checklist to tick before any release the crew might trust. |

## Release gate

A build can be used for real car records only when all of the following are true:

1. Every P0 case has passed, or the case is explicitly waiting on an open question that this gate still requires the team to answer.
2. The open questions marked **Blocks release** below are answered in writing, the matrix or the case is updated, and the related P0 cases have passed.
3. Every item in [release-honesty.md](release-honesty.md) is ticked for this build.
4. Cases that need a forced failure in the middle of a save or a restore (AT-10, AT-11, AT-12, AT-13, AT-14, AT-15, AT-18, BR-11) have been run with a harness. A happy-path run does not stand in for them.
5. Nobody marked a case passed because the old prototype did something similar.

Write the date, the build name, the tester, the P0 result, and any open question still blank. Keep that note with the release.

These questions block a race-weekend release. The server refuses the related write until they are answered. That refusal is not the same thing as the feature being done.

| ID | Question | Where |
| --- | --- | --- |
| AQ-UNK-1 | What makes a record stale? | [unknown-and-readiness.md](unknown-and-readiness.md) |
| AQ-ROLE-1 | Who may export a backup, and who may restore one? | [roles-and-authorization.md](roles-and-authorization.md) |
| AQ-ROLE-7 | May an Admin account perform race-day writes? | [roles-and-authorization.md](roles-and-authorization.md) |
| AQ-ROLE-9 | Who may read the maintenance log on screen? | [roles-and-authorization.md](roles-and-authorization.md) |
| AQ-BR-1 | How do accounts work after restore, without plain-text passwords in the file? | [backup-restore.md](backup-restore.md) |
| AQ-AT-2 | Which harness will stop a save or a restore in the middle? This is a tool to build, not a product guess. | [atomic-transactions.md](atomic-transactions.md) |

Other open questions are listed in the documents. Several of them already have a fail-closed result (the server refuses). Those refusals are tested now. The feature that would allow the write stays undone until the question is answered.

| ID | Question | Fail-closed behavior already tested |
| --- | --- | --- |
| AQ-AT-1 | How a repeated save is recognized as the same job | Same job cannot be applied twice |
| AQ-AT-3 | Leftover studs after a legal open | Using part of a still-sealed set is refused |
| AQ-AT-4 | A recorded mix of two stud sets | A mix with no record is refused |
| AQ-AT-5 | Whether reserved stock can be used for another job | Looking at the screen does not reserve a set |
| AQ-AT-6 | Who may authorize negative stock | Negative stock is refused for both roles |
| AQ-AT-7 | A recorded "seal this set again" action | Erasing an open is refused |
| AQ-AT-8 | Readings required beyond the rule's own list | A metric the rule uses needs a reading; sign-off is always required on a replacement |
| AQ-AT-9 | Whether individual stud tracking is on in the first release | A saved install always keeps the kit ID; a partial list of stud IDs is refused |
| AQ-ROLE-2 | Who may correct history, if anyone | History cannot disappear without a log entry |
| AQ-ROLE-3 | Who may change or delete a log entry, if anyone | Both roles are refused today |
| AQ-ROLE-4 | Race-day access to reports, forecasts, and other people's defects | Those writes and views stay refused |
| AQ-ROLE-5 | Sign-in lifetime and how a replay is recognized | A request from a signed-out person is refused |
| AQ-ROLE-6 | Exact refusal wording | The person can tell the save did not happen |
| AQ-ROLE-8 | How the first Admin account is created | Out of scope for behavior tests; setup must be written down before go-live |
| AQ-UNK-2 | Does "approaching due" turn the ready lamp off? | The item itself shows approaching due, not healthy and not UNKNOWN |
| AQ-UNK-3 | Colors and short labels | UNKNOWN is the word for missing data; the ready lamp is off |
| AQ-UNK-4 | Full list of corrupt-record checks | The examples in the unknown plan are already P0 |
| AQ-UNK-5 | Overdue item that is not safety-critical | An overdue safety-critical item keeps the lamp off |
| AQ-AUD-1 | One log note for the job, or one note per effect | Each effect is present once; the grain may be either |
| AQ-AUD-2 | Whether failed attempts are logged | No success entry on a failed save. See the recommendation in the audit plan |
| AQ-AUD-3 | Time zone on log entries, and whether the log is inside the backup | Server time is stored; a client-supplied time cannot rewrite it |
| AQ-AUD-4 | Whether a restore writes one log entry | A failed restore writes no success entry |
| AQ-BR-2 | Where the format version sits in the file | A file with no version, or an unsupported version, is refused |
| AQ-BR-3 | Will an older backup be migrated on purpose? | Until a migration is written down, that older version is refused |
| AQ-BR-4 | How a training copy is stored, and who may open it | Demo rows cannot sit in the real car's records unlabeled |
| AQ-CC-1 | How a stale write is detected | The older save is refused on the server |
| AQ-CC-2 | Words shown when a save loses a race | The loser's job is not shown as saved |

## Out of scope until a later plan exists

Do not run these, and do not claim them:

- Offline use and a paddock sync queue.
- A native iPhone app. A phone browser, including an icon on the home screen, is the web app.
- Push notifications.
- Real 350Z, NASA, or SCCA intervals. The team adds those later, with a source and a revision.
- Any behavior that exists only in the throwaway prototype.

Two people using the live server at once **is** in scope. That is the concurrency plan. It is not a claim of offline sync.

## For the people building the system

These cases are the acceptance bar, not a design. When an open question is still blank, fail closed: do not consume a set, do not move a baseline, do not write a partial history, and do not turn the ready lamp on.
