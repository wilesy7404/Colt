# Atomic replacement and stock transactions

A replacement is one save. The history line, the stock movement, and the new service baseline land together, or the garage stays unchanged. Opening a screen, failing a check, or killing the server in the middle of the save leaves the shelf and the interval alone. If the network dies after the device has sent the job, the server holds either the whole job or none of it. Sending that same job again still uses only one set.

Wheel studs are the worked example because a snapped stud is the failure this system exists to get ahead of. Studs come in sealed sets of five. Each set has its own kit ID. The server tracks complete sealed sets, and it records when a set is opened and used.

Priorities, modes, the standard garage, and the word "unchanged" are defined in [README.md](README.md). Log entries are judged by [audit-trail.md](audit-trail.md).

## What a complete stud job contains

All of these are present, or the test fails:

- A history line with the test wheel, the date, the lap reading, the engine-hour reading, the approved catalog part `TEST-STUD-SET`, the kit ID, the measurements and evidence the rule required, the inspection result, the removal reason, and the signed-in person who signed off.
- The new component identity is the kit that was on the shelf. On the first job at that wheel, the old-component field says none on file. That is an honest empty history, and it is a different thing from the maintenance status UNKNOWN. The field contains no made-up ID.
- If the request included individual stud IDs, all five IDs and their positions are stored, and every one of them belongs to that same kit.
- That kit is no longer a sealed set on the shelf. The other test kit is still sealed.
- The baseline matches the readings and the date on this job. The lap baseline is the lap reading. The hour baseline is the hour reading. One is not copied into the other.
- The log shows the create, the consume, and the reset once each. See AQ-AUD-1 for whether that is one note or three. A duplicate of any effect is a fail. A missing effect is a fail.

Stock is checked when the save happens. The number the person saw when they opened the screen does not hold the set.

## AT-01 — Save one sealed set on the test wheel

- **Priority:** P0
- **Mode:** Both
- **Why it matters:** This is the normal stud job. After it, the shelf and the service clock have to match the work that was done.

**Preconditions**

- Standard garage. Both kits sealed. No earlier service line for `TEST-WHEEL-STUDS`.
- The Race-day user is signed in.

**Steps**

1. Submit a replacement that uses `TEST-KIT-001` at the test wheel.
2. Include the lap reading, the engine-hour reading, every measurement and evidence item the rule lists, a removal reason, and the sign-off.
3. Leave the old component as "none on file."
4. Read the shelf, the history, the baseline, the ready status for this component, and the log.
5. On a phone-sized screen and on a desktop-sized screen, read the same job.

**Expected result**

- The save is a complete stud job, as defined above.
- `TEST-KIT-001` is recorded as opened and used. `TEST-KIT-002` is still sealed.
- The old component on the history line says none on file. The new kit ID is `TEST-KIT-001`.
- This completed job is a real service record, so the maintenance status may show not due for each metric the rule actually has, using the new baseline. A metric with no rule stays UNKNOWN, and it keeps the ready lamp off.
- The phone view and the desktop view tell the same story: one set used, one set still sealed.

## AT-02 — Opening the screen does not save anything

- **Priority:** P0
- **Mode:** Both

**Preconditions:** Standard garage.

**Steps**

1. As the Race-day user, open the replacement screen, fill it in, and leave it there.
2. Do not submit.
3. Close it. Open a checklist. Open the same job again.

**Expected result:** The garage is unchanged. Looking at the form did not reserve `TEST-KIT-001`.

## AT-03 — Inspection with no replacement

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Standard garage. A previous complete job exists so a baseline is on file (run AT-01 first).

**Steps**

1. Save an inspection for the test wheel with no replacement and no kit ID.
2. Include the sign-off the inspection needs.

**Expected result**

- An inspection record exists and is logged as a create.
- Both kits stay sealed. The baseline stays on the earlier job.
- The inspection is not described as a replacement.

## Failures that leave the garage unchanged

For every case in this table:

- **Mode:** Automatable
- **Priority:** P0
- **Preconditions:** Standard garage, unless the row says otherwise. The Race-day user submits the same kind of valid job as AT-01, except for the fault in the row.
- **Expected result:** The server refuses, or the save aborts. The garage is unchanged. The screen does not say the job was saved.

| ID | Fault |
| --- | --- |
| AT-04 | The catalog part is not the approved part for this component. |
| AT-05 | The new kit ID is not on the shelf, or the typed old component ID is not a real component. "None on file" is still allowed when the system truly has no prior install at that wheel. |
| AT-06 | A reading is missing for a metric the approved rule uses (laps, engine hours, or date). |
| AT-07 | A measurement, inspection result, or piece of evidence that the rule lists is missing. |
| AT-08 | The sign-off is missing. Sign-off is required on every replacement, including a rule whose extra list is empty. |
| AT-09 | Not enough stock. Run it three ways: the shelf is empty; the named kit is already installed; the job needs a sealed set of five and the request marks fewer than five studs usable. |
| AT-10 | The save of the history record fails. |
| AT-11 | The stock write fails. |
| AT-12 | The baseline write fails. |
| AT-13 | The log write fails. |
| AT-18 | The save dies after only some of the five studs would have been counted. |
| AT-25 | The same request also tries to change the approved interval or the rule text. |

AT-10, AT-11, AT-12, AT-13, and AT-18 need the harness from AQ-AT-2. Leave them unrun until the harness exists. Do not mark them passed from AT-01.

**Open question AQ-AT-2.** How the test stops the server after a chosen step (validation, stock check, history write, stock write, baseline write, log write) is a build task. The pass rule does not depend on the tool: the garage ends unchanged.

**Open question AQ-AT-8.** Beyond "every metric the rule uses" and "sign-off is always required," the handoff does not list a universal measurement set for every job. Do not add one in the test data and treat it as a manufacturer requirement.

## AT-14 — The network drops, then the same job is sent again

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** A crew member will tap save again when the paddock network blinks. That retry must not use a second set.

**Preconditions:** Standard garage. One valid job for `TEST-KIT-001` is ready to submit.

**Steps**

1. Submit the job.
2. Cut the connection after the request has left the device and before the device shows an answer.
3. Read what the device shows. Inspect the shelf, history, baseline, and log.
4. Restore the connection and submit that same job again.
5. Inspect the stored records again.

**Expected result**

- The device says the job was saved only when a complete job is actually stored.
- After the cut, the records are either still the standard garage, or they are one complete job. A mixture is a fail. An example of a mixture: the set is off the shelf and the history has no line.
- After the retry, there is exactly one complete job. `TEST-KIT-001` is the kit on that line. `TEST-KIT-002` is still sealed.
- No demo record appears.

**Open question AQ-AT-1.** The handoff requires a stable identity for a repeated save. It does not say who creates that identity or what it looks like. Any design is acceptable when the retry above lands once. Two different wheels, or the same wheel on a later day as a new job, must still be able to use another set.

**Open question AQ-CC-2.** The exact sentence shown when the device does not yet know the outcome can wait. The sentence must not read as a completed save unless the complete job is stored.

## AT-15 — The server stops in the middle, then the same job is sent again

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** A crash during save is the moment a partial history is born, unless the save is truly one unit.

**Preconditions:** Standard garage. Harness from AQ-AT-2.

**Steps**

1. Start a valid job for `TEST-KIT-001`.
2. Kill the server after it has started the save and before the save is finished.
3. Start the server again. Inspect the shelf, history, baseline, and log.
4. Submit the same job again. Inspect again.

**Expected result**

- The kill in step 2 is placed before the save finishes. After restart, the garage is unchanged: the set is still sealed, the baseline is unmoved, history has no new line, and the log has no success entry.
- A partial garage is a fail. Stock taken with no history, history with no stock movement, or a baseline move on its own are all fails.
- After the retry, exactly one complete job exists, and the log has one set of effects for it.

## AT-16 — The same finished job is submitted again

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** AT-01 has completed for `TEST-KIT-001`.

**Steps**

1. Submit that same job a second time (double tap, or a replay of the original request).
2. Inspect stock, history, baseline, and log.

**Expected result:** Still one complete job. Sealed count stays where AT-01 left it. The log does not gain a second consume or a second reset for that job.

## Sealed sets of five

### AT-17 — Ask to use fewer than five studs from a sealed set

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** A sealed set that quietly becomes three studs can no longer be traced, and the next wheel may be built from leftovers of several sets.

**Preconditions:** Standard garage. `TEST-KIT-001` is sealed.

**Steps**

1. Submit a job that takes one, two, three, or four studs from `TEST-KIT-001` and does not record an opening of the whole set.
2. Repeat the idea as a direct server request, not only as a screen action.

**Expected result:** The server refuses. `TEST-KIT-001` stays sealed, with its original kit ID. The garage is unchanged.

**Open question AQ-AT-3.** The handoff does not say whether a set that was opened on purpose may later yield leftover studs as individuals under the same kit ID. Until that is answered, there is no passing result for a job that consumes a leftover. Do not invent that workflow during the test.

**Open question AQ-AT-9.** Individual stud IDs are required when the request sends them, and a list shorter than the sealed set is refused (this case). The handoff does not say the first release must turn individual tracking on for every stud. A release that claims individual stud tracking is done also stores each stud ID and wheel position on the complete job.

### AT-19 — Studs from two sets on one wheel, with no mix record

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Standard garage. Both kits sealed.

**Steps**

1. Submit one job that installs studs from `TEST-KIT-001` and `TEST-KIT-002` on the test wheel, with no explicit mix record.

**Expected result:** The server refuses. Both kits stay sealed. The garage is unchanged. The history does not contain a wheel built from two kits.

**Open question AQ-AT-4.** "Do not silently mix" is the rule. The handoff does not say whether an authorized person may mix two sets when the mix, the reason, and both kit IDs are recorded. Until that is answered, a request that includes a mix reason has no pass result. The no-record request in this case is a fail if the server accepts it.

### AT-20 — A set is opened by mistake, and the open is never confirmed

- **Priority:** P0
- **Mode:** Both

**Preconditions:** Standard garage.

**Steps**

1. As the Race-day user, start an "open this set" action for `TEST-KIT-001` and stop before confirming it.
2. Leave the screen. Come back. Also try the same action as a request that is abandoned before the server accepts it.

**Expected result:** `TEST-KIT-001` is still sealed. The sealed count is unchanged. There is no history line and no success log entry. The ready lamp does not change because of this attempt.

### AT-21 — A confirmed mistaken open cannot be erased

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** The dangerous outcome is a set that was opened in the trailer and then shows as sealed again with no trace.

**Preconditions:** Standard garage.

**Steps**

1. Complete whatever confirmed action the product uses to record that `TEST-KIT-001` is opened and not yet installed. If the product has no such confirmed action, record that fact and skip to step 2 with the set still sealed. An unconfirmed tap is AT-20, not this case.
2. Request an edit that marks the same set sealed again and removes the open from history.
3. Inspect the kit, the sealed count, the history, and the log.

**Expected result**

- If step 1 could not be confirmed, the set is still sealed and step 2 is refused.
- If the open was confirmed, the open remains on the record. The sealed count does not jump back up. The erasure request is refused. No studs are consumed. The baseline is unchanged.
- In both setups the kit ID is still `TEST-KIT-001`.
- An Admin scrap of that opened set is a different action (ROLE-M11). A scrap passes only when the open stays on the record, the sealed count does not increase, and the log records the scrap.

**Open question AQ-AT-7.** The team may later want a recorded correction: set sealed again, unused, with who, when, and why, as its own all-or-nothing save. That action does not exist until this question is answered. If it is added, write a follow-up case: the correction commits fully or the set stays opened, and the original open remains readable in the log.

## Stock rules around the job

### AT-22 — Negative stock is refused

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Shelf is empty. Race-day user is signed in. Repeat the same request as Admin.

**Steps**

1. Submit a valid-looking replacement that would take the sealed count below zero.
2. Send it directly to the server as well as from the screen.
3. As Admin, send a manual stock adjustment (ROLE-M11) that would set the sealed count below zero.

**Expected result:** The server refuses every one of those requests. The count stays at zero. No history line, no baseline, no success log entry. A normal Admin adjustment that stays at zero or above is still allowed.

**Open question AQ-AT-6.** The handoff allows negative stock only when an authorized exception is recorded. It does not name the role. Both named roles stay TBD in the role matrix, so both are refused. A passing exception test does not exist until the team names the role and the fields the exception must store (who, reason, and the resulting count).

### AT-23 — Reorder warning uses the number the Admin entered

- **Priority:** P1
- **Mode:** Both

**Preconditions:** Admin has set the minimum sealed-set count to a number the Admin chooses during this test. Stock is above that number. This plan does not supply the number.

**Steps**

1. Complete a real job (AT-01) that brings the sealed count to the minimum the Admin set.
2. Read the stock warning on the phone and on the desktop.

**Expected result:** A reorder warning is visible and names the test stud set. The warning uses the Admin's minimum. If the Admin has not set a minimum, there is no warning and the software does not invent one.

### Reserved stock (AQ-AT-5)

The handoff says stock can be reserved for an event. It does not say a reserved set is blocked for a different job.

**Open question AQ-AT-5.** Until this is answered, do not grade a test that consumes a reserved set. The locked neighbor is AT-02: opening a screen does not reserve a set, and AT-09 still applies to stock that is actually gone.

## Related cases

- A race-day user who tries to change the rule while saving a job is AT-25, and the role matrix is in [roles-and-authorization.md](roles-and-authorization.md).
- Two people saving the last set is [concurrency.md](concurrency.md) CC-01.
- The log shape for the complete job is [audit-trail.md](audit-trail.md).
- A failed save must not load demo data. The full demo rules are in [backup-restore.md](backup-restore.md).
