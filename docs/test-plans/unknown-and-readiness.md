# Unknown data and race readiness

Missing data shows the word UNKNOWN. The ready lamp stays off whenever a safety-critical item is missing, stale, corrupt, overdue, failed, or sitting on an unresolved critical defect.

The software does not certify that the car is safe to race. A lamp that is on means only that the checks in this plan passed for the records on file.

Statuses the crew can see, from the handoff: not due, approaching due, due, overdue, failed inspection, and UNKNOWN. UNKNOWN is the status for missing history, missing readings, a missing approved rule, stale data, and corrupt records.

Lap limits and engine-hour limits are separate. The system does not turn a lap reading into an hour reading unless an approved rule says to, and this plan does not add that rule.

Priorities and modes are defined in [README.md](README.md).

## Locked ready-lamp rule

The lamp may be on only when every safety-critical item has all of the following:

- An approved rule with a source and a revision the team entered.
- History and readings sufficient to score each metric that rule uses.
- A status of not due for those metrics.
- No failed inspection, and no unresolved critical defect.
- Data the server itself does not call stale or corrupt.
- For parts that sit on a corner, that corner's own interval and its own inspection both pass. A pass on another corner does not count. See CORNER-01 and CORNER-02.
- The current event checklist is complete. See [event-checklists.md](event-checklists.md).

Any gap on a safety-critical item, on any corner, or on the current checklist: the lamp is off, and that item is not described as healthy. A component that has been added counts, including brakes, fluids and oils, tires, suspension, engine, and drivetrain. A blank interval on it is UNKNOWN.

A completed first installation is a real service record. The history line may say none on file for the previous component, because the car started with empty records. That phrase is not the status UNKNOWN, and that job can clear UNKNOWN for the metrics its rule covers. An empty history, with no completed job, stays UNKNOWN.

## UNK-01 — No service record

- **Priority:** P0
- **Mode:** Both

**Preconditions:** Standard garage, before any replacement. `TEST-WHEEL-STUDS` has a rule and has no history line.

**Steps**

1. Open the component on the race-day view.
2. Read the status and the ready lamp, on a phone-sized screen and a desktop-sized screen.

**Expected result:** The maintenance status is UNKNOWN. The lamp is off. The screen does not say not due, Ready, OK, Good, or Healthy for this component.

## UNK-02 — No approved interval

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** The test component has a history line and current readings. The approved rule has been removed, or was never entered. No other rule is attached.

**Steps**

1. Read the status and the lamp.

**Expected result:** The status is UNKNOWN. The lamp is off. The software does not supply an interval from memory, from demo data, or from a number found elsewhere in the product.

## UNK-03 — A draft or a rule with no source does not clear UNKNOWN

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** A rule is stored for the studs with the source blank, or with the word draft, and without a revision the team marked as approved.

**Steps**

1. Enter current readings.
2. Read the status and the lamp.

**Expected result:** The status stays UNKNOWN. The lamp stays off. The draft text is visible as a draft if it is shown at all. It is not labeled as the approved interval.

## UNK-04 — A reading the rule needs is missing

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** The approved test rule uses laps and engine hours. A baseline from AT-01 exists. The latest session has a lap reading and no engine-hour reading.

**Steps**

1. Read both metrics and the lamp.

**Expected result:** The hour metric is UNKNOWN. The lamp is off. The lap metric may show the status its own interval produces. The hour field does not show a number derived from the laps.

## UNK-05 — Laps are not converted into hours

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Same as UNK-04, and no approved conversion rule exists.

**Steps**

1. Search the stored hour baseline and the on-screen hour status after a lap-only session.

**Expected result:** The hour baseline is unchanged. The hour status is UNKNOWN. No new hour value appears.

## UNK-06 — Stale data

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** An old "not due" from last season is how a ready lamp lies.

**Preconditions:** Blocked until AQ-UNK-1 is answered. Then: a safety-critical stud record that the team's written rule classifies as stale, plus current-looking readings that would otherwise say not due.

**Steps**

1. Apply the staleness rule the team wrote down.
2. Read the status and the lamp.

**Expected result:** The status is UNKNOWN. The lamp is off. The record is still visible. It is not replaced by a fresh healthy row or by demo data.

**Open question AQ-UNK-1. Blocks release.** The handoff does not define stale (age, a missed sync, a configurable threshold, or something else). This plan will not invent a number of days. Answer AQ-UNK-1, then run this case. Until it passes, do not ship a ready lamp.

A record with no "as of" time is not current. Treat that record as failing this case once a timestamp is part of the product. If the product cannot represent "as of" at all, UNK-06 stays unrun and the lamp stays blocked.

## UNK-07 — Corrupt records

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Start from a known garage and damage one stored stud record at a time, restoring between tries. Examples that already count as corrupt:

- The component ID or kit ID is unreadable.
- A set marked sealed does not contain five studs.
- A history line points at a component ID that is garbage or that contradicts the kit it names.

**Steps**

1. Read the status, the lamp, and the shelf count.
2. Attempt a replacement that uses the damaged record.

**Expected result**

- The status is UNKNOWN. The lamp is off.
- The damaged row is still findable. It is not dropped, and demo data does not take its place.
- The replacement is refused. No sealed set is consumed, and the baseline does not move.

**Open question AQ-UNK-4.** The full integrity list will grow. Add new examples here when the team names them. The three examples above are already P0. A future example must not be graded as a pass just because it displays a healthy status.

## UNK-08 — Failed inspection

- **Priority:** P0
- **Mode:** Both

**Preconditions:** A complete stud job exists. An inspection for that wheel is then saved as failed.

**Steps**

1. Read the item status, the lamp, and the on-screen warning.

**Expected result:** The status is failed inspection, not UNKNOWN and not not-due. The lamp is off. A warning is visible on the phone and on the desktop, in words a crew member can act on. The warning does not say the car is certified safe.

## UNK-09 — Unresolved critical defect

- **Priority:** P0
- **Mode:** Both

**Preconditions:** A critical defect is open on the studs or on another item the team has marked safety-critical. The rest of the stud data would otherwise look not due.

**Steps**

1. Read the lamp and the defect.

**Expected result:** The lamp is off. The defect is visible as unresolved. Clearing the lamp requires a saved update that closes the defect under the role rules. Deleting the defect row to make the lamp come on is a fail (ROLE-M14).

## UNK-10 — Overdue safety-critical item

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** The Admin's own test interval is in the past for the stud rule, using readings the tester enters. The item is safety-critical.

**Steps**

1. Read the status and the lamp.

**Expected result:** The status is overdue. The lamp is off.

**Open question AQ-UNK-5.** The handoff does not say a non-critical overdue item turns the whole-car lamp off. Do not grade that lamp until the question is answered. The overdue item itself must still show overdue.

## UNK-11 — Approaching due

- **Priority:** P1
- **Mode:** Both

**Preconditions:** Readings sit inside the warning threshold the Admin entered, and outside the critical threshold.

**Steps**

1. Read the item status and the lamp.

**Expected result:** The item shows approaching due. It does not show UNKNOWN, and it does not show not due.

**Open question AQ-UNK-2.** Whether approaching due turns the whole-car lamp off is not decided. While it is open, do not treat either lamp state as the permanent rule. Record which state was observed. The item-level words above are the pass rule today.

## UNK-12 — Empty team, first day

- **Priority:** P0
- **Mode:** Both

**Preconditions:** A new installation with the real car created and no service lines entered by the team.

**Steps**

1. Open the race-day view before any demo control is used.
2. Read the lamp, the stud status, and the history.

**Expected result:** The lamp is off. Stud status is UNKNOWN. History has no invented replacements, dates, or lap counts. No sample interval is presented as the team's rule.

## UNK-13 — The car looks ready only when the locked rule is met

- **Priority:** P0
- **Mode:** Both

**Preconditions:** AT-01 completed. Readings are inside the Admin's not-due range for every metric the rule uses. No failed inspection on any corner, no open critical defect, the current event checklist is complete, and the data is not stale or corrupt. Any other component on the car is also inside this rule. A blank interval anywhere keeps the lamp off.

**Steps**

1. Read the stud status and the lamp on the phone and on the desktop.
2. Read any sentence near the lamp about what the software is claiming.

**Expected result:** The stud item may show not due. The lamp may come on. Nearby text still tells the crew this is not a certification that the car is safe. If that sentence is missing, this case fails even when the color is right.

## UNK-14 — Demo data cannot turn the real car green

- **Priority:** P0
- **Mode:** Both

**Preconditions:** The real car has no stud history. A training or demo set of records exists, if the product has one.

**Steps**

1. Open the real car's race-day view.
2. Open the training records if they exist.

**Expected result:** The real car stays UNKNOWN with the lamp off. Training records show the word DEMO wherever a crew member could mistake them for the car. Training intervals do not become the real car's approved rule.

## UNK-15 — Forecasts are estimates

- **Priority:** P1
- **Mode:** Manual

**Preconditions:** A forecast can be shown for the test event, using the Admin's rule and a lap estimate the tester types.

**Steps**

1. Read the forecast on the phone and on the desktop.

**Expected result:** The forecast is labeled as an estimate. It is not labeled as a guarantee, and it does not by itself turn the ready lamp on.

## UNK-16 — Status words

- **Priority:** P1
- **Mode:** Manual

**Steps**

1. Arrange one component in each status the release actually uses: not due, approaching due, due, overdue, failed inspection, UNKNOWN.

**Expected result:** Each status uses the words above, or a shorter label the team records in answer to AQ-UNK-3. UNKNOWN is spelled UNKNOWN. None of the missing-data setups use the not-due label.

**Open question AQ-UNK-3.** Exact colors, icons, and abbreviations are not specified. The pass rule is the word UNKNOWN and the lamp rule. Pick colors later and update this case. Do not use the ready color for UNKNOWN.

## Per-corner readiness

Corners in these cases are LF, RF, LR, and RR. Intervals and inspections are judged on the corner they belong to. The car lamp is off when any corner is failed, overdue, or UNKNOWN.

### CORNER-01 — A pass on one corner leaves another corner failed

- **Priority:** P0
- **Mode:** Both
- **Why it matters:** A later "looks good" on the right front must not wipe a failed left front. The car would go out with a known bad corner.

**Preconditions:** The same kind of inspection exists for LF and RF. Both were open. No other failed inspection is on the car.

**Steps**

1. Save a failed inspection for LF.
2. Save a passed inspection for RF.
3. Read LF, RF, and the ready lamp, on the phone and on the desktop.

**Expected result**

- LF still shows failed inspection.
- RF shows the pass.
- The lamp is off.
- LR and RR are unchanged.
- The LF failure is still the same record. RF's pass did not edit it.

### CORNER-02 — Service on one corner leaves another corner overdue

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** LF and RF each have an owner-entered interval with a source and a revision. LF is overdue on that interval. RF is then serviced with a complete job and sits inside the not-due range. The numbers are whatever the owner typed for the test. This plan does not supply them.

**Steps**

1. Read both corners and the lamp after the RF service.

**Expected result:** LF still shows overdue. RF may show not due. The lamp is off. RF's new baseline is not copied onto LF.

### CORNER-03 — Each corner keeps its own UNKNOWN

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** LF has no service record. RF has a complete service and an approved interval, and its readings are in the not-due range.

**Steps**

1. Read both corners and the lamp.

**Expected result:** LF is UNKNOWN. RF may show not due. The lamp is off. RF's history is not displayed as LF's history.
