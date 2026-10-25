# Server-side roles and authorization

Every write is accepted or refused by the server from the signed-in account. A hidden button, a disabled control, or a request that was valid last week does not grant the write. The tests below send requests straight to the server. A crew member does not have to craft those requests. The person who writes the script does. The owner can watch the rule, the shelf, and the history and confirm they stayed put.

Role names are only **Admin** and **Race-day user**. A future role is TBD until a row in this matrix names it.

Priorities and modes are defined in [README.md](README.md). "Unchanged" is defined there too.

## Matrix legend

| Cell | Meaning |
| --- | --- |
| Allow | The server accepts a valid write from this role. Invalid data is still refused under the atomic plan. |
| Refuse | The server refuses. The garage is unchanged. No success log entry. |
| TBD | The handoff does not decide. The server refuses until this cell is edited to Allow or Refuse and the plan is updated. |

A person who is not signed in is refused for every write and every read of team data. That column is omitted so the matrix stays readable.

## Write matrix

| ID | Write | Admin | Race-day user |
| --- | --- | --- | --- |
| ROLE-M01 | Add, change, or remove a user or a permission | Allow | Refuse |
| ROLE-M02 | Add, change, or delete a catalog part | Allow | Refuse |
| ROLE-M03 | Add, change, or delete a service rule or an interval | Allow | Refuse |
| ROLE-M04 | Add, change, or delete an inspection procedure or a measurement limit | Allow | Refuse |
| ROLE-M05 | Save a measurement or inspection result on a job | TBD | Allow |
| ROLE-M06 | Add or change an event plan | Allow | Refuse |
| ROLE-M07 | Complete a checklist item | TBD | Allow |
| ROLE-M08 | Record laps or engine hours | TBD | Allow |
| ROLE-M20 | Edit a lap or engine-hour session | TBD | Allow |
| ROLE-M21 | Delete a lap or engine-hour session | TBD | Allow |
| ROLE-M09 | Report a defect | TBD | Allow |
| ROLE-M10 | Change forecast settings | Allow | Refuse |
| ROLE-M11 | Change stock outside a finished job (receive, count, reserve, scrap) | Allow | Refuse |
| ROLE-M12 | Sign off a valid replacement | TBD | Allow |
| ROLE-M13 | Record a negative-stock exception | TBD | TBD |
| ROLE-M14 | Delete history, or change a stored history line in place | TBD | Refuse |
| ROLE-M15 | Export a backup | TBD | TBD |
| ROLE-M16 | Restore a backup | TBD | TBD |
| ROLE-M17 | Change or delete an audit log entry | TBD | TBD |
| ROLE-M18 | Put demo data into the real car's records, or remove a DEMO label from those records | Refuse | Refuse |
| ROLE-M19 | Close a defect, or edit a defect another person reported | TBD | TBD |

Basis, in short:

- Allow on Admin rows ROLE-M01 through ROLE-M04, ROLE-M06, ROLE-M10, and ROLE-M11 follows the handoff list of what Admin manages.
- Allow on Race-day rows ROLE-M05 and ROLE-M07 through ROLE-M09 and ROLE-M12 follows the handoff list of race-day work. Changing a limit, a rule, or an interval is not part of that work.
- ROLE-M12 for the Race-day user is a way a job consumes stock in this plan. The consume and the baseline move happen inside that save, or not at all (AT-01 and AT-25). The server chooses the signer. See ROLE-08 and ROLE-09.
- ROLE-M20 and ROLE-M21 let the Race-day user correct a session log. That is separate from component history (ROLE-M14). The usage plan says how the audit and the totals behave. Admin stays TBD under AQ-ROLE-7.
- ROLE-M18 is Refuse for both roles because demo data must stay separated from the car. Who may open a clearly labeled training copy is AQ-BR-4, not a right to relabel records.
- Every TBD cell is an open question, collected below.

## Read matrix

| ID | Read | Admin | Race-day user |
| --- | --- | --- | --- |
| ROLE-R01 | Due and overdue items | Allow | Allow |
| ROLE-R02 | Approved work instructions | Allow | Allow |
| ROLE-R03 | The kit ID and the stock count for a job this account may perform | Allow | Allow |
| ROLE-R04 | Full reports | Allow | TBD |
| ROLE-R05 | Forecasts | Allow | TBD |
| ROLE-R06 | The maintenance log | TBD | TBD |
| ROLE-R07 | Another person's account details | Allow | Refuse |

Forecasts, when they are shown, are labeled as estimates. That check lives in [unknown-and-readiness.md](unknown-and-readiness.md).

## How to run the matrix

- **Priority:** P0 for every Refuse cell and every TBD cell, and for every Allow cell on a write that the release actually includes.
- **Mode:** Automatable
- **Priority note:** ROLE-M12 Allow is also exercised by AT-01. Do not copy a second happy path here.

**Preconditions:** Standard garage. Each request is sent straight to the server.

**Steps**

1. For each row, send the write as the Race-day user, then send it with no sign-in.
2. For each Allow cell in the Admin column, send one minimal valid write as Admin.
3. For each TBD cell, send the write as both named roles.

**Expected result**

- Refuse and TBD: the server refuses, the garage is unchanged, and there is no success log entry.
- Allow: the valid write commits once and is logged once. A second copy of the same request does not create a second change (see the audit plan).
- The signed-out request is refused on every row.

## ROLE-01 — A direct request from the Race-day user changes a rule

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** The interval is the safety clock. A phone session must not be able to move it, even if the screen hid the control.

**Preconditions:** Standard garage. Race-day user is signed in. The tester can see the current lap interval the Admin entered.

**Steps**

1. Send a server request, not a screen tap, that changes the lap interval on the test rule.
2. Read the rule, both kits, the history, and the log.

**Expected result:** The server refuses. The lap interval is still the number the Admin entered. Both kits stay sealed. No success log entry.

## ROLE-02 — The request claims to be Admin

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** The signed-in account is the Race-day user.

**Steps**

1. Send a rule change that includes a field saying the role is Admin.
2. Read the rule.

**Expected result:** The server uses the signed-in account and refuses the change. The rule is unchanged. No success log entry.

## ROLE-03 — Replay after the role is reduced

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Admin has a captured request that changes the test rule. That same person is then changed to a Race-day user, or their Admin permission is removed. The old request is still in the tester's hands.

**Steps**

1. Send the captured request again with that person's current sign-in.
2. Read the rule and the log.

**Expected result:** The server refuses. The rule matches the value from before the replay. The earlier successful Admin edit, if one was made when setting up, stays as it was and keeps its original log entry.

## ROLE-04 — Replay with no sign-in

- **Priority:** P0
- **Mode:** Automatable

**Steps**

1. Take any write that previously succeeded, including a Race-day sign-off.
2. Send it again with the sign-in removed or expired.

**Expected result:** The server refuses. No second job is created. Stock and baseline stay where the earlier successful save left them.

**Open question AQ-ROLE-5.** The handoff requires real sign-in. It does not say how long a sign-in lasts or which replay clues the server uses. The locked result is the refusal above. Wording of the refusal is AQ-ROLE-6.

## ROLE-05 — Race-day sign-off still works in a session that was refused a rule change

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Standard garage. ROLE-01 has just been refused for this Race-day user.

**Steps**

1. As that same user, submit a valid AT-01 job.
2. Then send another rule change.

**Expected result:** The stud job becomes one complete job. The later rule change is refused. The interval the Admin entered is still the interval, except for the baseline move that belongs to the stud job itself.

## ROLE-06 — Phone and desktop do not offer the Race-day user a rule editor

- **Priority:** P1
- **Mode:** Manual
- **Why it matters:** The server test is the proof. This pass lets the owner see that race day stays simple.

**Steps**

1. Sign in as the Race-day user on a phone-sized screen and on a desktop-sized screen.
2. Walk through checklist, laps, a defect, and a replacement.
3. Look for any control that saves a new interval, a new rule, a catalog part, a user, or a backup restore.

**Expected result:** Those controls are absent for the Race-day user. If any one of them is present, ROLE-01 still has to pass; a visible control that the server refuses is a P1 fail, and a control the server accepts is a P0 fail.

## ROLE-08 — A crew user cannot name another signer

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** The sign-off is who stood behind the job. A phone request must not be able to put an admin, or anyone else, on that line.

**Preconditions:** Standard garage. The Race-day user is signed in. A valid replacement is ready to submit, the same shape as AT-01. The tester knows the Admin account's user id, and the user id of a second crew account if one exists.

**Steps**

1. Submit that job with the body naming the Admin as signer and as technician.
2. Repeat the request naming any other user id.
3. Submit a defect report that names the Admin as the author.
4. Send these as direct server requests.
5. Read the signer, the technician, the shelf, the history, the baseline, the defect list, and the log.

**Expected result**

- The server refuses each request. Nothing is saved.
- The garage is unchanged. No set is consumed. No baseline moves.
- The Admin is not stored as signer, technician, or defect author. Neither is the other user id.
- No defect is opened under the Admin's name.
- Each attempt has the audit entry in AUD-09.

## ROLE-09 — The server writes the logged-in user

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Standard garage. The Race-day user is signed in. The request does not name a different user.

**Steps**

1. Submit a valid AT-01 job.
2. Read the signer and the technician on the stored job, and who is on the log.

**Expected result:** Signer, technician, and log who are all the Race-day account that submitted. The server chose them. They match even if the body left those fields blank.

**Open question AQ-SIGN-1.** The owner rule also allows an admin-verified signer that the server attaches. The handoff does not say which Admin action verifies someone, beyond the logged-in account. Until that is written down, the only passing signer is the logged-in user. A request that merely contains a verified person's user id is still ROLE-08: refused and audited.

## ROLE-07 — Admin race-day work stays unanswered on purpose

- **Priority:** P0
- **Mode:** Automatable

**Steps**

1. As Admin, attempt a checklist completion, a lap entry, a defect report, and a replacement sign-off.

**Expected result:** Until AQ-ROLE-7 is answered, each of these is refused, the garage is unchanged aside from records the Admin was already allowed to write, and no stud set is consumed.

**Open question AQ-ROLE-7. Blocks release.** The handoff lists race-day writes under the Race-day user and does not say whether Admin may also perform them. A recommended answer, not yet the pass rule: Admin may do every race-day write in addition to admin writes. Accept that in writing, change the TBD cells, and add the positive tests. Until then, stud sign-off tests run as the Race-day user.

## Open questions for this matrix

**AQ-ROLE-1. Blocks release.** Who may export, and who may restore? Backup cannot be called done while ROLE-M15 and ROLE-M16 are TBD. Corrupt-file tests in the backup plan still describe the data result. Run them as soon as one role is named, and keep running the refusal for every role that remains Refuse or TBD.

**AQ-ROLE-2.** Who, if anyone, may correct a history line? Until answered, ROLE-M14 refuses in-place edits and deletes for both roles (Admin is TBD, Race-day user is Refuse). The locked invariant is in the audit plan: previous history text stays recoverable.

**AQ-ROLE-3.** Who, if anyone, may change or delete a log entry? ROLE-M17 stays TBD, so both roles are refused. The recommended answer, not yet the pass rule: nobody edits or deletes a log entry; a correction is a new entry.

**AQ-ROLE-4.** May a Race-day user view full reports (ROLE-R04), view forecasts (ROLE-R05), or close someone else's defect (ROLE-M19)? Those cells stay refused until answered. Reporting a new defect is Allow for the Race-day user.

**AQ-ROLE-6.** The exact refusal text is not specified. A pass requires that a person can tell the action did not happen. The exact sentence is not graded.

**AQ-ROLE-8.** How the first Admin account is created is not specified. Write that setup down before go-live. It is not one of the behavior cases above.

**AQ-ROLE-9. Blocks release.** Who may read the log on screen (ROLE-R06)? Testers may read the log through the test setup, which is not a user role. The feature is not done until a named role can review rule edits, stock movements, and sign-offs, because the handoff requires that audit.

The combined job-plus-rule-change request is AT-25 in [atomic-transactions.md](atomic-transactions.md). It must be refused as a whole. The server must not keep the sign-off and drop the rule change, and it must not keep the rule change and drop the sign-off.
