# Audit trail

The maintenance log is the permanent record of who changed the garage. A completed create, update, delete, consume, or reset writes the effect exactly once. A save that fails writes no success entry.

Priorities and modes are defined in [README.md](README.md).

## What every success entry contains

- **Who:** the signed-in account. On a sign-off, the server also stores that same person as the signer and the technician, unless it attaches an admin-verified signer by its own rule (ROLE-09). A name or user id in the request does not choose either field. A crew attempt to name someone else is rejected and audited (ROLE-08, AUD-09).
- **When:** the server's time at commit. A time sent by the device does not become the log time.
- **What:** the action and the identity of the record (component, kit, rule, or job).
- **Before and after:** the previous values and the new values. A create has an empty before. A delete has an empty after. A consume shows the old count and the new count, with the kit ID. A reset shows the old baseline and the new baseline (laps, engine hours, and date).

**Open question AQ-AUD-3.** The time zone used when a person reads the log is not specified. The stored instant still has to be the server's commit time. Whether the log file is part of a backup is AQ-BR-1; the round-trip plan requires the log to come back with the data, so a backup that drops the log fails BR-01.

## How to count "exactly once"

**Open question AQ-AUD-1.** A stud replacement creates history, consumes a set, and resets a baseline. The handoff does not say whether that is one log note covering all three effects, or three notes. Either shape passes. The following does not pass:

- An effect is missing (for example the set was consumed and the log has no consume).
- An effect is repeated for the same save (two consume notes for one job).
- A failed save added a success note.

Testers count effects, not paragraphs.

## AUD-01 — A successful stud job

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Run AT-01.

**Steps**

1. Read the log for that job.

**Expected result:** Create, consume, and reset are each present once, with who, when, what, before, and after, as defined above. Who is the Race-day account that signed off. The consume before-count and after-count differ by one sealed set. The reset before-state is "no baseline" on a first job, and the after-state is the readings from the job.

## AUD-02 — An Admin rule edit

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Standard garage. Admin is signed in.

**Steps**

1. Change the test rule's revision from `TEST-REV-1` to `TEST-REV-2`, leaving the source text in place.
2. Read the log.

**Expected result:** One update effect. Who is the Admin account. Before contains `TEST-REV-1`. After contains `TEST-REV-2`. The shelf is unchanged. A Race-day attempt at the same edit is ROLE-01 and adds no success entry.

## AUD-03 — Inspection create

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Run AT-03.

**Expected result:** One create effect for the inspection. No consume effect. No reset effect.

## AUD-04 — Failed saves write no success entry

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** The pure failure cases AT-04 through AT-13, AT-17, AT-18, AT-19, AT-22, and AT-25, plus a refused role request (ROLE-01). AT-14 and AT-15 are graded under AUD-05, because a retry there is allowed to commit once.

**Steps**

1. After each of those cases, read the log.

**Expected result:** No success entry was added for the failed attempt. Entries that were already there from earlier passing jobs remain, with their original who, when, and before/after.

## AUD-05 — A retry does not add a second success

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** AT-14, AT-15, or AT-16.

**Expected result:** The killed attempt in AT-15 has no success entry. After the retry, the committed job has one of each effect. AT-14 has a success entry only when the complete job is stored, and the retry does not add a second set. AT-16 stays at the single set of effects written by AT-01.

## AUD-06 — History stays recoverable

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** The handoff says old-component history is kept. A log that can be emptied is not a log.

**Steps**

1. As the Race-day user, and again as Admin, request an in-place edit of a stored history line and a delete of that line.
2. Request an edit and a delete of a log entry itself, as both roles.
3. Read the history line and the log.

**Expected result**

- Both requests are refused (ROLE-M14 for the Race-day user, TBD treated as refuse for Admin; ROLE-M17 for both).
- The history words are unchanged.
- The original log entries are unchanged.
- There is no success entry claiming the history or the log was deleted.

**Open question AQ-ROLE-2.** If the team later allows a correction, the previous words still have to be readable in the log, with before and after. Silent overwrite fails this case even after that decision.

**Open question AQ-ROLE-3.** The recommended answer, not the pass rule yet: no role edits or deletes a log entry. A correction is a new entry. Until the team accepts or replaces that, the refusal above is the test.

## AUD-07 — Direct writes are logged too

- **Priority:** P0
- **Mode:** Automatable

**Steps**

1. As Admin, change a catalog note by a direct server request, not through the screen.
2. Read the log.

**Expected result:** One update effect, who = that Admin account, with before and after. The path (screen or direct request) does not change the duty to log.

## Failed attempts — decision and open question

**Open question AQ-AUD-2.**

Locked now, and already covered by AUD-04: a failed transaction writes **no success entry** for completed work. One refusal is already decided: a crew attempt to name a different signer is rejected and audited (AUD-09). That entry records the rejection. It is not a completed sign-off. Other failures stay under this open question. Testers do not require a general failure log, and they do not fail the build because a general failure log exists, until the team answers this question.

Recommendation, to accept or replace before the audit feature is called done:

- Completed work is the only material in the maintenance log.
- A refused sign-in, a refused role, a crash, or a save that rolls back goes to a separate trouble log, labeled FAILED, so it cannot be read as finished work.
- A form rejected for a missing measurement is shown to the person and is not written as maintenance. It does not need a trouble-log line.

Until that recommendation is accepted or replaced, do not claim in the release notes that failed attempts are logged.

Cases that would grade the trouble log stay unwritten on purpose. Add them in this file after AQ-AUD-2 is answered, with their own IDs.

## AUD-09 — A rejected signer substitution is logged

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** ROLE-08 has been run.

**Steps**

1. Read the log after the refused request.

**Expected result**

- One audit entry records the rejected attempt.
- Who is the Race-day account that sent it. When is the server's time. What says the signer substitution was rejected, and it includes the user id the request tried to use.
- Before and after show that the signer and the technician were not changed to that person.
- The entry is not a completed sign-off, consume, or reset. History, stock, and baselines match the garage from before the request.

## AUD-08 — Restore and the log

- **Priority:** P1
- **Mode:** Automatable

**Preconditions:** Backup cases BR-01 and BR-03.

**Expected result**

- After a successful round trip, the original log entries are present with their original timestamps (BR-01).
- After a refused restore, no success entry says the restore happened.

**Open question AQ-AUD-4.** Whether a successful restore itself adds one log entry, and what before/after means for a whole-garage replace, is not decided. Either choice passes today if AUD-04 and BR-01 hold. Write the choice down before calling backup done, then lock this case.
