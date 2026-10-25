# Defects

A defect is something the crew found. It stays open until a role the matrix allows closes it. A critical defect keeps the ready lamp off for as long as it is open.

Priorities and modes are defined in [README.md](README.md). Reporting a defect is Allow for the Race-day user (ROLE-M09). Closing a defect, or editing one that someone else reported, is ROLE-M19. Both named roles are TBD there, so the server refuses those writes until the team changes the matrix. That refusal is the role rule. It is not a gap in this test.

Severity is stored and shown. The value `critical` is the one that blocks the car. This plan does not invent a numbered scale.

## DEF-01 — Open a defect

- **Priority:** P0
- **Mode:** Both

**Preconditions:** The Race-day user is signed in. The car has no open defect.

**Steps**

1. Report a defect with a short description the tester types, a component or corner it belongs to, and a severity of `critical`.
2. Read the defect list on the phone and on the desktop.
3. Read the ready lamp.

**Expected result**

- The defect is open and shows `critical`.
- The lamp is off, even if every interval, inspection, and checklist item would otherwise pass.
- One create audit entry records the Race-day account, the server time, and the defect text.
- Signer fields, if the report has them, follow ROLE-09. A body that names the Admin as the author is refused and audited (ROLE-08, AUD-09), and the defect is not opened under the Admin's name.

## DEF-02 — A non-critical defect is still a real defect

- **Priority:** P1
- **Mode:** Automatable

**Preconditions:** No critical defect is open. Intervals, inspections, and the current checklist otherwise meet the ready-lamp rule.

**Steps**

1. Report a defect whose severity is a non-critical word the tester types, such as `info`.
2. Read the list and the lamp.

**Expected result:** The defect is open and shows the severity that was saved. It does not show `critical`. The critical-block rule does not apply to it. The lamp still follows every other ready-lamp rule.

**Open question AQ-DEF-1.** The handoff does not list severity words besides critical. Extra words are whatever the team stores. Do not treat an unlisted word as critical. Do not drop a defect because its severity word was not in this plan.

## DEF-03 — Close is enforced on the server

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** DEF-01's critical defect is open. Try once as the Race-day user and once as Admin.

**Steps**

1. Send a direct request to close the defect, not only a screen tap.
2. Read the defect, the lamp, and the log.

**Expected result:** While ROLE-M19 is TBD, the server refuses both accounts. The defect stays open and `critical`. The lamp stays off. No success entry says the defect was closed.

## DEF-04 — An allowed close clears only that defect

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** The team has set ROLE-M19 to Allow for one named role and updated this plan. A critical defect and a separate failed corner inspection are both open. The account under test has the Allow role.

**Steps**

1. Close the critical defect with a note the tester types.
2. Read the defect, the corner, the lamp, and the log.
3. Repeat a close attempt as a role that is still Refuse or TBD.

**Expected result**

- The defect is closed. One update audit entry shows open before and closed after, with who, when, and the note.
- The failed corner is still failed. The lamp stays off because of that corner.
- If that corner is later passed and nothing else blocks the lamp, the closed defect no longer blocks it.
- The unauthorized close is refused. A defect it targets stays as it was.

Until ROLE-M19 is edited to Allow, skip this case and leave DEF-03 as the result. Do not close a critical defect by deleting its row.

## DEF-05 — Two defects are independent

- **Priority:** P1
- **Mode:** Automatable

**Preconditions:** Two open defects, one `critical` and one not.

**Steps**

1. If a role may close defects, close the non-critical one.
2. If no role may close them yet, send a close for the non-critical one and expect DEF-03's refusal, then stop.

**Expected result:** Closing or refusing the non-critical defect does not change the critical one. The critical defect stays open and the lamp stays off.
