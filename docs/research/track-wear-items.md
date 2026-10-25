# Track wear items on a 2004 Nissan 350Z

Research date: 2026-10-25. On that date every URL in the source table was requested again. A plain client got HTTP 403 from `members.drivenasa.com` (the CCR PDF) and `z1motorsports.com`. Both were then read from a successful page fetch the same day. The CCR file header is **2026.3 EDITION** (`https://members.drivenasa.com/rules/ccr.pdf`), and sections 11.4.2, 11.4.3, 11.4.5, 15.18, and 16.3 were read in that file. Nissan schedule pages are cited on `maintenance-schedules.nissanusa.com`, which returned HTTP 200. Every other source-table URL returned HTTP 200. The old 2025.4 S3 URL (`https://nasa-assets.s3.amazonaws.com/document/document/282/2025.4_NASACCR.pdf`) returned HTTP 403 on this pass and is not cited.

This note covers hubs and wheel bearings, lug nuts, brake pads and rotors, and fluids (brake fluid, engine oil, differential, transmission). It uses the same rules as `wheel-studs.md`.

**team policy (community research), v1, not a factory or official interval.**

An item is included only where a fetched source says something about it. If a life in laps, engine hours, or events was not published, that life is **unknown**. Street mileage intervals from Nissan are street intervals. They are not converted into laps or hours.

Source sections say what the pages say. The team starting points are only in [Proposed team starting points](#proposed-team-starting-points).

## How sources are labeled

| Label | Meaning |
| --- | --- |
| Manufacturer spec | Nissan’s maintenance-schedule host, or the part or fluid maker. |
| Sanctioning-body rule | NASA or SCCA rule text. |
| Vendor guidance | Retailer or specialty shop. |
| Anecdotal | Forum post, product review, or blog. |

Nissan’s public pages do not define “severe” or “premium” driving in the text that was fetched. Do not assume either word means road racing. The pages also say to use the owner’s manual or a dealer for the complete schedule.

## Hubs and wheel bearings

### What sources say

NASA CCR 2026.3, section 11.4.3: front and rear wheel bearings should be tight and play-free. There should be very little or no play in the suspension and steering.

- Sanctioning-body rule: [2026.3 NASA CCR](https://members.drivenasa.com/rules/ccr.pdf)

SCCA Time Trials safety rules: wheel bearings must not have play.

- Sanctioning-body rule: [SCCA Time Trials full safety rules](https://timetrials.scca.com/pages/full-safety-rules)

SCCA GCR, February 2026, section 9.3.46: suspension and steering shall be of suitable design and in good working order. That edition’s general section does not set a bearing-replacement interval. A later monthly GCR can supersede it. See `wheel-studs.md` for the edition note.

- Sanctioning-body rule: [February 2026 GCR](https://cdn.connectsites.net/user_files/scca/downloads/000/078/671/FEB-26.pdf?1771351149=)

Nissan’s 2004 350Z “axle and suspension parts” line:

- Standard: inspect every 30,000 miles or 24 months.
- Severe: inspect every 7,500 miles or 6 months.
- Premium: inspect every 7,500 miles or 6 months.

The page describes axles and suspension connection points. It does not name a hub, a wheel bearing, or a replacement mileage.

- Manufacturer spec: [2004 350Z axle and suspension parts](https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/axle-suspension-parts/?LocaleID=en_US&RegionID=1)

Z1’s Hayaku front wheel-bearing page says the part is an aftermarket replacement for Nissan **40202-AL56C**, built to OE specifications, and that it is one of the first aftermarket bearings they have seen that accepts OE-type wheel studs. Z1 says to replace them in pairs even though they are sold individually, because the other side may be close to failure. Fitment stated on the page: 2003–2008 350Z, 2003–2007 G35 coupe, 2003–2006 G35 sedan, 2WD only. A customer review says extended studs fit this hub when another aftermarket hub’s stud holes did not. Another review says the hub bore was larger than a Z1 20 mm spacer and had to be eased to fit. Those are fitment anecdotes, not a life.

- Vendor guidance and anecdotal reviews: [Z1 Hayaku 350Z / G35 front wheel bearing](https://www.z1motorsports.com/front-hub-and-spindle/hayaku-automotive/hayaku-350z-g35-front-wheel-bearing-p-22758.html)

On my350z, September 2012, commasense described a front-left hub that separated on track. The ring that holds the wheel studs came out of the hub and left a pentagonal hole. The rotor in the caliper was what still held the wheel. The same user later said that hub had **67 track days** on it. scotts300 reported the same failure that month and asked whether spacers were involved. The fetched pages do not answer the spacer question. betamotorsports wrote that front hubs on a 350Z or 370Z that sees track time are consumable, should be crack-tested, and should be replaced at the first sign of fatigue. If inspection is not done, that writer would replace hubs and front bearings every **12 to 18 track weekends**, and gave a parts cost of about $250 per pair with Timken bearings. Another participant said not to trust a forum post for hub strength or fatigue life, and to inspect any replacement and judge it from the car’s own results. A question about whether people replace fronts and rears is on the thread. The fetched text does not answer it.

- Anecdotal: [my350z hub separation](https://my350z.com/forum/autocross-road/384454-mid-ohio-crash-4.html)

Those two track lives disagree: one hub ran 67 track days, and one experienced racer’s suggestion is 12 to 18 track weekends if the team is not crack-testing. Neither number is a Nissan interval. Rear-hub track life was not stated. It is unknown.

Timken’s general wheel-hub damage guide says loss of bearing retention is the leading cause of hub-bearing damage they describe. The axle nut backs off if it was not torqued correctly or lost its retention feature, the bearing setting changes, and wear speeds up. Timken’s instruction is to use a new axle retaining nut and tighten it to the original-equipment torque. The guide does not give a 350Z torque.

- Manufacturer spec (general, not a 350Z procedure): [Timken Wheel Hub Damage Analysis Guide, LV7](https://www.timken.com/wp-content/uploads/2017/08/LV7-Wheel-Hub-Damage-Analysis-Guide.pdf)

Axle-nut torque for this car was not on any Nissan-hosted page fetched in this pass. It is unknown. Do not copy a third-party torque table into the rule.

### Unknown for hubs and bearings

- Lap life and engine-hour life.
- A rear-hub track interval.
- Whether spacers caused the 2012 hub separations.
- Axle-nut torque.
- A Nissan replacement mileage for the bearing itself. The axle-and-suspension line is inspect-only.

## Lug nuts

Stud life, torque conflicts, and the open-nut rule that is not a rule are in `wheel-studs.md`. This section is only the nut.

### What sources say

NASA CCR 11.4.2: all lug nuts must be present and must tightly hold the wheel.

- Sanctioning-body rule: [2026.3 NASA CCR](https://members.drivenasa.com/rules/ccr.pdf)

SCCA Time Trials: all lug nuts, wheel bolts, or wheel nuts present and torqued to spec. “Spec” is not defined on that page.

- Sanctioning-body rule: [SCCA Time Trials full safety rules](https://timetrials.scca.com/pages/full-safety-rules)

Z1’s open-end kit for the 350Z: steel, 12 mm × 1.25, 60 degree tapered seat, open end for extended studs, and not compatible with factory shank-style Nissan or Infiniti lug nuts. A review says the previous lugs snapped while being removed.

- Vendor guidance and anecdotal review: [Z1 splined open-end lug nuts](https://www.z1motorsports.com/z1-products/z1-motorsports/z1-splined-open-end-lug-nut-kit-chrome-p-33852.html)

Core4 says one-piece nuts on aluminum wheels without steel inserts should be inspected for galling after about 5–10 tightening cycles, because galling can stop the stud from developing preload. They also say paint in the nut seat should be removed.

- Vendor guidance: [Core4](https://www.core4motorsports.com/tech)

my350z reports nuts cross-threading or seizing and taking the stud with them, and cheap nuts damaging new ARP threads when used to draw a stud into the hub. Details and links are in `wheel-studs.md`.

No fetched source states a lug-nut replacement interval in miles, laps, hours, or events. That interval is unknown.

## Brake pads and rotors

### What sources say

Nissan’s 2004 350Z brake pads and rotors line:

- Standard: inspect every 15,000 miles or 12 months.
- Severe: inspect every 7,500 miles or 6 months.
- Premium: inspect every 7,500 miles or 6 months.

The page says calipers, pads, and rotors should be inspected regularly and replaced when necessary. It does not give a pad thickness, a rotor minimum thickness, or a lap count.

- Manufacturer spec: [2004 350Z brake pads and rotors](https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/brake-pads-rotors/?LocaleID=en_US&RegionID=1)

SCCA Time Trials safety rules:

- Brake pads or shoes should not be more than 50 percent worn at the start of an event, and should not be more than 85 percent worn during competition.
- Rotors and drums must be in good condition, without cracks or discoloration.
- There must be no brake-fluid leaks, and at least one brake light must work.

The page does not define how to measure “50 percent worn” or “discoloration.”

- Sanctioning-body rule: [SCCA Time Trials full safety rules](https://timetrials.scca.com/pages/full-safety-rules)

NASA CCR 11.4.5: brakes should work and stop the car in a reasonable distance, pedal pressure should be adequate, fluid must be above the manufacturer’s minimum, and brake lines must be in good condition. No pad or rotor measurement is given.

- Sanctioning-body rule: [2026.3 NASA CCR](https://members.drivenasa.com/rules/ccr.pdf)

SCCA Race Experience: brakes shall be pedal-operated, work on each wheel, and be in good working order. No thickness is given.

- Sanctioning-body rule: [SCCA Race Experience vehicle requirements](https://www.scca.com/pages/race-experience-vehicle-requirements)

### Unknown for pads and rotors

- Minimum pad thickness in millimeters.
- Minimum rotor thickness.
- Life in laps, sessions, or engine hours.
- Whether a heat-colored rotor that is not cracked fails SCCA’s “discoloration” wording. The rule says no discoloration and does not define the word.

## Brake fluid

### What sources say

Nissan’s 2004 350Z brake-fluid page, as fetched:

- Standard: maintenance not required.
- Severe: maintenance not required.
- Premium: the table shows inspect actions at 3,750 miles or 3 months, and also an inspect action at 7,500 miles or 6 months. The fetched table does not show a replace mileage.

The explanatory paragraph says fluid absorbs moisture, that water can boil into a compressible gas, and that fluid should be replaced “as specified.” The interval table on that page does not specify a replacement. That is a gap inside one Nissan page, not a second source.

- Manufacturer spec: [2004 350Z brake fluid](https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/brake-fluid/?LocaleID=en_US&RegionID=1)

SCCA Time Trials: brake fluid must be clean and full. DOT 4 is recommended. No leaks.

- Sanctioning-body rule: [SCCA Time Trials full safety rules](https://timetrials.scca.com/pages/full-safety-rules)

Motul RBF 600 Factory Line, English technical data sheet dated 09/25:

- Racing brake fluid for hydraulic brakes and clutches, including extreme racing temperatures. Also stated as suitable for conventional steel-disc brakes.
- Dry boiling point 312°C / 594°F. Wet boiling point 205°C / 401°F.
- The wet point is measured after adding 3 percent water, which Motul says represents the fluid after about one year of use.
- Drain interval: follow the vehicle maker, and adjust it to your own use.
- Do not mix with silicone DOT 5 or mineral fluid (LHM). Keep the bottle closed so it does not absorb moisture.

- Manufacturer spec: [Motul RBF 600 English sheet, 09/25](https://azupim01.motul.com/media/motulData/DO/base/rbf_600_factory_line_en_za_motul_48100_20250911.pdf)

Motul’s German RBF 600 sheet dated 06/21 does not say the same thing about drain interval. It says the fluid should be changed at least after every second race, and no later than four weeks. Its wet boiling point on that sheet is 204°C / 399°F, not 205°C / 401°F. The dry point is the same 312°C / 594°F.

- Manufacturer spec: [Motul RBF 600 German sheet, 06/21](https://azupim01.motul.com/media/motulData/DO/base/RBF_600_FACTORY_LINE_de_DE_motul_20210607.pdf)

Those two Motul documents disagree on the change interval and differ by one degree on the wet boiling point. The English sheet is the newer date. Neither sheet mentions a 350Z. Nissan’s street table does not require a brake-fluid change under standard or severe service. A racing-fluid change interval and Nissan’s street table are not the same instruction.

### Unknown for brake fluid

- A Nissan replacement mileage. The fetched table does not contain one.
- A lap or engine-hour interval.
- Which Motul sentence the maker currently wants English-speaking customers to follow. Both sheets were live on the fetch date.

## Engine oil

### What sources say

Nissan’s 2004 350Z engine oil and filter line:

- Standard: replace every 7,500 miles or 6 months.
- Severe: replace every 3,750 miles or 3 months.
- Premium: replace every 3,750 miles or 3 months.

The page says oil loses lubrication and cooling ability and that the filter can clog. It does not mention track days, laps, or engine hours.

- Manufacturer spec: [2004 350Z engine oil and filter](https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/engine-oil-and-filter/?LocaleID=en_US&RegionID=1)

### Unknown for engine oil

- Any lap interval.
- Any engine-hour interval.
- Whether Nissan classifies road racing as severe, premium, or something outside both. The fetched page does not say.

No other oil maker’s track interval was fetched in this pass, so none is cited.

## Differential oil

### What sources say

Nissan’s 2004 350Z differential-oil page:

- Standard: inspect every 15,000 miles or 12 months.
- Severe: the page shows both an inspect action and a replace action at 15,000 miles or 12 months.
- Premium: the fetched rendering repeats “3,750 miles or 3 months” and does not consistently attach the word inspect or replace to that column. Do not treat a premium action as confirmed from this fetch. Open the live page before using the premium column.

The page says heat and contamination reduce the oil’s lubricating properties, and to change it at the specified intervals. It does not give a viscosity, a capacity, or a track-hour interval.

- Manufacturer spec: [2004 350Z differential oil](https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/differential-oil/?LocaleID=en_US&RegionID=1)

### Unknown for differential oil

- Premium-column action, until someone re-reads the live table.
- Oil grade and fill quantity. They were not on this page.
- Lap or engine-hour life.

## Transmission oil

### What sources say

Nissan’s 2004 350Z manual-transmission-oil page, for the manual-transmission rows it labels Base, Enthusiast, Performance, Touring, and Track:

- Standard: inspect every 15,000 miles or 12 months.
- Severe: the page shows an inspect action and a replace action at 15,000 miles or 12 months.
- Premium: the page shows inspect actions and a replace action at 7,500 miles or 6 months.

The same page lists Enthusiast and Touring **automatic** rows as “maintenance not required” under the conditions it displays. This car’s gearbox has to be identified before either row is used. The page does not give an oil grade, a capacity, or an hour interval.

- Manufacturer spec: [2004 350Z manual transmission oil](https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/manual-transmission-oil/?LocaleID=en_US&RegionID=1)

### Unknown for transmission oil

- Oil grade and capacity.
- Lap or engine-hour life.
- Which severity column applies to a race weekend. The page does not say.

## Proposed team starting points

**team policy (community research), v1, not a factory or official interval.**

Lug-nut torque is the approved stud rule in `wheel-studs.md`. Front-hub life, brake-fluid life, engine-oil life, differential-oil life, and transmission-oil life are **PROPOSED - not approved**. Each of those policy values is **BLANK** until Colton decides. The research above is unchanged. Leave lap and hour fields blank.

### Hubs and wheel bearings

**PROPOSED - not approved.** Policy value: **BLANK** until Colton decides.

NASA CCR 2026.3 section 11.4.3 and the SCCA Time Trials safety rules say bearings must be play-free. That is a sanctioning-body inspection rule, not a team life interval. Z1’s pair recommendation and the 12-to-18 track-weekend anecdote, including the hub that lasted 67 track days, stay in the research section. No weekend cap, pair rule, or rear-hub life is entered.

### Lug nuts

- No mile, lap, or hour life. Unknown.
- At every wheel change, the nut must match the wheel seat. Do not put Z1’s 60 degree open nuts on a factory shank-style wheel. Z1 says they are not compatible.
- Replace a nut that is galled, rounded, cross-threaded, or that was used to draw a stud into the hub. Core4’s galling note and the my350z thread damage are the reasons.
- Lug-nut torque is the stud policy in `wheel-studs.md`: 80 ft-lb (108 N·m), admin-editable. Source label, exact: '2004 Nissan 350Z owner's manual p. 6-6 (third-party copy on carmanualsonline.info, not Nissan-hosted), 80 ft-lb (108 N·m); value approved by Colton Wiles on 2026-10-25'. This is an owner's-manual value approved for team use, not a verified factory service-manual spec. Forum figures of 90–100 ft-lb and “20 over” are not adopted. The same manual page says retighten after 600 miles (1,000 km), keep the threads dry, and use the 1–5 sequence.

### Brake pads and rotors

- Nissan’s published action is inspection, at the mileages above, and replacement “when necessary.” v1 does not convert 7,500 miles into a track interval.
- For an event, use the SCCA Time Trials wear wording as the starting gate, including at NASA events: pads not more than 50 percent worn at the start, not more than 85 percent worn during the event, rotors not cracked. “Discoloration” is in the SCCA sentence and is undefined there. v1 treats a crack, a missing chunk, or a rotor that has been cut below a thickness written on the rotor hat as a fail. If the hat is not marked, thickness limit is unknown and the rotor is failed only for a crack, a missing chunk, or a pedal or vibration problem found in inspection. Do not invent a minimum thickness.
- No lap life. Record sessions on the pad set so a later rule can have a number.

### Brake fluid

**PROPOSED - not approved.** Policy value: **BLANK** until Colton decides.

Nissan’s table and both Motul drain sentences stay in the research section. No inspect-only rule and no “every second race / four weeks” cap is adopted.

### Engine oil

**PROPOSED - not approved.** Policy value: **BLANK** until Colton decides.

Nissan’s 7,500-mile / 6-month and 3,750-mile / 3-month figures stay in the research section. No mile, month, lap, or hour interval is adopted.

### Differential

**PROPOSED - not approved.** Policy value: **BLANK** until Colton decides.

Nissan’s 15,000-mile / 12-month inspect and replace figures stay in the research section. No interval is adopted. Grade, capacity, lap life, and hour life remain unknown.

### Transmission

**PROPOSED - not approved.** Policy value: **BLANK** until Colton decides.

Nissan’s manual-transmission figures, and the automatic rows marked maintenance not required, stay in the research section. No 15,000-mile or 7,500-mile interval is adopted. Grade, capacity, lap life, and hour life remain unknown.

## What to record

Stud failures have their own sheet in `wheel-studs.md`. For the parts in this note, record at least: corner or system, part number and component identity, miles, laps, and engine hours at installation and at removal, the event, the reason (play, crack, leak, discolored fluid, pad percent, or calendar), and photos. Do not convert one meter into another.

## Sources

Re-fetched 2026-10-25. See the note under the title for which hosts returned HTTP 200.

| Source | Label | URL |
| --- | --- | --- |
| NASA CCR 2026.3 | Sanctioning-body rule | https://members.drivenasa.com/rules/ccr.pdf |
| SCCA Time Trials safety rules | Sanctioning-body rule | https://timetrials.scca.com/pages/full-safety-rules |
| SCCA GCR, February 2026 | Sanctioning-body rule | https://cdn.connectsites.net/user_files/scca/downloads/000/078/671/FEB-26.pdf?1771351149= |
| SCCA Race Experience vehicle requirements | Sanctioning-body rule | https://www.scca.com/pages/race-experience-vehicle-requirements |
| Nissan axle and suspension parts | Manufacturer spec | https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/axle-suspension-parts/?LocaleID=en_US&RegionID=1 |
| Nissan brake pads and rotors | Manufacturer spec | https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/brake-pads-rotors/?LocaleID=en_US&RegionID=1 |
| Nissan brake fluid | Manufacturer spec | https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/brake-fluid/?LocaleID=en_US&RegionID=1 |
| Nissan engine oil and filter | Manufacturer spec | https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/engine-oil-and-filter/?LocaleID=en_US&RegionID=1 |
| Nissan differential oil | Manufacturer spec | https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/differential-oil/?LocaleID=en_US&RegionID=1 |
| Nissan manual transmission oil | Manufacturer spec | https://maintenance-schedules.nissanusa.com/maintenance-schedules/2004/350z/components/manual-transmission-oil/?LocaleID=en_US&RegionID=1 |
| Z1 Hayaku front bearing | Vendor guidance | https://www.z1motorsports.com/front-hub-and-spindle/hayaku-automotive/hayaku-350z-g35-front-wheel-bearing-p-22758.html |
| Z1 open-end lug nuts | Vendor guidance | https://www.z1motorsports.com/z1-products/z1-motorsports/z1-splined-open-end-lug-nut-kit-chrome-p-33852.html |
| Timken hub damage guide LV7 | Manufacturer spec | https://www.timken.com/wp-content/uploads/2017/08/LV7-Wheel-Hub-Damage-Analysis-Guide.pdf |
| Core4 stud torque notes | Vendor guidance | https://www.core4motorsports.com/tech |
| my350z hub separation | Anecdotal | https://my350z.com/forum/autocross-road/384454-mid-ohio-crash-4.html |
| Motul RBF 600, English, 09/25 | Manufacturer spec | https://azupim01.motul.com/media/motulData/DO/base/rbf_600_factory_line_en_za_motul_48100_20250911.pdf |
| Motul RBF 600, German, 06/21 | Manufacturer spec | https://azupim01.motul.com/media/motulData/DO/base/RBF_600_FACTORY_LINE_de_DE_motul_20210607.pdf |
