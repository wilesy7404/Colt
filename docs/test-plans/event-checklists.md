# Event prep checklists

Before an event the crew works a checklist. The items come from a template the Admin saves. Each event starts with those items open. An open item on the current event keeps the ready lamp off.

Priorities and modes are defined in [README.md](README.md). Checklist words in this plan are test labels, not a real NASA or SCCA procedure. The owner writes the real items later.

Template and event-plan edits are Admin writes (ROLE-M06). Completing an item is a Race-day write (ROLE-M07). Admin completion stays TBD until AQ-ROLE-7 is answered.

## EVT-01 — Create an event from a template

- **Priority:** P0
- **Mode:** Both

**Preconditions:** Admin is signed in. No current event checklist exists.

**Steps**

1. Save a template named `TEST-EVENT-TEMPLATE` with two items the tester types, such as `TEST walk-around` and `TEST lug check`.
2. Create Event A from that template.
3. Read Event A on the phone and on the desktop.

**Expected result**

- Event A has those items, and each one is incomplete.
- The template is still available for a later event.
- The ready lamp is off.
- No service interval was created or changed by making the template.

## EVT-02 — The next event starts open again

- **Priority:** P0
- **Mode:** Automatable
- **Why it matters:** Last weekend's completed list must not make this weekend look checked.

**Preconditions:** EVT-01. The Race-day user completes every item on Event A.

**Steps**

1. Confirm Event A shows every item complete.
2. Create Event B from the same template.
3. Read Event A, Event B, and the lamp.

**Expected result**

- Event A's completions are still on Event A.
- Event B's items are all incomplete. None of Event A's checkmarks were copied over.
- Event B is the current event. The lamp is off.
- History of Event A is still readable.

## EVT-03 — One open item keeps the car not ready

- **Priority:** P0
- **Mode:** Both

**Preconditions:** The rest of the car meets the ready-lamp rule in [unknown-and-readiness.md](unknown-and-readiness.md), including every corner. The current event has one item still incomplete.

**Steps**

1. Read the lamp and the open item on the phone.
2. Complete that last item as the Race-day user.
3. Read the lamp again.

**Expected result**

- Before the last item is completed, the lamp is off, and the open item is visible.
- After it is completed, the lamp may come on only when the rest of the ready-lamp rule is also true.
- Completing the checklist does not clear a failed corner, an overdue item, an UNKNOWN component, or an open critical defect.

## EVT-04 — No current event is not a pass

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** Components and corners otherwise satisfy the ready-lamp rule. No event is selected as current.

**Steps**

1. Read the lamp.

**Expected result:** The lamp is off. The absence of a checklist is not treated as a finished checklist.

## EVT-05 — The crew cannot rewrite the template

- **Priority:** P0
- **Mode:** Automatable

**Preconditions:** `TEST-EVENT-TEMPLATE` exists. The Race-day user is signed in.

**Steps**

1. Send a direct request that changes the template wording or deletes an item.
2. Complete one Event B item with a normal checklist save.
3. Read the template and the event.

**Expected result:** The template change is refused. The template text is unchanged. The item completion is saved. No success log entry records a template edit.

**Open question AQ-EVT-1.** The handoff does not say whether a completed event can be reopened, or who may do that. Until that is answered, a request to mark a finished event incomplete again is refused, Event A's record stays as it was, and the current event is unchanged.
