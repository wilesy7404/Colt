# Session laps and engine hours

Each outing gets its own session. The car's lap total is the sum of the session lap entries. The engine-hour total is the sum of the session hour entries. The two totals stay separate. Usage-based intervals read those totals.

The Race-day user may record a session (ROLE-M08), and may edit or delete one (ROLE-M20, ROLE-M21). Admin remains TBD until AQ-ROLE-7 is answered. Editing a session does not edit component history. That is still ROLE-M14.

Priorities and modes are defined in [README.md](README.md). A rejected save writes no success entry for a completed session. The signer rule does not apply here; this is a usage log, not a service sign-off.

## USE-01 — Log one session

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** No sessions exist. The Race-day user is signed in.

**Steps**

1. Save a session with a name the tester types, an explicit lap count, and an explicit engine-hour count. Zero is allowed when the crew enters zero.
2. Read the session and both totals.

**Expected result**

- The session is stored with the numbers entered.
- The lap total equals that session's laps. The hour total equals that session's hours.
- No interval was created. Components with blank intervals stay UNKNOWN.
- One create audit entry records who (the Race-day account), when (server time), what, and the before/after of the new session.

## USE-02 — A second session adds to the totals

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** USE-01 is stored.

**Steps**

1. Save a second session with its own lap count and hour count.
2. Read both totals.

**Expected result:** Each total is the sum of the two sessions. One total does not change when only the other number was entered on the new session. The first session's stored numbers stay as they were.

## USE-03 — Negatives and blanks are refused

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** USE-01 is stored. Note the totals.

**Steps**

1. Submit a session with a negative lap count.
2. Submit a session with a negative engine-hour count.
3. Submit a session that leaves laps or hours blank.
4. Send each as a direct request as well as from the screen.

**Expected result:** The server refuses each one. Totals stay at the USE-01 values. No new session is stored. No success audit entry is added. An explicit zero in USE-01 remains valid. A blank is not stored as zero.

## USE-04 — Totals feed an interval the owner entered

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** One component has an owner-entered lap interval and a separate owner-entered hour interval, each with source `TEST SOURCE — not a real interval`. The numbers are the ones the owner types for this test. A baseline from a completed service exists. Session totals start inside both intervals.

**Steps**

1. Add sessions until the lap total passes the owner's lap interval, and leave the hour total inside the hour interval.
2. Read that component's lap status and hour status, and the lamp.
3. Repeat the idea in the other direction: hours pass the hour interval, laps stay inside.

**Expected result**

- The metric that passed its interval shows overdue. The other metric keeps the status its own total produces.
- The lamp is off when either metric on a safety-critical component is overdue.
- The product does not turn laps into hours, or hours into laps.
- A component whose interval is still blank stays UNKNOWN. The totals do not invent an interval for it.

## USE-05 — Edit a session, then the totals move

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Two sessions exist. The Race-day user is signed in.

**Steps**

1. Edit the first session's lap count to a new non-negative number.
2. Read both sessions, both totals, any interval status that uses them, and the log.
3. As a signed-out request, send the same edit.

**Expected result**

- The first session shows the new lap count. The second session is unchanged.
- The lap total is the new sum. The hour total is unchanged if the hours were not edited.
- Interval status follows the new totals (USE-04).
- One update audit entry shows before and after, who is the Race-day account, and when is the server time.
- The signed-out edit is refused. After that refusal the totals match the successful edit only.

## USE-06 — Delete a session

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Two sessions exist. Note the totals.

**Steps**

1. As the Race-day user, delete the second session.
2. Read the remaining session, the totals, and the log.
3. Send a direct request that deletes a service-history line instead of a session.

**Expected result**

- The second session is gone from the totals. The first session is unchanged. Totals equal the first session alone.
- One delete audit entry records the deleted session as before, and empty as after, with the Race-day account and the server time.
- The service-history delete is refused (ROLE-M14). That history line remains. Its refusal does not remove the session delete's audit entry.

## USE-07 — An edit cannot go negative

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** USE-01 is stored.

**Steps**

1. Edit the session to a negative lap count, then to a negative hour count.

**Expected result:** Both edits are refused. The session and the totals stay as they were. No success update entry is written.
