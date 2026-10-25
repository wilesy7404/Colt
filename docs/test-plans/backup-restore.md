# Backup and restore

A backup is useful only if a restore brings the garage back whole. The success path is: export, restore onto an empty test copy, compare. A bad file leaves the target garage exactly as it was. A restore never fills gaps with demo data.

Practice bad files on a test copy. Do not point a damaged file at the only copy of real records.

Priorities and modes are defined in [README.md](README.md). Who may export or restore is AQ-ROLE-1. Until that is answered, both named roles are refused (ROLE-M15, ROLE-M16). The data tests below are the bar the feature has to meet once a role is named. Run the refusal now. Run the data tests as soon as one role is Allow, and keep refusing everyone else.

## What "equal" means

Compare the restored garage to the source garage. List order in the file may differ. The time of the export action may differ. Everything else matches, including original log timestamps:

- Catalog parts, components, kit IDs, sealed or opened status, counts, and locations.
- Installation and removal history, baselines, rules, sources, and revisions.
- Defects, checklist results, and event plans that were saved.
- Accounts and roles.
- Log entries.
- DEMO labels, if the test intentionally included a labeled training record.

A plain-text password in the file is a fail. See AQ-BR-1.

## BR-01 — Round trip onto an empty copy

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** This is the proof that a backup is the garage, not a partial sketch.

**Preconditions**

- A source garage that has passed AT-01, has an inspection (AT-03), has an Admin rule edit (AUD-02), and has one open defect.
- A second, empty target. The empty target contains no demo records.

**Steps**

1. Export the source.
2. Restore that file onto the empty target.
3. Export the target.
4. Compare using the list above.
5. Sign in on the target as the Race-day user and as the Admin, using the recovery method from AQ-BR-1 once it exists.

**Expected result:** The target matches the source. Kit `TEST-KIT-001` is used on the same wheel. Kit `TEST-KIT-002` is still sealed. The baseline matches. The log timestamps match. No extra rows exist. Restoring the same file a second time leaves the target still equal, with no duplicated kit IDs.

## BR-02 — A person can see the same result

- **Priority:** P0
- **Mode:** Manual

**Preconditions:** BR-01 has been run.

**Steps**

1. On the source and on the target, open the stud component, the shelf, and the log.
2. Compare them on a desktop-sized screen. Spot-check the shelf on a phone-sized screen.

**Expected result:** A crew member would call them the same garage. DEMO is not shown on the real stud job.

## Bad files

For BR-03 through BR-10:

- **Priority:** P0
- **Mode:** Automatable
- **Preconditions:** A target garage with a known stud job (the AT-01 garage is enough). Take one good export and damage a copy of it as the row describes. The good file is kept aside.
- **Expected result:** The server refuses the restore. The target is unchanged, down to kit IDs, baseline, history, and log. No success log entry says the restore worked. No demo record appears. The person can tell the restore did not happen (exact wording is AQ-ROLE-6).

| ID | How the copy is damaged |
| --- | --- |
| BR-03 | The file is not readable as structured data: random letters, or a backup with the word `GARBAGE` pasted through the middle. |
| BR-04 | The file is cut off halfway (truncated). |
| BR-05 | The file still reads as structured data, but a whole section is missing (for example history was removed and the rest left intact). |
| BR-06 | One record inside an otherwise good file is broken (a kit with no ID, or a history line with a contradicted kit). |
| BR-07 | The same kit ID or the same component ID appears twice. |
| BR-08 | The format version is missing, or it is a value this server does not claim to support. |
| BR-09 | The format version is higher than this server's version, or the file contains fields this server does not know. |
| BR-10 | The file is empty. |

BR-06 is the all-or-nothing case: the well-formed rows in that file are not applied "so far."

**Open question AQ-BR-2.** The handoff does not say where the format version is stored. The pass rule is about behavior: a missing stamp is refused, an unsupported stamp is refused, and a newer stamp is refused. Record the field location in this file when the format is written.

**Open question AQ-BR-3.** A later release may document a migration from one named older version. Until that note exists, an older version is an unsupported version and BR-08 refuses it. A migration, once documented, gets its own case: the restored garage matches the migration note, and fields the note does not mention are not guessed.

## BR-11 — The server stops during restore

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Known target garage. A good backup of a different garage (different note on the test rule, so the two are easy to tell apart). Harness from AQ-AT-2.

**Steps**

1. Start a restore of the good backup onto the target.
2. Kill the server after the restore has started and before it has finished.
3. Start the server. Compare the target to the pre-restore garage and to the backup.

**Expected result:** The target equals the pre-restore garage, or it equals the backup. It does not contain a mixture, such as the backup's history with the old shelf. It does not contain demo data. A retry of the same restore ends equal to the backup, once, with no duplicated IDs.

## BR-12 — A failed restore on an empty garage stays empty

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** This is the silent fallback into sample data.

**Preconditions:** An empty target, no demo load.

**Steps**

1. Restore a BR-03 damaged file onto the empty target.
2. List catalog items, history, rules, and kits.

**Expected result:** The target is still empty. The lamp a crew member would see is off (UNK-12). No sample stud set and no sample interval exist.

## BR-13 — Demo data stays labeled and stays out of the real export

- **Priority:** P0
- **Mode:** Both

**Preconditions:** The real garage has the AT-01 job. If a training copy exists, it is available separately.

**Steps**

1. Export the real garage.
2. Search the export and the real screens for demo rows and for the word DEMO.
3. If a training copy exists, open it and search for `TEST-KIT-001` installed on the real component as though the training job were real.
4. Attempt, as Admin and as the Race-day user, to copy a training interval onto the real rule or to clear a DEMO label (ROLE-M18).

**Expected result**

- The real export contains the real job and contains no unlabeled demo rows.
- Training screens show DEMO in view of the crew, on the phone and on the desktop.
- The ROLE-M18 attempts are refused. The real rule still says `TEST SOURCE — not a real interval` unless an Admin changed it through the normal rule edit.
- A restore of the real export onto an empty target produces zero demo rows.

**Open question AQ-BR-4.** The handoff does not choose a separate training store versus a label on each row. Either design passes when the results above hold. Who may open the training copy is part of this question. Opening it must not rewrite the real baselines.

## BR-14 — Restore replaces the target; it does not merge in silence

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Target has `TEST-KIT-002` sealed and also has an extra catalog part the backup does not contain, ID `TEST-EXTRA-PART`. The backup is an export from a garage that has no `TEST-EXTRA-PART`.

**Steps**

1. Restore the backup onto the target.
2. Look for `TEST-EXTRA-PART` and for both kits.

**Expected result:** The target equals the backup. `TEST-EXTRA-PART` is gone from the target. This case documents a full replace, which is the only restore this plan accepts.

A future merge-style restore is a different feature. It needs its own written rules and its own tests. It is not a pass on this case.

## Accounts in the file

**Open question AQ-BR-1. Blocks release.** The handoff does not say whether the backup contains password material, photos of failure evidence, or only the garage records.

Locked now:

- Roles and account names round-trip (BR-01).
- Opening the file in a text editor does not show a plain-text password.
- Evidence that was part of a saved job round-trips with that job. If evidence is stored beside the backup rather than inside it, the restore steps say so, and BR-01 still shows the evidence on the job.

Not locked: whether sign-in after restore uses the same password, a reset, or another written recovery step. Backup cannot be called done until that step is written and BR-01's sign-in step passes.

**Open question AQ-AUD-4** in the audit plan covers whether the restore action itself adds a log line.
