# Concurrent edits

Two people can be signed in at once. The server, not the screen, decides who wins. These cases are about that live server. They are not a test of offline sync, and they are not a reason to claim offline sync in the release notes.

Priorities and modes are defined in [README.md](README.md). A complete job is defined in [atomic-transactions.md](atomic-transactions.md).

## CC-01 — Two people, one sealed set

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** Both people can see one set and both can press save. The shelf must not pretend it held two, and it must not go negative.

**Preconditions**

- Standard garage, except only `TEST-KIT-001` is sealed. `TEST-KIT-002` is not on the shelf.
- Two Race-day sessions, User A and User B. (If the team only has one Race-day account, use two sessions that the product treats as two actors. If the product cannot tell them apart, that is a fail for this case.)
- Each user submits a different job for the same test wheel, each naming `TEST-KIT-001`, with their own readings.

**Steps**

1. Have both users open the job while the set is still sealed.
2. Submit both saves so they overlap.
3. Read both screens. Inspect stock, history, baseline, and log.

**Expected result**

- Exactly one complete job exists.
- The sealed count is zero. It is not below zero.
- The other user is refused. That screen does not say the job was saved.
- The baseline matches the winner's readings only.
- The log has one consume and one reset for the winning job, and no success entry for the loser.
- The kit on the history line is `TEST-KIT-001`.

## CC-02 — The same job arrives twice at the same time

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Standard garage. Two requests carry the same job identity (AQ-AT-1) for `TEST-KIT-001`.

**Steps**

1. Deliver both requests so they overlap.
2. Inspect stock, history, baseline, and log.

**Expected result:** One complete job. One set consumed. The other kit stays sealed. One of each log effect.

## CC-03 — Two resets of the same component

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** The later quiet write would erase the real baseline and make an overdue stud look recently done.

**Preconditions:** One sealed set. Two overlapping sign-offs for `TEST-WHEEL-STUDS` with different lap and hour readings. They are two different jobs if they do not share a job identity; use CC-02 when they do.

**Steps**

1. Overlap the two saves.
2. Read the baseline, the history, and the shelf.

**Expected result:** One complete job. The baseline equals that job's readings and not a blend of both. The refused job did not consume a set. The refused user's screen does not say saved.

## CC-04 — A stale rule edit

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Two Admin sessions. Both load the test rule while it is still revision `TEST-REV-1`.

**Steps**

1. Admin A saves revision `TEST-REV-2`.
2. Admin B, still on `TEST-REV-1`, saves revision `TEST-REV-3` without loading A's change.
3. Send B's save as a direct server request as well, built from the old revision.
4. Read the rule and the log.

**Expected result**

- The stored revision is `TEST-REV-2`.
- B is refused. B's screen does not say the rule was updated.
- One update effect in the log, from A, before `TEST-REV-1`, after `TEST-REV-2`.
- No success effect for B.

**Open question AQ-CC-1.** The handoff does not choose the mechanism (a version number, a timestamp, or something else). Any mechanism passes when this case and CC-03 pass on the server. A warning that appears only on screen, while the direct request still saves, is a fail.

**Open question AQ-CC-2.** The words B sees can wait. They have to tell B the save did not land and that B should reload. They must not call B's edit saved.

## CC-05 — Edit a record while a delete is attempted

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** A stored history line from AT-01. User A prepares an edit of that line. User B prepares a delete of the same line. Run once with both as Admin, and once with B as the Race-day user.

**Steps**

1. Overlap the edit and the delete.
2. Read the history line and the log.

**Expected result today**

- The delete is refused for both roles (ROLE-M14).
- The in-place edit is refused for both roles.
- The history line still reads as AT-01 left it.
- No success log entry claims a delete or an overwrite.

**Pass rule if AQ-ROLE-2 later names someone who may correct history**

- The line's previous text is still recoverable from the log.
- The end state is one legal state: the correction committed and the delete was refused, or the delete committed and the edit was refused, or both were refused.
- A mixture is a fail: the line gone and also containing the new text; the line half-deleted; a set consumed or a baseline moved by this race.

## CC-06 — Update an ID that is not there

- **Priority:** P0
- **Mode:** Automatable

**Steps**

1. As Admin, send an update for component ID `TEST-DOES-NOT-EXIST`.
2. Search the garage for that ID.

**Expected result:** The server refuses. The ID is not created by the update. No success log entry. Stock and baselines are unchanged.

## CC-07 — Two different kits at two different wheels

- **Priority:** P1
- **Mode:** Automatable
- **Why it matters:** The single-set tests should not be passed by freezing the whole garage so that only one save can ever succeed.

**Preconditions:** Both kits sealed. A second component, `TEST-WHEEL-STUDS-2`, with the same kind of approved test rule. User A installs `TEST-KIT-001` on the first wheel. User B installs `TEST-KIT-002` on the second wheel. The saves overlap.

**Steps**

1. Overlap the two saves.
2. Read both history lines and the shelf.

**Expected result:** Two complete jobs. Each kit appears on its own wheel. The shelf has zero sealed test sets. Neither history line contains the other kit. Each job has one consume and one reset in the log.

## What this file does not prove

A pass here does not prove offline sync, a paddock queue, or that two phones agree after a long time with no signal. Those claims stay on the honesty checklist until a separate plan exists and passes.
