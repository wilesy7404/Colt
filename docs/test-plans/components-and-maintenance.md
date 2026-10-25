# Components and maintenance

The car is more than one part. These cases cover brakes, fluids and oils, tires, suspension, engine, and drivetrain. The same rules apply to each area. Stud bags stay in the short P1 note in [atomic-transactions.md](atomic-transactions.md). They are not the pattern for everything else.

Priorities and modes are defined in [README.md](README.md). A service that also consumes stock still follows the atomic plan: the history, the stock movement, and the baseline land together, or the garage stays unchanged. The server chooses the signer ([roles-and-authorization.md](roles-and-authorization.md), ROLE-09).

Intervals start blank. The owner, signed in as Admin, is the person who may enter one. The source text on any interval created during these tests is exactly `TEST SOURCE — not a real interval`, with a revision the owner types. This plan contains no lap limits, hour limits, day limits, or other specs. If a number appears below, it is only as a name for "the number the owner just typed."

## Areas

Run the cases once for each row.

| Area | Test component | How it sits on the car |
| --- | --- | --- |
| Brakes | `TEST-BRAKE` | One record per corner: LF, RF, LR, RR |
| Fluids and oils | `TEST-OIL` | One record for the car, not a corner |
| Tires | `TEST-TIRE` | One record per corner |
| Suspension | `TEST-SUSPENSION` | One record per corner |
| Engine | `TEST-ENGINE` | One record for the car |
| Drivetrain | `TEST-DRIVETRAIN` | One record for the car |

Corner records follow [unknown-and-readiness.md](unknown-and-readiness.md). Work on LF does not clear RF.

## CMP-01 — Add a component with no interval

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** A new part with a made-up interval looks ready on the day it is added.

**Preconditions:** The real car has no demo data. The component in the row does not exist yet.

**Steps**

1. As Admin, add the component for that row. Leave every interval field blank. Enter no source.
2. Repeat for each corner when the row says one record per corner.
3. Read the stored component, the status, and the ready lamp.

**Expected result**

- The component exists in the right area.
- Lap, engine-hour, and calendar intervals are blank. There is no source and no revision.
- Status is UNKNOWN. The lamp is off.
- No history line was created. No stock moved.
- The same is true for every corner of a cornered part. Adding LF does not create a filled-in RF.

## CMP-02 — A blank interval is never due or healthy

- **Priority:** P0
- **Mode:** Both

**Preconditions:** CMP-01 for that component. The owner has not entered an interval. Session totals may already exist.

**Steps**

1. Open the component on the phone and on the desktop.
2. Read the status words.

**Expected result:** The status is UNKNOWN. It does not say not due, due, overdue, Ready, OK, Good, or Healthy. The lamp is off.

## CMP-03 — The owner enters an interval, with a source

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** CMP-01. Admin is signed in.

**Steps**

1. Enter one interval the owner chooses for this test (laps, engine hours, calendar, or more than one). Type the source `TEST SOURCE — not a real interval` and a revision.
2. As the Race-day user, send a direct request that tries to set or change that interval.

**Expected result**

- The Admin save stores exactly the numbers and the source the owner typed.
- Other components, including the other corners, keep their own intervals. A blank neighbor stays blank.
- The Race-day request is refused (ROLE-M03). The owner's interval is unchanged.
- Until step 1 happens, CMP-02 still describes the component.

## CMP-04 — Log a service

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** The component exists. The Race-day user is signed in. If the job names a stock item, that item is on the shelf. If it does not, no stock is involved.

**Steps**

1. Submit a completed service: component, corner when it has one, date, the readings the job needs, what was done, and the sign-off.
2. Leave signer and technician blank, or fill them with the signed-in user only.
3. Read history, baseline, stock, and status.

**Expected result**

- One service record exists for that component and, when it applies, that corner.
- The baseline matches the readings on the job. Laps are not copied into hours.
- Signer and technician are the logged-in Race-day user (ROLE-09).
- Stock is unchanged when the job names no stock item. When it names one, the atomic plan's complete-job rule holds.
- If the owner has not entered an interval, the status stays UNKNOWN (CMP-02) even though the work is on file.
- If the owner has entered an interval and the readings sit inside it, the status may show not due for those metrics only.

## CMP-05 — Due, overdue, and the neighbor that is not

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** CMP-03 has been done for this component. The owner has typed the interval and the readings that make this case overdue, and a second set of readings that make a neighbor not due. Use the owner's numbers. Do not copy them into this plan.

**Steps**

1. Put this component overdue by the usage totals or the date, matching the metric the owner entered.
2. Leave a second component in the same area, or the opposite corner, inside its not-due range.
3. Read both statuses and the lamp.

**Expected result**

- The overdue component shows overdue.
- On a corner, or on a component the team has marked safety-critical, the lamp is off.
- The neighbor shows its own status. It does not become overdue because of the first component.
- On a cornered part, only the overdue corner changes. The other corner keeps its own baseline.
- Missing readings for a metric the interval uses show UNKNOWN for that metric, and the lamp stays off. The system does not convert laps into hours.

## CMP-06 — Taking the interval away returns UNKNOWN

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** A component with an owner-entered interval and at least one service on file.

**Steps**

1. As Admin, remove the interval and its source.
2. Read the status, the history, and the lamp.

**Expected result:** The status is UNKNOWN. The lamp is off. The service history is still there. The product does not fill the blank with a new number.

## CMP-07 — No seeded intervals for these areas

- **Priority:** P0
- **Mode:** Both

**Preconditions:** A fresh install, before the owner types any rule.

**Steps**

1. Search the car's brakes, fluids and oils, tires, suspension, engine, and drivetrain for stored intervals, sources, and due dates.
2. Read those screens on the phone.

**Expected result:** Intervals are blank. Nothing is presented as a 350Z, NASA, or SCCA interval. Status is UNKNOWN where a component exists, and the lamp is off. This is the same promise as the honesty checklist, checked on these areas.
