# Release honesty checklist

Tick this page for every build a crew member might trust, including a "small" update. A script can search for suspicious text. A person decides whether a number is a real team rule or an invention. These items are **P0** and **Manual**, with a script used as a finder where the steps say so.

The pass is specific to this build. A previous build's ticks do not carry forward.

## HON-01 — No invented service intervals

**Preconditions:** The build to be released, including its README, in-app help, seed data, and release notes.

**Steps**

1. Search the build for lap counts, hour limits, day limits, and mileage limits attached to a part.
2. For each hit, find the source and the revision stored with that rule.

**Expected result:** Every interval a crew member can see was entered by the team and still shows its source and revision. A test rule from this plan, if one leaked into the build, still says `TEST SOURCE — not a real interval` and is not attached to the real car. Numbers with no source are absent. This plan itself is not loaded as the car's rules.

## HON-02 — No invented specs

**Steps**

1. Search the build for torque values, wear limits, pressures, and part specifications written as if they were approved for the 350Z or for NASA/SCCA.

**Expected result:** None are present unless the team entered them with a source and a revision. The release text does not imply the software ships those specs.

## HON-03 — No invented history

**Steps**

1. On a fresh install, open history for the real car before anyone records a job.
2. Search seed data for dates, lap counts, technician names, and "last replaced" lines.

**Expected result:** Fresh history is empty. Sample jobs, if they exist for training, are labeled DEMO and are not the real car's history (UNK-12, UNK-14, BR-13).

## HON-04 — Demo data is labeled

**Steps**

1. Open every training or sample screen on a phone-sized display and a desktop-sized display.
2. Export the real car.

**Expected result:** Each training screen shows the word DEMO where the crew could mistake it for the car. The real export has no unlabeled demo rows. The ready lamp for the real car is off when the real history is empty.

## HON-05 — No claim of offline sync

**Steps**

1. Read the README, the release notes, the in-app about or help text, and any install prompt.

**Expected result:** None of them say offline sync, paddock sync, or "works without signal and catches up later" is available in this build. Those features are out of scope until their own plan exists and passes. Judge this release on its own words. The throwaway prototype cannot satisfy this item.

## HON-06 — No claim of multi-device sync before it is real

**Steps**

1. Read the same places as HON-05.
2. Check whether the concurrency cases CC-01 through CC-07 passed on this build, on a real shared server.

**Expected result:** The notes claim shared use across devices only when that shared server is actually in this build and those concurrency cases passed. They do not describe the concurrency tests as offline sync. If the cases did not pass, the notes do not claim multi-device sync.

## HON-07 — No claim of a native iPhone app

**Steps**

1. Read the same places as HON-05, plus any store listing.
2. If the phone offers "add to home screen," read that prompt.

**Expected result:** Nothing calls this build a native iPhone app. A home-screen icon for the website is described as the website, when it is described at all. The long-term iPhone app from the handoff is not listed as shipped.

## HON-08 — The lamp is not a safety certification

**Steps**

1. Read the race-day screen when the lamp is off and, if UNK-13 passed, when the lamp is on.

**Expected result:** The words on that screen do not say the car is certified safe, legal to race, or cleared by NASA or SCCA. UNKNOWN still reads UNKNOWN. The honesty items above are still true on that same screen.
