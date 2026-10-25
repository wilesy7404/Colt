# Phone UI

These checks are for the rebuild's phone screens. The throwaway `index.html` prototype does not count. A desktop window does not count, except where a case says to compare.

Run them on a phone, or in a browser window about the width of a phone. Priorities and modes are defined in [README.md](README.md). The honesty checklist still covers release notes and the README. This file is what the crew sees in their hand.

## PHONE-01 — UNKNOWN is obvious

- **Priority:** P0
- **Mode:** Manual

**Preconditions:** A component with a blank interval (CMP-02) and a corner with no service record (CORNER-03). The Race-day user is signed in.

**Steps**

1. Open the race-day status screen.
2. Hold the phone at arm's length in ordinary daylight.
3. Find that component and that corner without opening a debug view.

**Expected result:** The word UNKNOWN is on the status screen for both. It is readable. It does not use the ready color. The lamp is off. A blank row, a dash, or a green mark is a fail.

## PHONE-02 — Errors stay visible

- **Priority:** P0
- **Mode:** Manual

**Preconditions:** The Race-day user is signed in on the phone.

**Steps**

1. Submit a service with the sign-off missing.
2. Submit a service whose body names the Admin as signer (ROLE-08).
3. Submit a session with a negative lap count (USE-03).
4. After each attempt, look at the screen before leaving it.

**Expected result**

- Each attempt shows an error the crew can read on the phone. The exact sentence may wait for AQ-ROLE-6. Silence, a blank page, or a "saved" message is a fail.
- The values the crew typed are still on screen so they can correct them.
- Nothing was saved. The lamp does not turn on because of the attempt.

## PHONE-03 — The phone does not claim offline sync or an iPhone app

- **Priority:** P0
- **Mode:** Manual

**Steps**

1. Walk the race-day screens and the admin screens on the phone: status, checklist, session log, defects, and service sign-off.
2. Read any about text, banner, or install hint on those screens.

**Expected result:** Those screens do not say offline sync works, that devices catch up after a signal loss, or that this build is a native iPhone app. A home-screen hint, if one exists, talks about the website. The release honesty items HON-05, HON-06, and HON-07 still apply to the written notes.

## PHONE-04 — Touch targets

- **Priority:** P1
- **Mode:** Manual

**Steps**

1. With a thumb, work through a checklist item, a session save, a defect report, and a service form.
2. Watch for a tap that hits the neighboring control.

**Expected result:** Each of those actions can be hit on its own. The primary controls are about fingertip size and are not packed against the next button. A miss that activates a different save is a fail.

## PHONE-05 — The same facts as the desktop

- **Priority:** P1
- **Mode:** Manual

**Preconditions:** CORNER-01 and EVT-03 have been set up.

**Steps**

1. Read the failed corner, the open checklist item, and the lamp on the phone.
2. Read the same three on a desktop-sized screen.

**Expected result:** Both screens show the LF failure still failed, the checklist item still open, and the lamp off. The phone does not hide a failure that the desktop shows.
