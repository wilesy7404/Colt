# Inventory specification

Status: documentation only. This is the stack-agnostic contract for inventory, purchasing, and the stock side of a completed maintenance transaction.

Vehicle and use: one-car team, 2004 Nissan 350Z, NASA and SCCA road-course events. Failure prevention is the priority. Snapped wheel studs are a known safety-critical failure mode. Records start empty. Historical maintenance is not invented to fill the system.

Sources: `PROJECT_HANDOFF.md` and `README.md`. Owner decisions dated 2026-10-25 are cited in the text as Owner decision, 2026-10-25. Where a fact is still missing, the value is **UNKNOWN**. UNKNOWN means the team must supply it from verified specifications, team engineering policy, applicable racing rules, or a documented failure investigation. It does not mean zero, and it does not mean healthy.

This file does not choose a language, database, host, or migration tool. Phase 1 maps the logical types below onto whatever stack it selects. Race Backend is the server-side component that validates and commits maintenance and inventory writes. It must implement the contract in [Atomic replacement](#11-atomic-replacement). This document does not implement that contract.

## 1. Scope

In scope:

- Identity separation for catalog part, physical component, sealed kit or stock unit, and installation or removal history.
- Sealed wheel-stud sets of five, including hub replacement of a whole set, state, and traceability.
- An append-only stock-movement ledger and on-hand quantities derived from it.
- Reorder policy, early reorder warnings, and stock reserved for events.
- The all-or-nothing commit that consumes stock together with the maintenance record and the service baseline.
- Suppliers, purchase notes, purchase orders, lead times, and receiving into new kit identities.
- Inputs an event-readiness forecast needs, and the rule that a forecast is an estimate.

Out of scope:

- Application code, schema migrations, and stack selection.
- Approved replacement intervals, torque, inspection limits, and measurement limits.
- A full service-rule catalog. Rules are referenced only where a commit must read them.
- The offline sync protocol. Stable ids and idempotency are specified so a future queue can replay a commit. Sync itself is not claimed.
- User-account storage. Actors are `user_id` values owned by the authentication system.
- Certifying that the car is safe to race. Software status is a record, not a certification.

## 2. How to read this document

Normative words:

- **MUST** and **MUST NOT** are requirements on Race Backend and on any schema Phase 1 aligns to this contract.
- **MAY** is an allowed behavior.

Logical types, mapped by Phase 1:

| Type | Meaning |
| --- | --- |
| `id` | Stable opaque identifier. Unique inside its entity. Immutable. Generation method is an implementation choice. An `id` is never a catalog part number. |
| `ref(X)` | Reference to `X`'s id. The target must exist when the referencing row commits, unless the field is optional and empty. |
| `string` | Short text. |
| `text` | Long text. |
| `integer` | Whole number. |
| `decimal` | Exact decimal quantity. Scale is UNKNOWN unless a constraint below fixes it. |
| `boolean` | True or false. |
| `timestamp` | Instant with a timezone. |
| `date` | Civil date, with no time of day. |
| `enum(...)` | One of the named values. |

Requirement column:

| Mark | Meaning |
| --- | --- |
| R | Required on every persisted row. |
| O | Optional. Empty means unknown or not applicable, never a fabricated default. |
| C | Required only when the condition in Constraints holds. |
| D | Derived. Not an editable source of truth. A cache is allowed only if a disagreement with the derivation is treated as a defect. |

Column defaults that invent a quantity are forbidden. Generic minimum stock, desired stock, numeric lead time, order quantity, and on-hand quantity have no numeric default. Empty policy is `null`, and `null` is not `0`. A stored `0` is allowed only when a person explicitly records zero.

The wheel-stud reorder target and inclusive warning threshold in [section 10](#10-reorder-and-event-holds) are Owner decision, 2026-10-25. They apply only to the wheel-stud catalog item. They are not defaults for other parts. The supplier lead-time phrase in [section 12](#12-purchasing) is also that owner's words. It is text, not a number of days.

No field in this specification is pre-filled with a part number, a supplier name, a numeric lead time, an interval, or a torque.

## 3. Prototype boundary

`index.html` is a throwaway local prototype. It is not a schema to extend.

What it gets wrong for inventory:

- One stock row can stand for several sealed sets. A single kit/stock id carries an editable `qty`. The illustrative seed does this with a quantity greater than one. A sealed set of five needs its own kit id. Quantity of sets is how many kit rows exist, not a number on one row.
- The part description and the kit id share one form. Catalog identity and stock identity are different concepts.
- There is no component id and no installation or removal record.
- Adding stock overwrites a quantity and appends a local activity string. There is no append-only ledger, no receive movement, and no link from consumption to a validated maintenance transaction.
- Reorder is one number on the stock row. The form also ships with a numeric reorder default. That default is not team policy and must not become a column default.
- Browser local storage, including the demo seed, is not production stock. Production starts with no stock rows and no historical installs.

The prototype's unit label for a five-stud set matches the documented packaging. Its data shape does not. Do not design the schema around that shape.

## 4. Identity model

These four identities stay distinct. No table, column, or screen may use one of them as a substitute for another.

| Concept | Entity | What it identifies |
| --- | --- | --- |
| Catalog / part number | `CatalogItem` | The approved kind of part. Many physical parts share one catalog item. |
| Component ID | `Component` | One physical component or assembly. |
| Kit / stock ID | `Kit` | One sealed kit or other stock unit. For wheel studs, one sealed set of five. |
| Installation / removal record | `ComponentEvent` | What happened to one physical component on the car: installed or removed. |

A part number does not identify which set a stud came from. A kit id does not identify which wheel a stud is in. An installation record does not become a new catalog item. Replacing a component creates new events; it does not reuse the removed component's id for the new part.

```mermaid
erDiagram
  CatalogItem ||--o{ Kit : classifies
  CatalogItem ||--o{ Component : classifies
  Kit ||--o{ Component : originates
  Component ||--o{ ComponentEvent : history
  MaintenanceTransaction ||--|{ ComponentEvent : records
  MaintenanceTransaction ||--o{ StockMovement : consumes
  Kit ||--o{ StockMovement : traces
  Supplier ||--o{ PurchaseOrder : supplies
  PurchaseOrder ||--|{ PurchaseOrderLine : contains
  PurchaseOrderLine ||--o{ Receipt : receives
  Receipt ||--|{ Kit : creates
  PlannedEvent ||--o{ StockReservation : holds
  CatalogItem ||--o| ReorderPolicy : sets
```

Traceability that must be reconstructable for an installed wheel stud:

`ComponentEvent` → `Component` → origin `Kit` → `receive` movement → `Receipt` → `PurchaseOrderLine` / supplier.

The catalog part number is snapshotted on the event so a later catalog edit does not rewrite history.

## 5. Wheel-stud product facts

### 5.1 Packaging and profile

Wheel studs are stocked in **sealed sets of five**. `CatalogItem.profile = wheel_stud_set` applies all of the following:

- `tracking_class = sealed_kit`
- `nominal_set_size = 5`
- `individual_tracking = on_open`
- `safety_critical = true`
- Hub install quantity is one complete sealed set. See [5.2](#52-owner-decisions-2026-10-25).
- Removal disposition is `scrapped` only.

Set size 5 is not a service interval and not a torque. Do not copy it onto unrelated catalog items. `nominal_set_size` for a non-stud item is UNKNOWN until supplied.

### 5.2 Owner decisions, 2026-10-25

These are Colton's decisions. Each rule below is Owner decision, 2026-10-25.

**Identity.** The wheel studs are ARP extended studs. On the wheel-stud catalog item, `manufacturer` is `ARP` and `description` is `extended studs`. `part_number` stays null until an admin enters the real number. Do not invent a part number. Do not store `ARP` in `part_number`. The brand belongs in `manufacturer` or in `description` only. Race Backend rejects a wheel-stud `part_number` that is only the manufacturer name.

**Hub replacement.** A replacement always installs one complete sealed set of five on a hub. Sets are never mixed on one hub. Partial-set replacement on a hub is not allowed. This is a validation invariant on the replacement transaction. If it fails, the commit is rejected and there is no stock effect: no open, no consume, no baseline. Sections [8](#8-sealed-sets-of-five) and [11](#11-atomic-replacement) state the checks.

**Spares.** The pre-event target is 4 spare sealed wheel-stud sets, one per wheel. The reorder warning triggers when sealed sets on hand are 4 or fewer. For this catalog item, `desired_stock_sets` is 4 and `warning_threshold_sets` is 4, inclusive. Loose and opened studs never count. The threshold equals the target, so the warning stays active whenever sealed sets on hand are at or below the target, including when the count is exactly 4. That inclusive comparison is intended. Do not change it.

**Lead time.** The supplier lead-time default is the free text `a few days`. An admin can edit that text. The numeric lead time in days stays null unless an admin enters a number. Forecasting must not turn `a few days` into a number.

**Scrap.** Removed studs are always scrapped. Reuse is permanently blocked. Removal moves the stud to terminal `scrapped`. No installable transition exists out of that state.

### 5.3 Strict defaults

The team also set defaults for items that were still open.

- Torque, replacement intervals, and inspection limits stay unknown until a verified source supplies them. The stud replacement interval and its lap, engine-hour, event, calendar, and service thresholds stay UNKNOWN pending `docs/research/wheel-studs.md`. This spec does not copy numbers from that file. Do not enter a placeholder. This is not a knob for guessing a value.
- Negative-stock exceptions are never allowed for wheel studs. **default, adjustable by team policy.** Until a later policy changes it, a wheel-stud movement that would go negative is rejected, and an `AuthorizedStockException` cannot cover it.
- Reused studs are rejected. This restates the scrap decision. It is permanent, not adjustable.
- Mixed studs on a hub are rejected. This restates the hub rule. It is not adjustable.
- Studs already on the car when records start are recorded with unknown history. They are not given a made-up date, kit, reading, procedure, or interval. The record kind is `opening_identification` in [11.6](#116-records-that-are-not-a-replacement). Inventing that history is not allowed.

## 6. Shared enumerations

### 6.1 `tracking_class`

| Value | Meaning |
| --- | --- |
| `sealed_kit` | On-hand complete stock is counted in whole kits. Each kit has its own id. |
| `serialized` | Each physical item is a `Component`. A kit is optional. Behavior beyond identity is UNKNOWN until a later spec. |
| `bulk` | Ledger quantity without a sealed-set identity. Piece-level kit rules do not apply. |

Wheel studs use `sealed_kit`. This document fully specifies sealed-kit behavior for `profile = wheel_stud_set`. `serialized` and `bulk` exist so the catalog can record other parts without pretending they are five-stud sets. Their movement details beyond the shared ledger fields are UNKNOWN.

### 6.2 Kit `state`

| Value | Meaning |
| --- | --- |
| `sealed` | Seal intact. Counted as one complete sealed set. Pieces are not individually issued. |
| `opened` | Seal broken by an `open` movement. No piece from this kit has been consumed. Counted as loose remainder, not as a complete sealed set. |
| `partially_used` | At least one piece has been consumed, and at least one piece remains available to install. |
| `depleted` | No available unissued piece remains, and the remainder is not sitting in kit-level quarantine. The row is kept. |
| `quarantined` | The whole kit, or the entire remainder, is held and unavailable. |
| `returned` | The set or its unused remainder left team control back to the supplier. Terminal. |

`opened` means "no consume yet," not "five pieces are necessarily still available." A piece-level quarantine or loss adjustment can lower the available remainder while the kit stays `opened`. The ledger records the cause. The state name alone must not be read as a consumption.

### 6.3 Allowed kit transitions

A transition persists only inside a committed movement transaction. A failed or abandoned attempt leaves the previous state.

| From | To | When |
| --- | --- | --- |
| (none) | `sealed` | `receive` of a new kit id |
| `sealed` | `opened` | `open`, and no piece is consumed in that commit |
| `sealed` | `partially_used` | `open` and a partial `consume` in the same commit |
| `sealed` | `depleted` | `open` and a `consume` of every piece in the same commit |
| `sealed` | `quarantined` | kit-level `quarantine` |
| `sealed` | `returned` | `return` of the intact set to the supplier |
| `opened` | `partially_used` | first `consume` of one or more, but not all, remaining available pieces |
| `opened` | `depleted` | `consume` or scrapping adjustment that leaves nothing available and nothing held |
| `opened` | `quarantined` | kit-level quarantine, or piece-level holds that cover every remaining piece |
| `opened` | `returned` | every piece is returned to the supplier and none was consumed |
| `partially_used` | `partially_used` | further partial `consume` or piece-level hold, with available remainder still above zero |
| `partially_used` | `depleted` | last available pieces consumed or scrapped, none left in quarantine |
| `partially_used` | `quarantined` | remaining pieces quarantined as a kit |
| `quarantined` | the stored `quarantine_from_state` | `release_quarantine` |
| `depleted` | (none) | terminal |
| `returned` | (none) | terminal |

Forbidden:

- Any path back to `sealed`. A broken seal cannot be restored in the record.
- `release_quarantine` to a state other than `quarantine_from_state`.
- `depleted` or `returned` back into available stock.
- Replacing the kit id, splitting one sealed set across two kit ids, or merging leftovers into a new kit id.

The table and diagram in this section are the general sealed-kit model. They do **not** apply to `profile = wheel_stud_set`. Wheel-stud kits use only the transitions in [8.2](#82-opening-and-hub-replacement). A wheel-stud commit whose end state would be `opened` or `partially_used` is rejected.

```mermaid
stateDiagram-v2
  [*] --> sealed: receive
  sealed --> opened: open
  sealed --> partially_used: open and partial consume
  sealed --> depleted: open and consume all
  sealed --> quarantined: quarantine
  sealed --> returned: return intact
  opened --> partially_used: partial consume
  opened --> depleted: consume or scrap all
  opened --> quarantined: quarantine remainder
  opened --> returned: return all unused
  partially_used --> partially_used: further partial consume
  partially_used --> depleted: remainder consumed
  partially_used --> quarantined: quarantine remainder
  quarantined --> sealed: release only if held from sealed
  quarantined --> opened: release only if held from opened
  quarantined --> partially_used: release only if held from partially_used
  depleted --> [*]
  returned --> [*]
```

### 6.4 Component `status`

Projection of component events plus piece-level stock movements. Required values: `contained`, `installed`, `removed`, `held`, `quarantined`, `scrapped`, `returned`.

`scrapped` is terminal for a wheel stud. Owner decision, 2026-10-25: removal moves the stud to `scrapped`, and no later transition may make it `contained`, `installed`, `held`, or otherwise installable.

`held` means a non-stud component is in team possession and is not installable. Reuse policy for non-stud parts is still UNKNOWN. `returned_to_stock` must not make any part installable while that policy is unknown.

### 6.5 Movement `type`

| Value | Effect on quantity | Service baseline |
| --- | --- | --- |
| `receive` | Creates one new kit in `sealed`. | Unchanged. |
| `open` | Reclassifies that kit from complete sealed set to loose remainder. Piece count is conserved. | Unchanged. |
| `consume` | Removes pieces from a kit to put them in service. | Updated only inside the replacement bundle in [section 11](#11-atomic-replacement). |
| `adjust` | Correction, loss, or found-damage quantity change, with a reason. | Unchanged. |
| `return` | Sends stock back to the supplier, or records a return-to-hold that stays non-installable. | Unchanged. |
| `quarantine` | Removes stock from available counts. Does not destroy history and is not consumption. | Unchanged. |
| `release_quarantine` | Inverse of a kit-level quarantine. Returns the kit to `quarantine_from_state`. | Unchanged. |

`open` is justified because sealed-set counts and loose remainder must move together under an audited actor. Without it, opening a box would look like a loss or would leave the set falsely complete.

`quarantine` is justified because a held set must disappear from available stock without looking like a consumed replacement and without resetting an interval.

Reservations are not movement types. They change availability, not physical on-hand. See `StockReservation`.

### 6.6 Other enumerations

- Catalog `status`: `draft`, `approved`, `retired`.
- Purchase note `status`: `open`, `promoted`, `closed`.
- Purchase order `status`: `draft`, `ordered`, `partially_received`, `received`, `cancelled`.
- Reservation `status`: `active`, `released`, `consumed`, `cancelled`.
- Exception `status`: `authorized`, `consumed`, `revoked`.
- Maintenance transaction `kind`: `replacement`, `inspection`, `removal_without_install`, `opening_identification`.
- Maintenance transaction `status`: `draft`, `committed`, `rejected`.
- Planned event `status`: `planned`, `cancelled`, `completed`.
- Location `kind`: `shop`, `transport`, `event`, `quarantine_hold`, `other`.
- Evidence `kind`: `photograph`, `measurement`, `written_observation`, `other`.
- Removal `reason_code`: `failure`, `other`.
- Disposition `code`: `scrapped`, `quarantined`, `retained_for_investigation`, `returned_to_supplier`, `returned_to_stock`, `other`.
- Idempotency `scope`: `maintenance_transaction`, `stock_movement`, `receipt`.
- Idempotency `status`: `in_flight`, `committed`, `rejected`.

`failure` exists because studs have snapped and that reason must be representable. A finer failure taxonomy is UNKNOWN. Details go in text, not in invented cause codes.

For `wheel_stud_set`, the only valid disposition is `scrapped`. Owner decision, 2026-10-25. Other disposition codes are rejected on a wheel-stud removal.

`returned_to_stock` is not valid for wheel studs. For any other profile it records intent only and does not make the component installable.

## 7. Entities and fields

Actor ids point at the authentication system. This specification does not define the user table. Server-side authorization decides whether that actor may perform the write. A client-supplied on-hand quantity is ignored.

### 7.1 `Vehicle`

The team has one car. The row exists so history names the car explicitly. Documented identity is a 2004 Nissan 350Z. VIN, competition number, and class identifiers are UNKNOWN. Do not invent them.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `vehicle_id` | id | R | Immutable, unique. | Internal identity. |
| `model_year` | integer | R | Documented value 2004. | Model year. |
| `make` | string | R | Documented value Nissan. | Make. |
| `model` | string | R | Documented value 350Z. | Model. |
| `vin` | string | O | Empty until the team records the real VIN. | Chassis identifier. |
| `competition_number` | string | O | Empty until recorded. | Event number. |
| `notes` | text | O | | Team notes. |

### 7.2 `CatalogItem`

The type of part. Installation stores `catalog_item_id` as a snapshot reference; later edits do not change past events.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `catalog_item_id` | id | R | Immutable, unique. | Internal identity. Not the part number. |
| `part_number` | string | O | Unique together with `revision` among non-retired rows when both are set. Null until an admin enters a real number. The wheel-stud value is null. Must not be `ARP` and must not be invented. | Approved catalog / part number. |
| `manufacturer` | string | C | Required for `wheel_stud_set`. The wheel-stud value is `ARP`. Owner decision, 2026-10-25. Not a part number. | Brand or manufacturer. |
| `revision` | string | C | Required when `part_number` is set. Otherwise null. Do not invent a revision. | Revision of this catalog row. |
| `description` | string | R | Non-empty. The wheel-stud value is `extended studs`. Owner decision, 2026-10-25. | Human description. |
| `profile` | enum | R | `wheel_stud_set` or `none`. | Applies the wheel-stud rules when set. |
| `tracking_class` | enum | R | See [6.1](#61-tracking_class). Must be `sealed_kit` when profile is `wheel_stud_set`. | How stock identity works. |
| `nominal_set_size` | integer | C | Required when `tracking_class` is `sealed_kit`. Immutable. Must be 5 when profile is `wheel_stud_set`. No default for other profiles. | Pieces in one sealed kit. |
| `individual_tracking` | enum | R | `none`, `on_open`, `always`. Wheel-stud profile must be `on_open`. | When component ids are allocated. |
| `safety_critical` | boolean | R | Wheel-stud profile must be true. | Safety-critical kind of part. |
| `set_unit_name` | string | C | Required for `sealed_kit`. | Name of one whole kit, such as the team's words for a sealed set. |
| `piece_unit_name` | string | C | Required for `sealed_kit` and `bulk`. | Name of one piece. For wheel studs, a stud. |
| `status` | enum | R | `draft`, `approved`, `retired`. New rows start as `draft` only by an explicit save, not by receiving them. | Approval state. |
| `approval_source` | string | C | Required when `part_number` is set. For the wheel-stud item while `part_number` is null, the brand and hub rules cite Owner decision, 2026-10-25. That citation is not a part number. | Document that approves a part number and revision, when a number exists. |
| `supersedes_catalog_item_id` | ref(CatalogItem) | O | Must not form a cycle. | Prior catalog row this one replaces. |
| `notes` | text | O | | |
| `created_at` | timestamp | R | Server time. | |
| `created_by` | ref(user) | R | | |
| `updated_at` | timestamp | R | Server time. | |
| `updated_by` | ref(user) | R | | |

Only `approved` catalog items may be received into stock or installed. Retiring a catalog item does not delete kits, components, or history.

A wheel-stud install uses the `wheel_stud_set` catalog item. A null `part_number` does not block that identity: the owner left the number blank on purpose. Cross-item substitution is rejected. Whether a later second stud part number is interchangeable is still UNKNOWN. When an admin enters the real number, they enter `revision` and `approval_source` in the same save. The save must not copy `manufacturer` into `part_number`.

### 7.3 `Location`

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `location_id` | id | R | Immutable, unique. | |
| `name` | string | R | Non-empty. Unique among active locations. Actual names are UNKNOWN. | Storage place. |
| `kind` | enum | R | See [6.6](#66-other-enumerations). | Coarse class. |
| `active` | boolean | R | | Inactive locations cannot be newly assigned. |
| `notes` | text | O | | |

### 7.4 `Kit`

One stock identity. For a wheel-stud set, the row is one sealed set of five, never a stack of sets.

There is no editable `qty` on this entity.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `kit_id` | id | R | Immutable, unique, never reused. | Kit / stock ID. |
| `catalog_item_id` | ref(CatalogItem) | R | Immutable. Target must be `approved` at receive time. | What this set is. |
| `nominal_contents_count` | integer | R | Immutable. Copied from the catalog item at receive. Must be 5 for `wheel_stud_set`. | Pieces the sealed unit contains. |
| `state` | enum | R | See [6.2](#62-kit-state). Changes only through movements. | Current kit state. |
| `quarantine_from_state` | enum | C | Required when `state` is `quarantined`. Otherwise empty. Allowed values: `sealed`, `opened`, `partially_used`. For `wheel_stud_set` the only allowed value is `sealed`. | State to restore on release. |
| `kit_label` | string | O | Unique if present. Format is UNKNOWN. Not a part number. | Human label printed or written on the set. |
| `location_id` | ref(Location) | O | | Where the kit is stored. |
| `supplier_id` | ref(Supplier) | C | Required when the kit was received from a supplier. | Source supplier. |
| `purchase_order_line_id` | ref(PurchaseOrderLine) | O | | Line this set was ordered on, if any. |
| `receipt_id` | ref(Receipt) | R | Immutable after receive. | Receipt that created the kit. |
| `received_at` | timestamp | R | Server time of the committed receipt. | |
| `seal_intact` | boolean | D | True only when `state` is `sealed`, or `state` is `quarantined` and `quarantine_from_state` is `sealed`. | Projection of seal. |
| `opened_at` | timestamp | C | Required once an `open` movement has committed. | |
| `opened_by` | ref(user) | C | Required together with `opened_at`. | |
| `open_reason` | text | C | Required together with `opened_at`. Non-empty. | Why the seal was broken. |
| `notes` | text | O | | |

Derived, not stored as authority:

| Attribute | Derivation |
| --- | --- |
| `unissued_pieces` | `nominal_contents_count` minus pieces that have left the kit on a committed `consume`, `return`, or negative `adjust`. While `sealed`, this equals `nominal_contents_count` because pieces cannot leave before `open`. |
| `available_pieces` | Unissued pieces that are not piece-quarantined and not on a kit in `quarantined`, `depleted`, or `returned`. |
| `complete_sealed_set` | 1 when `state` is `sealed`, otherwise 0. |

For a wheel-stud kit, `available_pieces` while `sealed` is not loose stock. The set counts as one sealed set. Loose stock starts at `open`.

### 7.5 `Component`

One physical part. Wheel-stud component rows are created when the kit is opened (`individual_tracking = on_open`), before any stud from that kit is installed or left as identified loose remainder. A sealed kit has no component rows yet. The kit id is the identity until the seal is broken.

Opening a wheel-stud kit creates one component row per piece in the sealed set: `nominal_contents_count` rows, which is 5. No piece has been issued yet. Each row's `origin_kit_id` is that kit.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `component_id` | id | R | Immutable, unique, never reused. | Component ID. |
| `catalog_item_id` | ref(CatalogItem) | R | Immutable. Matches the origin kit's catalog item. | Part type. |
| `origin_kit_id` | ref(Kit) | C | Required for pieces from a sealed kit. Immutable. Null when `history_unknown` is true. Do not invent a kit for studs already on the car. | Kit this physical part came from. |
| `history_unknown` | boolean | R | True only for studs recorded by `opening_identification`. False for studs installed from a sealed kit. | Prior life was not recorded. Not a claim that the stud is new or that an interval was met. |
| `identity_source` | enum | R | `team_assigned` or `manufacturer_marked`. | Whether the id is the team's or a mark found on the part. Which source wheel studs actually have is UNKNOWN. The brand ARP is not a serial. |
| `manufacturer_mark` | string | O | Empty when no mark was observed. Never invented. | Mark read from the part. |
| `status` | enum | D | See [6.4](#64-component-status). | Projection. |
| `created_at` | timestamp | R | | |
| `notes` | text | O | | |

Current vehicle position is not a field on `Component`. It is the position on the latest `installation` event that has no later `removal` for that component.

`origin_kit_id` never changes. There is no transfer onto another kit.

### 7.6 `ComponentEvent`

An installation or a removal of one component. This is the installation/removal record. It is not a catalog row, not a kit, and not the component itself.

Events are immutable. A correction is a later event or a later maintenance transaction, not an edit.

Shared facts about the job (readings, procedure, technician, sign-off) live on `MaintenanceTransaction` and are copied onto the event as a snapshot so the component history still reads correctly if the transaction representation changes.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `component_event_id` | id | R | Immutable, unique. | |
| `maintenance_transaction_id` | ref(MaintenanceTransaction) | R | A committed `replacement` or `removal_without_install`. A draft must not own events. An `inspection` does not own installation or removal events. | Parent transaction. |
| `component_id` | ref(Component) | R | Immutable. | The physical part. |
| `catalog_item_id` | ref(CatalogItem) | R | Snapshot of the approved part used. | Part number identity at the time. |
| `origin_kit_id` | ref(Kit) | C | Snapshot. Required when the component has an origin kit. | Kit lineage at the time. |
| `vehicle_id` | ref(Vehicle) | R | | Car. |
| `event_kind` | enum | R | `installation` or `removal`. | |
| `vehicle_position` | string | C | Required for `wheel_stud_set`. Must match a configured position code. The code list is UNKNOWN. | Position on the car. |
| `occurred_at` | timestamp | R | Server commit time. | When the record committed. |
| `lap_reading` | integer | C | Snapshot from the transaction. Required when the parent is a `replacement` and the approved rule uses laps. Null on `removal_without_install` means not recorded, not zero. | Laps at the job. |
| `engine_hour_reading` | decimal | C | Snapshot from the transaction. Required when the parent is a `replacement` and the approved rule uses engine hours. Null on `removal_without_install` means not recorded, not zero. Scale UNKNOWN. | Engine hours at the job. |
| `removal_reason_code` | enum | C | Required when `event_kind` is `removal`. `failure` or `other`. | Why it came off. |
| `removal_reason_detail` | text | C | Required when `event_kind` is `removal`. Non-empty. | Observed reason, in the technician's words. |
| `disposition` | enum | C | Required when `event_kind` is `removal`. Wheel studs: `scrapped` only. Owner decision, 2026-10-25. | What was done with the removed part. |
| `disposition_notes` | text | C | Required when `disposition` is `other`. | |
| `paired_event_id` | ref(ComponentEvent) | O | If set, the other side of a replacement: the removal pairs with the installation, or the reverse. | Links old and new component history. |
| `procedure_source` | string | C | Snapshot of the parent when the parent has one. Empty when no approved procedure was recorded. Do not invent a document title. | Procedure document. |
| `procedure_revision` | string | C | Required together with `procedure_source`. | Procedure revision. |
| `measurement_capture_ids` | list of id | R | Empty when the parent is `removal_without_install` or `opening_identification`, or when no approved rule requires measurements. A `replacement` that omits captures a verified rule requires fails validation. Do not invent torque or limit values. Captures live on the parent transaction. | Measurements for this component. |
| `inspection_capture_ids` | list of id | R | Same emptiness rule as `measurement_capture_ids`. | Inspections for this component. |
| `technician_user_id` | ref(user) | R | Snapshot of the actor who committed the job. | Technician. |
| `notes` | text | O | | |

Measurements and inspection results are the structured captures on the parent transaction (section 7.19). The required set is UNKNOWN until the rule exists. Missing captures that the rule requires fail the commit.

Old and new component ids are the `component_id` values on the paired removal and installation events of one replacement transaction.

### 7.7 `FailureEvidence`

Captured when a removal reason is `failure`, including a snapped stud. The minimum set of photos or measurements beyond a non-empty capture is UNKNOWN.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `evidence_id` | id | R | Immutable, unique. | |
| `component_event_id` | ref(ComponentEvent) | R | The removal event. | What the evidence belongs to. |
| `kind` | enum | R | See [6.6](#66-other-enumerations). | Kind of evidence. |
| `storage_reference` | string | R | Non-empty locator in whatever blob store Phase 1 uses. This spec does not choose the store. | Where the bytes live. |
| `content_hash` | string | O | | Integrity check, if the implementation computes one. |
| `description` | text | R | Non-empty. What was observed. Not a guessed metallurgical cause. | |
| `captured_at` | timestamp | R | | |
| `captured_by` | ref(user) | R | | |

A `removal` with `removal_reason_code = failure` is invalid unless it references at least one `FailureEvidence` row, committed in the same transaction as the removal. Evidence rows are retained with the event. How long binary bytes are kept is UNKNOWN; the metadata row is part of permanent history.

### 7.8 `StockMovement`

Append-only ledger. Rows are never updated and never deleted. A mistake is a new movement.

On-hand is the fold of committed movements, checked against kit and component projections in the same commit. There is no editable on-hand column.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `movement_id` | id | R | Immutable, unique. | |
| `idempotency_key` | string | R | Unique among movements. See [9.4](#94-idempotency). | Replay key. |
| `movement_type` | enum | R | See [6.5](#65-movement-type). | |
| `catalog_item_id` | ref(CatalogItem) | R | | Part type affected. |
| `kit_id` | ref(Kit) | C | Required for `sealed_kit` catalog items. | The set affected. One kit per movement. |
| `component_id` | ref(Component) | C | Required when the movement issues, holds, scraps, or returns an individually tracked piece. | The physical piece. |
| `sealed_set_delta` | integer | R | Wheel-stud values are -1, 0, or +1. The full mapping is in [9.3](#93-movement-rules). Summed across committed movements, these deltas equal the number of kits currently in `sealed`. | Change in complete sealed sets that are available to open. |
| `loose_piece_delta` | integer | R | Wheel-stud `open` is +5. Other wheel-stud mappings are in [9.3](#93-movement-rules). Summed across committed movements, these deltas equal available loose pieces, before reservations. | Change in available loose remainder. |
| `actor_user_id` | ref(user) | R | Authenticated server principal. | Who. |
| `occurred_at` | timestamp | R | Server commit time. | When. |
| `client_observed_at` | timestamp | O | Present when a future offline client observed the action. Not authoritative over `occurred_at`. | Client clock, for later sync. |
| `reason_code` | string | R | Non-empty. `failure` is reserved for consistency with removals; other codes are team text until a taxonomy exists (UNKNOWN). | Why, short code. |
| `reason_text` | text | R | Non-empty. | Why, in words. |
| `maintenance_transaction_id` | ref(MaintenanceTransaction) | C | Required when `movement_type` is `consume`. Must be null for `adjust`. | Job that consumed the part. |
| `receipt_id` | ref(Receipt) | C | Required when `movement_type` is `receive`. | Receipt. |
| `reservation_id` | ref(StockReservation) | O | Set when this consume draws a reservation. | |
| `exception_id` | ref(AuthorizedStockException) | C | Required when this movement's fold would make any on-hand count negative. Otherwise null. | The recorded exception. |
| `related_movement_id` | ref(StockMovement) | O | Prior movement this one compensates or reverses. The prior row stays. | Link for corrections. |
| `location_id` | ref(Location) | O | Location after the movement, if it changed. | |
| `return_destination` | enum | C | Required when `movement_type` is `return`. `supplier` or `stock_hold`. | Where a return goes. |

Who, when, and why are `actor_user_id`, `occurred_at`, and `reason_code` plus `reason_text`. All four are required on every movement, including `open` and `quarantine`.

`consume` is the only movement type that puts a part into service. It exists only on a committed replacement transaction. `adjust` does not install a part and does not reset a baseline.

### 7.9 `IdempotencyRecord`

Observable replay contract. Phase 1 may store it in this shape or another, as long as the behavior in [9.4](#94-idempotency) holds.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `idempotency_key` | string | R | Unique inside `scope`. | Client-generated stable key. |
| `scope` | enum | R | See [6.6](#66-other-enumerations). | Which operation family. |
| `request_hash` | string | R | Hash of the canonical request payload. Algorithm is an implementation choice. | Detects a reused key with a different body. |
| `status` | enum | R | `in_flight`, `committed`, `rejected`. | |
| `result_ref` | id | C | Required when `status` is `committed` or `rejected`. | Transaction, movement, or receipt returned. |
| `actor_user_id` | ref(user) | R | | |
| `created_at` | timestamp | R | | |

### 7.10 `AuthorizedStockException`

The only way any derived on-hand count may go negative. The exception is an explicit record. A missing row, a bug, or a race is not an exception.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `exception_id` | id | R | Immutable, unique. | |
| `catalog_item_id` | ref(CatalogItem) | R | | Item the deficit applies to. |
| `kit_id` | ref(Kit) | O | When set, the deficit is limited to this kit. | |
| `component_id` | ref(Component) | O | When set, the deficit is limited to this component. | |
| `deficit_quantity` | integer | R | Positive. The maximum shortfall this record authorizes. The number is entered for that incident. This spec states no standing deficit. | How far below zero this one movement may go. |
| `deficit_unit` | enum | R | `sealed_set` or `piece`. Must match the count that would go negative. | |
| `reason` | text | R | Non-empty. | Why the team is allowing the shortfall. |
| `safety_critical_acknowledgment` | boolean | C | Required and must be true when the catalog item is `safety_critical`. Acknowledges the record. Does not certify the car. | |
| `authorized_by` | ref(user) | R | An admin actor. A race-day actor cannot create this row. | Who authorized it. |
| `authorized_at` | timestamp | R | | |
| `status` | enum | R | `authorized`, `consumed`, `revoked`. | |
| `consumed_by_movement_id` | ref(StockMovement) | C | Required when `status` is `consumed`. One exception authorizes one movement. | |
| `maintenance_transaction_id` | ref(MaintenanceTransaction) | O | Set when the movement is part of a replacement. | |
| `revoked_by` | ref(user) | C | Required when `status` is `revoked`. | |
| `revoked_at` | timestamp | C | Required when `status` is `revoked`. | |
| `revoke_reason` | text | C | Required when `status` is `revoked`. | |

Lifecycle: an admin writes `authorized` before or inside the same commit as the movement. The movement references it. The same commit sets `consumed`. A second movement cannot reuse it. Revoke is allowed only from `authorized`, before use. There is no default lifetime and no numeric expiry in this spec. Unused means still `authorized` until revoked.

Wheel studs: an exception cannot authorize a negative wheel-stud count. **default, adjustable by team policy.** Until a later policy changes it, Race Backend rejects the exception and rejects the movement. Owner-side strict default, 2026-10-25. There is no standing overdraft.

For any other catalog item, the path above is the only way below zero. Race Backend does not invent a standing negative allowance.

### 7.11 `ReorderPolicy`

One active policy per catalog item. For `sealed_kit` items, quantities are **whole sealed sets**, not loose pieces.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `reorder_policy_id` | id | R | Immutable, unique. | |
| `catalog_item_id` | ref(CatalogItem) | R | Unique among policies. | |
| `min_stock_sets` | integer | O | Null until the team sets it. If set, must be >= 0. No generic default. The wheel-stud item does not get a separate minimum: the owner set a target and an inclusive warning threshold instead. | Minimum complete sealed sets, when the team defines one. |
| `desired_stock_sets` | integer | O | Null until set. If both min and desired are set, desired >= min. Wheel-stud item: 4. That 4 is the pre-event target, one spare sealed set per wheel. Owner decision, 2026-10-25. Not a default for other items. | Desired complete sealed sets. |
| `warning_threshold_sets` | integer | O | Null until set. Wheel-stud item: 4. Compared inclusively: warn when sealed sets on hand are less than or equal to this threshold. | Reorder warning threshold in whole sealed sets. |
| `notes` | text | O | | Policy source in the team's words. |
| `updated_at` | timestamp | R | | |
| `updated_by` | ref(user) | R | Admin. | |

Loose and opened remainder is reported beside the policy and is not added to `desired_stock_sets` or `warning_threshold_sets`. Owner decision, 2026-10-25: loose and opened wheel studs never count toward the spare target or the warning.

For the wheel-stud item the policy is complete with `desired_stock_sets = 4` and `warning_threshold_sets = 4`. `min_stock_sets` stays null. Null on some other catalog item's desired or warning threshold means that item's policy is incomplete. Incomplete is not an all-clear.

Because the wheel-stud threshold equals the target, the warning is active at 4 sealed sets on hand and at every count below 4. It is not active only when the count is under 4. Do not "correct" that to a strict less-than. Owner decision, 2026-10-25.

Reorder numbers for catalog items other than the wheel-stud item are UNKNOWN.

### 7.12 `StockReservation`

Stock held for a planned event. Still on hand. Not available for a different event. Not a consume, and not a baseline change.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `reservation_id` | id | R | Immutable, unique. | |
| `catalog_item_id` | ref(CatalogItem) | R | | |
| `event_id` | ref(PlannedEvent) | R | | Event the stock is held for. |
| `kit_id` | ref(Kit) | O | When set, this reservation holds that specific sealed kit, and `quantity_sealed_sets` must be 1. | Specific set, optional. |
| `quantity_sealed_sets` | integer | C | Required for `sealed_kit` items. Whole sets. >= 0. No default. Mutually exclusive with a piece reservation: a row reserves sets or loose pieces, not a silent mix of both. | Complete sets held. |
| `quantity_pieces` | integer | O | Loose pieces only. >= 0. Does not count as sealed sets. | Loose remainder held. |
| `status` | enum | R | `active`, `released`, `consumed`, `cancelled`. | |
| `reserved_by` | ref(user) | R | | |
| `reserved_at` | timestamp | R | | |
| `released_at` | timestamp | O | | |
| `maintenance_transaction_id` | ref(MaintenanceTransaction) | C | Required when `status` is `consumed`. | Job that used the hold. |
| `notes` | text | O | | |

Creating a reservation that would make reserved sealed sets exceed `sealed_set_count`, or reserved pieces exceed loose available pieces, is rejected. Nothing is partially reserved.

Passing the event date does not release a reservation. Release is an explicit `released` or `cancelled` write, or `consumed` inside the replacement commit.

### 7.13 `Supplier`

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `supplier_id` | id | R | Immutable, unique. | |
| `name` | string | R | Non-empty. No supplier is named in this spec. | |
| `contact` | text | O | | Whatever contact detail the team stores. |
| `status` | enum | R | `active` or `inactive`. | |
| `lead_time_text` | string | R | Admin-editable. New rows start as `a few days`. Owner decision, 2026-10-25. Free text. Forecasts must not parse it into a number of days. | Lead time in the team's words. |
| `nominal_lead_time_days` | integer | O | Null means UNKNOWN. Must not default to 0. Must not be derived from `lead_time_text`. A stored number exists only after an admin enters one. | Numeric lead time in days, when an admin has entered one. |
| `notes` | text | O | | |
| `created_at` | timestamp | R | | |
| `created_by` | ref(user) | R | | |

### 7.14 `PurchaseNote`

A note is not stock and not a receipt.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `note_id` | id | R | Immutable, unique. | |
| `supplier_id` | ref(Supplier) | O | May be empty if the supplier is not chosen yet. | |
| `catalog_item_id` | ref(CatalogItem) | O | | Part the note is about, if known. |
| `body` | text | R | Non-empty. | The note. |
| `status` | enum | R | `open`, `promoted`, `closed`. | |
| `promoted_purchase_order_id` | ref(PurchaseOrder) | C | Required when `status` is `promoted`. | Order created from the note. |
| `created_at` | timestamp | R | | |
| `created_by` | ref(user) | R | | |
| `closed_at` | timestamp | O | | |

Promoting a note creates a `draft` purchase order. It does not receive kits.

### 7.15 `PurchaseOrder`

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `purchase_order_id` | id | R | Immutable, unique. | |
| `supplier_id` | ref(Supplier) | R | Supplier must be `active` when the order moves to `ordered`. | |
| `status` | enum | R | See below. | |
| `external_reference` | string | O | | Supplier's own order number, if they have one. |
| `ordered_at` | timestamp | C | Required when status has reached `ordered`. | |
| `expected_receipt_date` | date | O | Null means unknown. Not computed from an invented lead time. | When the team expects the shipment. |
| `notes` | text | O | | |
| `created_at` | timestamp | R | | |
| `created_by` | ref(user) | R | | |

Status transitions:

| From | To |
| --- | --- |
| `draft` | `ordered`, `cancelled` |
| `ordered` | `partially_received`, `received`, `cancelled` |
| `partially_received` | `received`, `cancelled` |
| `received` | (terminal) |
| `cancelled` | (terminal) |

`cancelled` after any committed receipt does not delete kits or receipt rows. Cancellation stops further receipts. Already received kits stay in stock with their history.

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> ordered
  draft --> cancelled
  ordered --> partially_received
  ordered --> received
  ordered --> cancelled
  partially_received --> received
  partially_received --> cancelled
  received --> [*]
  cancelled --> [*]
```

### 7.16 `PurchaseOrderLine`

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `line_id` | id | R | Immutable, unique. | |
| `purchase_order_id` | ref(PurchaseOrder) | R | | |
| `catalog_item_id` | ref(CatalogItem) | R | Must be `approved` before the parent order is `ordered`. | |
| `quantity_ordered` | integer | R | Positive. For `sealed_kit`, this is a count of whole kits. The value is whatever the team orders. No default. | |
| `lead_time_days_override` | integer | O | Null means use the supplier's numeric lead time if an admin entered one. If that is also null, numeric lead time is UNKNOWN. Do not parse `lead_time_text`. Must not default to 0. | Line-specific lead time in days. |
| `expected_receipt_date` | date | O | Overrides the order date when set. | |
| `notes` | text | O | | |

`quantity_received` is derived: the count of kits created by committed receipts against this line. It is not edited by hand. Order status is derived from its lines:

- All lines zero received, and the order was `ordered`: stay `ordered`.
- Some but not all ordered quantity received: `partially_received`.
- Every line fully received: `received`.

A receipt that would make `quantity_received` greater than `quantity_ordered` is rejected. Over-receipt policy is UNKNOWN, so the conservative rule is to refuse the extra kits until the team records a policy. Refusal leaves the prior receipts intact.

### 7.17 `Receipt`

Receiving creates stock. It does not consume stock and does not touch a service baseline.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `receipt_id` | id | R | Immutable, unique. | |
| `idempotency_key` | string | R | Unique among receipts. | |
| `purchase_order_line_id` | ref(PurchaseOrderLine) | O | When set, the parent order must be `ordered` or `partially_received`. | |
| `supplier_id` | ref(Supplier) | R | Required even for a receipt that has no purchase order. | |
| `catalog_item_id` | ref(CatalogItem) | R | `approved`. | |
| `kit_count` | integer | R | Positive. For wheel studs, the number of new kit ids to create, not a piece count. | How many sealed sets arrived. |
| `received_by` | ref(user) | R | | |
| `received_at` | timestamp | R | Server time. | |
| `notes` | text | C | Required when `purchase_order_line_id` is empty. | Why this arrived without an order line. |

Atomic receipt: either every new kit row and its `receive` movement commit, or none of them do. Replaying the receipt idempotency key returns the original kits and does not create a second set of ids.

Each new wheel-stud kit:

- gets a new `kit_id`
- `state = sealed`
- `nominal_contents_count = 5`
- has its own `receive` movement with `sealed_set_delta = +1` and `loose_piece_delta = 0`
- has no component rows yet

One receipt of several sets is several kit ids. It is not one kit id with a quantity.

### 7.18 `PlannedEvent`

Minimum event fields inventory, reservations, and forecasting read. An event-prep specification may add fields. This file does not list real events.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `event_id` | id | R | Immutable, unique. | |
| `name` | string | R | Non-empty. | |
| `status` | enum | R | `planned`, `cancelled`, `completed`. | |
| `start_on` | date | O | Null means undated. Lead-time math cannot treat it as imminent or as far away. | |
| `end_on` | date | O | | |
| `expected_laps` | integer | O | Null means UNKNOWN. Must not be treated as zero laps. | Team's planning figure. |
| `expected_engine_hours` | decimal | O | Null means UNKNOWN. Must not be treated as zero. | Team's planning figure. |
| `notes` | text | O | | |

### 7.19 `MaintenanceTransaction`

Contract surface for the atomic replacement. The maintenance-rule entity itself is outside this document. `rule_id` is a stable id owned with that model. Interval magnitudes on the rule are UNKNOWN. Race Backend still has to read them when they exist, and must refuse a baseline reset when they do not.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `transaction_id` | id | R | Immutable, unique. | |
| `idempotency_key` | string | R | Unique among maintenance transactions. | Key for the whole bundle. |
| `kind` | enum | R | `replacement`, `inspection`, `removal_without_install`, or `opening_identification`. | |
| `status` | enum | R | `draft`, `committed`, `rejected`. | |
| `rule_id` | ref(rule) | C | Required for a `replacement` that writes a `ServiceBaseline`. The rule must be approved and its interval must come from a verified source. A draft rule cannot reset a baseline. Not required for a wheel-stud hub replacement while the interval is UNKNOWN. Not required for `removal_without_install` or `opening_identification`. | Service rule being satisfied, when a verified interval exists. |
| `vehicle_id` | ref(Vehicle) | R | | |
| `event_id` | ref(PlannedEvent) | O | | Event context, if any. |
| `procedure_source` | string | C | Required on a `replacement` only when an approved procedure exists. Optional for `inspection`, `removal_without_install`, and `opening_identification`. Empty means no procedure was recorded, not a placeholder title. | |
| `procedure_revision` | string | C | Required together with `procedure_source`. | |
| `lap_reading` | integer | C | Required to commit a `replacement` when the rule uses laps. On `removal_without_install`, null means the reading was not recorded. Null is not zero. | |
| `engine_hour_reading` | decimal | C | Required to commit a `replacement` when the rule uses engine hours. On `removal_without_install`, null means not recorded, not zero. Scale UNKNOWN. | |
| `technician_user_id` | ref(user) | R | | |
| `rejection_reason` | text | C | Required when `status` is `rejected`. | Validation failure. Not a stud failure mode. |
| `committed_at` | timestamp | C | Required when `status` is `committed`. Server time. | |
| `created_at` | timestamp | R | | |

Nested captures, stored with the transaction and referenced from events. Field names are the contract; physical table layout is Phase 1's choice.

`SignOff`:

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `signoff_id` | id | R | | |
| `slot_id` | string | R | Matches a required slot on the approved rule. Slot names are UNKNOWN. | What was signed. |
| `user_id` | ref(user) | R | | Who signed. |
| `signed_at` | timestamp | R | | |

`MeasurementCapture`:

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `measurement_id` | id | R | | |
| `definition_id` | string | R | From the rule. Definitions and limits are UNKNOWN. | Which measurement. |
| `value` | string | R | Recorded observation. This spec supplies no numeric limit and no unit system. | |
| `unit` | string | O | The unit the technician recorded. | |
| `result` | string | R | The rule's result vocabulary. UNKNOWN until the rule exists. | Pass, fail, or other rule-defined result. |

`InspectionCapture`:

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `inspection_id` | id | R | | |
| `definition_id` | string | R | From the rule. | |
| `result` | string | R | Recorded result. | |
| `notes` | text | O | | |

A `draft` may be stored. A draft MUST NOT write `StockMovement`, `ComponentEvent`, kit state changes, or `ServiceBaseline`.

A `rejected` row MAY be stored so the failure is visible. It MUST NOT write those effects either.

An `inspection` commit MAY store inspection captures, defects, and notes. It MUST NOT write `consume` movements and MUST NOT write `ServiceBaseline`.

### 7.20 `ServiceBaseline`

The current service baseline for a rule and position is the latest committed row. Rows are append-only. Interval length is not stored here; it lives on the approved rule, and the value is UNKNOWN.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `baseline_id` | id | R | Immutable, unique. | |
| `rule_id` | ref(rule) | R | | |
| `vehicle_id` | ref(Vehicle) | R | | |
| `vehicle_position` | string | C | Required when the rule is positional, including wheel studs. | |
| `maintenance_transaction_id` | ref(MaintenanceTransaction) | R | A `committed` replacement. | Job that set this baseline. |
| `lap_reading` | integer | C | Copied from that transaction when the rule uses laps. | |
| `engine_hour_reading` | decimal | C | Copied from that transaction when the rule uses hours. | |
| `completed_at` | timestamp | R | Same commit time as the transaction. | |
| `supersedes_baseline_id` | ref(ServiceBaseline) | O | The previous current row, if one existed. The previous row remains. | |

Opening a screen, failing validation, or crashing before commit does not insert a baseline row.

### 7.21 `AuditEvent`

Ledger rows and component events are already immutable history. This entity covers edits to policy and master data: catalog, reorder policy, supplier, purchase documents, reservation, exception, quarantine release, and sign-off.

| Field | Type | Req | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `audit_id` | id | R | Immutable, unique. | |
| `entity_type` | string | R | | |
| `entity_id` | id | R | | |
| `action` | string | R | | What changed. |
| `actor_user_id` | ref(user) | R | | |
| `at` | timestamp | R | | |
| `reason` | text | O | Required for exception, quarantine, and adjust paths; those also store reason on their own rows. | |
| `prior_values` | text | O | Prior field values. Encoding is an implementation choice. | |
| `new_values` | text | O | New field values. | |

Audit rows are append-only.

## 8. Sealed sets of five

### 8.1 Counting

For each wheel-stud catalog item, report these derived counts separately:

| Count | Definition |
| --- | --- |
| Complete sealed sets on hand | Kits in `state = sealed`. This is the count the reorder warning uses. |
| Loose / opened remainder | Must stay zero for a valid wheel-stud history. If a row is ever in `opened` or `partially_used`, those pieces are reported here and are not installable. |
| Quarantined sealed sets | Kits in `quarantined` whose `quarantine_from_state` is `sealed`. Not spares. Not part of the warning count. |
| Depleted kits | Retained for history. Contribute zero to on-hand. |
| Returned kits | Not on hand. |

Complete sealed sets and any stray loose pieces are never collapsed into one stud count. Loose pieces are not a sealed set and do not count toward the 4-set target.

Reserved sealed sets are still inside the on-hand sealed count. Availability for a different event subtracts reservations (section 9.2). The reorder warning uses sealed sets on hand, not the reservation-net figure, and it still ignores loose studs.

### 8.2 Opening and hub replacement

Owner decision, 2026-10-25. For `wheel_stud_set`, the only install path is one complete sealed set on one hub.

A hub is the `vehicle_position` on the replacement. The spare plan is four wheels, one spare set each. The position code strings are still UNKNOWN. Until an admin configures them, a wheel-stud replacement fails closed. That failure has no stock effect.

Validation invariant, checked before any effect, for every hub on the transaction:

- The hub installs exactly five studs.
- All five come from one `kit_id`.
- That kit is `sealed` at the start of the commit.
- The same commit opens the kit and consumes all five studs onto that hub.
- The kit's end state is `depleted`.
- No stud from another kit is installed on that hub.
- No stud already loose, opened, partially used, scrapped, or `history_unknown` is installed as one of the five.
- Every stud already recorded as installed on that hub is removed in the same commit and scrapped. The commit does not invent removals for studs that were never recorded.
- After the commit, the studs installed on that hub are exactly those five, all from that one kit.

If any hub fails any of these checks, Race Backend rejects the whole transaction. Nothing is opened, consumed, scrapped, or baselined.

A transaction may name more than one hub. Each hub must pass on its own sealed set. One failing hub rejects the bundle.

Allowed wheel-stud kit transitions:

| From | To | When |
| --- | --- | --- |
| (none) | `sealed` | `receive` |
| `sealed` | `depleted` | Hub replacement: `open` and `consume` of all five in one commit. Readers never see a resting `opened` state. |
| `sealed` | `depleted` | Admin scraps the whole sealed set in one commit. Nothing is installed. No baseline. All five components end `scrapped`. |
| `sealed` | `quarantined` | Kit-level quarantine. The seal stays intact in the record. |
| `sealed` | `returned` | Intact return to the supplier. |
| `quarantined` | `sealed` | `release_quarantine` only when `quarantine_from_state` is `sealed`. |
| `depleted` | (none) | Terminal. |
| `returned` | (none) | Terminal. |

```mermaid
stateDiagram-v2
  [*] --> sealed: receive
  sealed --> depleted: replacement consumes all five
  sealed --> depleted: admin scraps the whole set
  sealed --> quarantined: quarantine sealed
  sealed --> returned: return intact
  quarantined --> sealed: release
  depleted --> [*]
  returned --> [*]
```

There is no wheel-stud transition to a resting `opened` or `partially_used` state. A standalone `open` is rejected. Pre-staging a set by breaking the seal is rejected, because the remainder could not be installed and the set would no longer be a spare. Open happens only inside the replacement commit that also consumes all five, or inside the admin whole-set scrap commit.

Inside a successful replacement commit the ledger still contains both movements, so the fold conserves pieces:

- `open`: `sealed_set_delta = -1`, `loose_piece_delta = +5`, and five `Component` rows are created with this `origin_kit_id`.
- `consume`: `loose_piece_delta = -5`, and those five components become `installed`.
- End state `depleted`. Net loose change is 0. Sealed on-hand drops by one set.

If individual marks are present, they are recorded. If they are absent, `identity_source` is `team_assigned` and `manufacturer_mark` stays empty. Do not invent a manufacturer serial. `ARP` is the brand on the catalog item, not a mark on a stud.

Rollback of a failed replacement leaves the kit `sealed`: no open, no component rows, no consume.

### 8.3 No partial use and no installable remainder

Partial-set replacement on a hub is not allowed. Owner decision, 2026-10-25.

Rejected with no stock effect:

- Installing fewer or more than five studs on a hub.
- Installing from a kit that is not `sealed` at the start of the commit.
- Consuming `k` other than 5 from a wheel-stud kit for an installation.
- Leaving any stud from that kit uninstalled while installing the others.
- Installing a leftover stud from an earlier kit.
- Building a hub from loose studs, including five loose studs.
- A negative-stock exception used to force a short set onto a hub.

A wheel-stud kit does not have an installable remainder. `partially_used` is not a valid end state for this profile. The general partial-use transitions in [6.3](#63-allowed-kit-transitions) are for other sealed kits only, and those other kits are still UNKNOWN. They must not be used to install wheel studs.

If a sealed set is damaged and will not be installed, an admin quarantines it or scraps the whole set. That scrap installs nothing and writes no service baseline. It must not leave loose studs that a later job could treat as a partial set.

### 8.4 Mixing

Sets are never mixed on one hub. Owner decision, 2026-10-25. This is not waiting on a later policy.

Forbidden, and rejected with no stock effect:

- Two or more `origin_kit_id` values on the studs installed on one hub in a commit.
- Installing any new stud on a hub that still has a recorded stud from another kit, or a `history_unknown` stud, unless that same commit removes and scraps every previously recorded stud on the hub.
- Clearing or rewriting `origin_kit_id`.
- Creating a kit whose pieces come from other kits' leftovers.
- A consume that draws "loose studs" as a bin without five component ids from one sealed kit.
- Installing a wheel-stud component whose origin kit is missing, except the separate `opening_identification` record, which does not install from stock.
- Any screen or import that shows one quantity where distinct kit ids used to be.

There is no future switch in this spec that allows an explicit multi-kit hub.

### 8.5 Removal, failure, and evidence

A removal event requires `removal_reason_code` and `removal_reason_detail`.

Owner decision, 2026-10-25:

- Disposition is `scrapped`.
- Component status becomes `scrapped`.
- That status is terminal. No install, no return to a kit, no `held` state that could later be installed.
- `origin_kit_id` is unchanged when the stud had one. A `history_unknown` stud stays without an invented kit.
- The removal does not increment loose stock.

When the reason code is `failure`, at least one `FailureEvidence` row is in the same commit. The evidence requirement beyond that one capture is still UNKNOWN. The new studs on a replacement, if the job is a replacement, still have to be one complete sealed set on that hub.

A removal that does not install the new set is `kind = removal_without_install`. It scraps the named studs and does not consume a sealed set and does not reset a baseline. It also does not authorize a later one-stud fill-in. The next replacement on that hub still has to scrap every stud still recorded there and install one new sealed set of five.

Inspections that do not remove or install a stud are `kind = inspection`. See [11.6](#116-records-that-are-not-a-replacement).

## 9. Ledger and on-hand

### 9.1 Source of truth

Committed `StockMovement` rows are the source of truth for quantities. Kit `state` and component `status` are projections updated in the same commit. After every commit, the projections must match a fold of the ledger. If they do not, that is a defect; the fold wins and the write must not have been considered successful.

Readers see the state before a commit or the state after it. They never see an `open` without its paired `consume` when those were submitted as one replacement, and they never see a baseline without its movements.

### 9.2 Fold

The normative fold for a wheel-stud catalog item replays committed movements per kit, in commit order. Catalog totals are the sums of those per-kit results. Reservations are applied after the fold. They are not movements.

Two checks must hold after every commit:

- The sum of `sealed_set_delta` equals the number of kits in `state = sealed`.
- The sum of `loose_piece_delta` equals available loose pieces, before reservations.

| Figure | Meaning |
| --- | --- |
| `sealed_set_count` | Kits in `sealed`. Complete sets available to open, before reservations. |
| `loose_piece_count` | Available pieces on kits in `opened` or `partially_used`. |
| `on_hand_sealed_sets` | `sealed_set_count` plus kits quarantined from `sealed`. Physical sealed sets still in team control, including held ones. |
| `available_sealed_sets` | `sealed_set_count` minus active reservations of sealed sets. |
| `available_loose_pieces` | `loose_piece_count` minus active reservations of loose pieces. |

Negative results are forbidden unless the movement that would cause them references a consumed `AuthorizedStockException` covering that figure and that unit.

Conservation for one wheel-stud kit, after every commit:

`nominal_contents_count = pieces still inside a sealed set + available loose pieces + quarantined pieces + consumed pieces + returned pieces + scrapped pieces`

A kit still in `sealed` has five pieces inside the seal and zeros in the other terms. `open` does not change the total. It moves those five into identified loose pieces. A kit-level quarantine of a sealed set leaves `loose_piece_delta` at 0. The replay counts that kit's five pieces as quarantined until release, which puts them back inside the seal. A later movement cannot make the accounted total greater than 5. A positive `adjust` is allowed only to reverse a prior `adjust` or `return` on pieces that are not installed, and only up to that prior quantity.

### 9.3 Movement rules

Deltas below are for `wheel_stud_set`. `a` means the kit's available loose pieces just before that movement. `k` means the number of component ids the movement names. Neither `a` nor `k` has a default.

| Type | Kit precondition | `sealed_set_delta` | `loose_piece_delta` | Links |
| --- | --- | --- | --- | --- |
| `receive` | New kit id. | +1 | 0 | `receipt_id`. No maintenance transaction. End state `sealed`. |
| `open` | `sealed`. | -1 | +5 | Reason required. Creates 5 component rows. End state `opened` unless the same commit also consumes. |
| `consume` | For wheel studs, only a kit this commit opens from `sealed`, with `k` = 5. Other sealed kits: already open in this commit, or already `opened` / `partially_used`. Not `quarantined`, `depleted`, or `returned`. | 0 | `-k` | `maintenance_transaction_id` required. Names `k` component ids. |
| `adjust` | Not `sealed`. Named components when a piece leaves or returns. | 0 | signed change in available loose pieces | `maintenance_transaction_id` null. Admin only. Cannot push the kit's accounted total above 5. |
| `return` | Intact `sealed` set, or named loose components. | -1 if the set is still `sealed`, otherwise 0 | 0 if still `sealed`, otherwise `-k` | `return_destination` required. |
| `quarantine` | Not `depleted` or `returned`. | -1 for a kit-level hold of a `sealed` set, otherwise 0 | 0 for a sealed hold; `-a` for a kit-level hold of the loose remainder; `-k` for named loose pieces | Reason required. Piece-level quarantine is allowed only after `open`. |
| `release_quarantine` | `quarantined`, or a piece-level hold being released. | +1 only when restoring `sealed`, otherwise 0 | restores the loose pieces that the matching quarantine removed from available, and only then | Admin only, until policy says otherwise. Restores `quarantine_from_state` for a kit-level hold. |

`consume` from a kit that this same commit opens uses two movements. The `open` carries the sealed and loose deltas above. The `consume` carries `-k` loose. Readers see only the end state.

For `wheel_stud_set`, `k` is 5, the kit starts `sealed`, and the end state is `depleted`. A consume from an already `opened` or `partially_used` wheel-stud kit is rejected. A wheel-stud `k` other than 5 is rejected. Neither case writes a movement.

An adjust that discards pieces records those components as `scrapped`. It is not a `consume` and must not look like an installation in reports. For non-wheel kits, when every remaining piece of an `opened` kit is quarantined, the kit state becomes `quarantined` and `quarantine_from_state` records `opened` or `partially_used`. That remainder path is not valid for `wheel_stud_set`. A wheel-stud quarantine holds a sealed set, with `quarantine_from_state = sealed`.

### 9.4 Idempotency

- Every receipt, stock movement, and maintenance transaction has an idempotency key.
- The same key and the same request hash, when the first attempt committed, return the original result and apply nothing again.
- The same key and the same request hash, when the first attempt rejected validation, return that rejection and apply nothing.
- The same key with a different request hash is a conflict. The client must use a new key. Nothing is applied.
- A crash that leaves the key `in_flight` resolves to one of two outcomes: the full bundle committed once, or no bundle effects exist. It must not commit twice and must not leave a half bundle.

The client supplies one idempotency key on the maintenance transaction. Race Backend derives each child movement key from that parent key and a stable sequence inside the bundle. Those derived keys are not a second entry point. Replaying the parent returns the same movement ids. A child key cannot commit on its own.

### 9.5 Concurrency

Two commits that touch the same kit, the same component, the same reservation, or the same baseline behave as if they ran one after the other. The second sees the first's result. If the second would drive stock negative without an exception, or would install a component the first already took, the second fails validation and persists no effects.

A stale client must not overwrite a newer kit state, reorder policy, or approved rule. Conflict handling for offline sync is out of scope beyond this invariant: the server refuses the stale write, and the refusal is visible.

### 9.6 Negative stock

Before commit, Race Backend computes the fold as if the movements were applied.

- If every affected figure stays >= 0, no exception is allowed on those movements (`exception_id` null).
- Wheel studs: if any wheel-stud figure would go below 0, the commit fails. An `AuthorizedStockException` is not accepted for that profile. **default, adjustable by team policy.**
- Any other catalog item: if a figure would go below 0, the commit includes one `AuthorizedStockException` in status `authorized` whose scope, unit, and `deficit_quantity` cover that shortfall, and the same commit marks it `consumed`. If the shortfall is not covered, the commit fails.
- A failed commit leaves stock, kit state, component status, reservations, maintenance records, and baselines as they were.

Race-day users cannot authorize an exception. There is no implicit overdraft.

## 10. Reorder and event holds

### 10.1 Signals

Signals are computed from current derived stock, the reorder policy, active reservations, inbound orders, and planned events. They are not a stored quantity the user edits. Caching is allowed if it is recomputed from those inputs.

For the wheel-stud catalog item the reorder warning is Owner decision, 2026-10-25:

| Signal | When |
| --- | --- |
| `reorder_warning` | Sealed sets on hand (`state = sealed`) are less than or equal to `warning_threshold_sets`. That threshold is 4. The warning is on at 4 and at every lower count. Loose, opened, and quarantined sets do not add to the count. |
| `at_or_below_target` | The same comparison. `desired_stock_sets` is also 4. Equality with the target does not clear the warning. |
| `reorder_policy_unknown` | Used for other catalog items when desired or warning threshold is null. Not the steady state of the wheel-stud item. |
| `early_warning` | A future `planned` event exists, and the order-by situation below says the team may already be late or cannot tell. |
| `demand_unknown` | That event has no reservation and no verified expected consumption. The signal says the demand is unknown. It does not say stock is sufficient. |

The stock warning does not need a lead time. It is true or false from the sealed-set count alone.

Timing against an event uses only a numeric lead time an admin entered (`lead_time_days_override`, else `nominal_lead_time_days`). The phrase `a few days` is displayed as words. It is not a number of days, and it does not make the timing check succeed or fail by itself.

- Need is the event's active `quantity_sealed_sets` reservation when one exists.
- When no reservation exists, need is the forecasted sealed-set consumption for that event, but only when that forecast has a verified input. A hub replacement consumes one sealed set. How often that job comes due is UNKNOWN pending `docs/research/wheel-studs.md`. Otherwise the signal is `demand_unknown`.
- Inbound quantity counts as expected in time only for kits on order lines whose `expected_receipt_date` is on or before the event `start_on`. Ordered kits with no expected date stay inbound-unknown. They are not on-hand and are not installable.
- If the event has no `start_on`, or numeric lead time is null, the timing warning says the timing cannot be checked. It does not assume the order will arrive, and it does not assume a lead time of zero days or of "a few" days.
- If timing can be checked, `early_warning` is raised when `start_on` minus the numeric lead time is on or before today and projected sealed sets for that event are below need. Projected sealed sets are `available_sealed_sets` plus inbound expected in time. Loose pieces are listed next to the signal and are not added in.

`reorder_warning` can be true with no event on the calendar. It is on whenever sealed sets on hand are 4 or fewer, which includes the target itself.

These signals do not create purchase orders. An admin writes an order as its own act.

### 10.2 What a race-day user may do

A race-day user may submit a hub replacement that opens and consumes one sealed set through the atomic path. A race-day user must not change reorder policy, authorize a negative exception, post an `adjust`, open a set without consuming all five, or edit an approved catalog item or rule.

## 11. Atomic replacement

This section is the contract Race Backend implements. It is not an implementation.

### 11.1 What commits together

A successful `replacement` persists one bundle:

1. `MaintenanceTransaction` with `status = committed`.
2. `ComponentEvent` rows for each removal and each installation, including snapshots.
3. `FailureEvidence` rows required by failure removals.
4. `StockMovement` rows: `open` when a sealed kit is entered in this same job, and `consume` for each piece installed.
5. Kit `state` and component `status` projections matching those movements.
6. `ServiceBaseline` row for each rule and hub the replacement completes, and only when that rule's interval is already verified. A wheel-stud replacement with an unknown interval omits this row and does not claim a reset.
7. Reservation update to `consumed` when the job draws a hold.
8. `AuthorizedStockException` transition to `consumed` only for a non-stud item that used the exception path. Wheel-stud commits do not include one.
9. Audit rows for the commit.

The maintenance record, the stock movements, and the service baseline are one commit. Either the whole bundle is durable, or none of its effects are.

```mermaid
sequenceDiagram
  participant Client
  participant RaceBackend
  participant Store
  Client->>RaceBackend: Submit replacement with idempotency key
  RaceBackend->>RaceBackend: Validate identity, rule, readings, captures, sign-offs, stock
  alt Validation fails
    RaceBackend-->>Client: Rejected, no effects
    Note over Store: No consume, no open, no baseline
  else Validation passes
    RaceBackend->>Store: Commit bundle atomically
    alt Store commit fails
      Store-->>RaceBackend: Rollback
      RaceBackend-->>Client: No effects
    else Store commit succeeds
      Store-->>RaceBackend: Bundle durable
      RaceBackend-->>Client: Committed result
    end
  end
```

### 11.2 Validation before any effect

Race Backend checks all of the following before any bundle write is visible. Failure at any step rejects the commit. Stock is not consumed. Intervals are not reset. Kits stay in their previous state.

Steps 4 through 10 are the wheel-stud hub invariant. A replacement of some other catalog item does not use the five-stud rule. Its install quantity is still UNKNOWN, and it must not borrow 5 from the wheel-stud decision.

1. The actor is authenticated, and server-side authorization allows this actor to complete maintenance. The actor is not changing the service rule, the reorder policy, or the catalog as part of this request.
2. The idempotency key is present. If it already committed, return the original result and stop. If it is in flight, do not start a second bundle.
3. `kind` is `replacement`. `inspection`, `removal_without_install`, and `opening_identification` follow [11.6](#116-records-that-are-not-a-replacement) and stop before any consume or baseline write.
4. For a wheel-stud hub, the [8.2](#82-opening-and-hub-replacement) invariant passes: exactly five studs, one sealed kit, that hub only, no mix, no partial set. This check does not depend on the service interval. If it fails, reject the commit with no stock effect.
5. Every stud already recorded on that hub is in the removal list and will be scrapped. Studs that were never recorded are not invented so the list will look complete.
6. The new studs' `catalog_item_id` is the `wheel_stud_set` item. A null `part_number` is allowed. Substitution of a different catalog item fails. Storing `ARP` as the part number fails.
7. The kit is not reserved to a different event. If this transaction names an event, the kit is either unreserved or reserved to that event.
8. The post-commit wheel-stud fold is non-negative. An `AuthorizedStockException` does not waive that. **default, adjustable by team policy.**
9. The hub's position code is in the configured list. If no hub codes are configured, the replacement fails closed. The code strings are still UNKNOWN. The spare count of 4 does not name them.
10. Every wheel-stud removal has reason code, detail, and disposition `scrapped`. Every `failure` removal has evidence in this same request.
11. Lap and engine-hour readings are stored when the team took them. They are independent. Race Backend must not convert laps into hours. Null means not recorded, not zero. The interval that would say the job was due is still UNKNOWN. See `docs/research/wheel-studs.md`. Do not copy an interval out of that file into this commit.
12. Torque, inspection limits, and measurement limits are not required by this spec and must not be invented. If an approved rule later names required captures or sign-off slots, those are required and a miss fails the commit. Until such a rule exists, their absence is unknown data, not a passed inspection.
13. A `ServiceBaseline` is written in this same commit only when the transaction cites an approved rule whose interval came from a verified source. While that interval is UNKNOWN, the commit has no baseline row. That is not an interval reset. The maintenance record and the stock movements still commit together or not at all.
14. Procedure source and revision are required when an approved procedure exists. They are not invented to fill the gap. Empty means no procedure was recorded.

Opening the form, clicking a button, or saving a draft fails none of these by itself and also completes none of them. Those actions are not a commit.

### 11.3 Failure and persistence

If validation fails, Race Backend may store the transaction as `rejected` with `rejection_reason`. That row is not a maintenance completion. It has no movements, no component events that install or remove parts, and no baseline.

If validation passes and the store then fails, the same absence of effects holds. Retry uses the idempotency rules.

A failed inspection discovered during the job is not half of a replacement. The team can record it as an `inspection` transaction or a defect. That record must be obviously not a completed replacement: no consume, no baseline. The defect text is only what was observed.

### 11.4 Baseline

The new `ServiceBaseline` row is written only inside a committed replacement that passed validation and cites an approved rule with a verified interval.

- It references that `transaction_id`.
- It copies the readings the rule uses.
- It becomes the current baseline for that rule and position.
- The prior baseline row stays in place, linked by `supersedes_baseline_id`.

The wheel-stud interval is not verified yet. It stays UNKNOWN pending `docs/research/wheel-studs.md`. Until a verified interval is adopted, a hub replacement does not append a baseline and does not claim the interval was reset. Stock is still consumed only when the hub invariant passes, and only together with the maintenance record.

If validation or persistence fails, the current baseline remains the previous one. No interval is reset. No set is opened.

An inspection does not append a baseline. A `removal_without_install` does not append a baseline. An `opening_identification` does not append a baseline.

A committed bundle is immutable. Undoing it is a new transaction with compensating movements and, when the team intends to change the baseline, a new baseline row. Race Backend does not delete the original consume or the original baseline. The procedure for correcting a wrong baseline is otherwise UNKNOWN; the inventory invariant is that history stays and effects are explicit.

### 11.5 What "nothing was consumed" means

After any failed replacement attempt, all of the following are true:

- No new `consume` or `open` movement is readable.
- No kit changed state.
- No component changed status.
- No reservation moved to `consumed`.
- No exception moved to `consumed`.
- No new current baseline exists.
- Sealed-set counts and loose remainder match the pre-attempt fold.

### 11.6 Records that are not a replacement

Two other committed kinds exist so a failure or a look-over is not stored as a finished replacement.

`inspection`:

- May store inspection captures, defects, and notes.
- Owns no installation or removal events.
- Writes no `StockMovement`.
- Writes no `ServiceBaseline`.

`removal_without_install`:

- Used when a stud comes off, including a snap, and this job does not install the replacement set.
- Writes the removal `ComponentEvent`, disposition `scrapped`, and `FailureEvidence` when the reason is `failure`.
- Sets that component's status to terminal `scrapped`. `origin_kit_id` stays as it was. It is not rewritten and not cleared to hide the kit.
- Writes no `consume`, no `open`, and no `ServiceBaseline`.
- Does not create a fictional new component or a fictional prior install.
- Readings may be null when they were not taken. Null is stored as unknown, not as zero.
- The removal, the evidence, and the status change commit together or not at all.
- This job is not permission to install fewer than five studs later.

`opening_identification`:

- Records studs already on the car when the system starts. Team default, 2026-10-25. Not a made-up history.
- Creates one `Component` per stud the team actually identifies. `history_unknown` is true. `origin_kit_id` is null. Status is `installed`. The hub code is required. If no hub codes are configured, this record fails closed, same as a replacement, and still must not invent a code or a history.
- `occurred_at` is the time of the observation, not a backdated install.
- Lap reading, engine-hour reading, procedure, kit id, part-number snapshot beyond the wheel-stud catalog item, and service baseline are null or absent. Null is unknown, not zero, and not "interval met."
- Does not consume a sealed set and does not open one.
- Does not pad a hub out to five studs. If the team can see five, they record five observations. They do not invent studs they did not identify.
- A later hub replacement scraps every one of these recorded studs on that hub and installs one new sealed set.

A later replacement that installs studs is a new `replacement` transaction. Only that commit consumes a sealed set. It appends a baseline only after a verified interval exists.

## 12. Purchasing

Suppliers, notes, orders, lines, and receipts are the purchasing model.

Receiving is the only purchasing action that creates kit ids. Notes and draft orders do not.

Lead time fields:

- `Supplier.lead_time_text`. Admin-editable. The recorded default is `a few days`. Owner decision, 2026-10-25.
- `Supplier.nominal_lead_time_days`. Null unless an admin types a number.
- `PurchaseOrderLine.lead_time_days_override`. Null unless an admin types a number.
- `PurchaseOrder.expected_receipt_date` and `PurchaseOrderLine.expected_receipt_date`.

Forecasts and timing warnings may show `a few days` as the owner's words. They must not convert that phrase into a day count, including any specific integer someone might guess from it. A null numeric lead time stays UNKNOWN. It must not become 0.

No price or currency field is required. Whether the team tracks cost is UNKNOWN.

Lot, batch, and date-code capture is UNKNOWN. No such field is required until that is decided. Kit id, receipt, supplier, and optional order line are the traceability that is required now.

## 13. Forecasting inputs

A forecast estimates event readiness for parts. It is an estimate, not a guarantee. It is not a certification that the vehicle is safe to race. It does not write movements, reservations, baselines, or purchase orders.

Race Backend may store a forecast snapshot for the team's record. A snapshot is labeled as an estimate and is not an input to on-hand.

### 13.1 Inputs the forecast must be able to read

| Input | Source | If missing |
| --- | --- | --- |
| Planned events | `PlannedEvent` rows in `planned` | No event claim. An empty calendar is empty, not "nothing to do." |
| Event dates | `start_on` | Timing versus lead time is UNKNOWN for that event. |
| Expected usage for the event | `expected_laps`, `expected_engine_hours` | Do not treat as zero. Demand from the schedule is UNKNOWN. |
| Approved rules and the catalog items they consume | Rule model, outside this spec. Wheel-stud interval research is `docs/research/wheel-studs.md` and is not an approved interval until a verified source says so. | Do not invent a stud interval or a studs-per-event figure. A hub replacement consumes one sealed set when it happens. How often it happens is UNKNOWN. The forecast lists that gap. |
| Current readings | Latest committed lap and engine-hour readings | Missing readings stay missing. They are not healthy and not zero. |
| On-hand sealed sets | Ledger fold | |
| Loose remainder | Ledger fold, reported separately | Not converted into sealed sets. |
| Quarantined stock | Ledger fold | Unavailable. Not counted as ready stock. |
| Reservations | Active `StockReservation` rows | |
| Inbound orders | Lines on `ordered` and `partially_received` orders, with expected dates | No date means not assumed to arrive in time. |
| Lead times | `lead_time_text` for display. Numeric day fields only when an admin entered them. | The words `a few days` stay words. A missing number is UNKNOWN, not zero, and not a parsed day count. |
| Usage history | Committed `consume` movements joined to their replacement's readings, time, event, catalog item, kit, and whether a paired removal was `failure` | Empty history is the expected starting point. Usage rate is UNKNOWN, not zero. |
| Reorder policy | `ReorderPolicy` | Incomplete policy is reported, not treated as stock being fine. |
| Open exceptions | `AuthorizedStockException` still `authorized` | A standing exception is visible so a forecast does not hide a known shortfall. |

The forecast must not backfill historical maintenance or historical consumption to produce a smoother estimate.

### 13.2 What the estimate has to say

Each forecast result includes:

- When it was generated.
- An explicit statement that it is an estimate and not a guarantee.
- An explicit statement that it does not certify vehicle safety.
- Per planned event and catalog item: the inputs used, the projected sealed-set picture, loose remainder as a separate figure, inbound that has dates, and the gaps (unknown lead time, unknown demand, unknown interval, missing readings, incomplete reorder policy).
- Assumptions actually used. An assumption cannot be a number this specification refused to invent. If the team has not entered a planning figure, the gap is listed instead of a filled-in figure.

Failed safety checks and unresolved critical defects are outside the stock math, but a parts forecast must not be presented as an overall "ready" for the car. Readiness remains a checklist aid.

## 14. Permissions, audit, and retention

Admin, enforced on the server, is required to:

- Approve catalog items and edit reorder policy.
- Create suppliers, notes, orders, and receipts.
- Adjust stock, release quarantine, and authorize a negative-stock exception for catalog items that allow one. Wheel studs do not, under the current default.
- Edit `lead_time_text` and, when they have a real number, the numeric lead-time fields.
- Enter the wheel-stud `part_number` when they have it, without copying `ARP` into that field.
- Configure hub position codes.

Race-day, enforced on the server, may:

- Submit drafts and the atomic hub replacement, which opens a sealed set only by consuming all five studs on one hub.
- Record inspection results, defects, laps, and engine hours through their own transactions.
- Record `opening_identification` and `removal_without_install` as specified. They must not invent history, and they must not install a partial set.

Race-day must not change intervals, approved rules, reorder numbers, or catalog approval. A stale offline edit must not overwrite a newer admin rule. The sync design is future work; the refusal rule is already in force for any write the server accepts.

Permanent, non-deletable history:

- `StockMovement`
- `ComponentEvent`
- `FailureEvidence` metadata
- `ServiceBaseline`
- `AuditEvent`
- Kit and component identity rows, including depleted and returned kits

Production data starts empty. Do not import the prototype's local storage seed, demo kit, demo quantity, or demo reorder value.

## 15. Invariant index

Race Backend and the schema share these invariants.

1. Catalog item, component, kit, and installation/removal event are different identities and different rows. `ARP` is the manufacturer, not the part number. The part number stays null until an admin enters it.
2. Each sealed wheel-stud set has its own `kit_id`. Nominal count is 5. No editable quantity of sets lives on that row.
3. The reorder warning counts kits in `sealed` only. Loose and opened studs never count toward the target of 4. The warning is on when that count is 4 or fewer.
4. A hub replacement installs exactly five studs from one kit that started `sealed`, and that kit ends `depleted`. Partial replacement and mixed kits on a hub are rejected with no stock effect.
5. A removed wheel stud is `scrapped`. That state has no installable transition. Reuse is permanently blocked.
6. The ledger is append-only. On-hand is the fold. Projections match the fold after every commit.
7. Wheel-stud `consume` exists only on a committed hub replacement (or the pieces are scrapped by an admin whole-set scrap) and cites the kit and the five component ids.
8. The hub replacement's maintenance record and stock movements commit together. A verified-interval baseline joins that commit only when a verified interval exists. Failure of validation or persistence leaves no open, no consume, and no baseline.
9. Drafts, rejections, inspections, removals without installation, opening identifications, quarantines, and receipts do not reset a service baseline. Wheel-stud sets are not opened as a standalone staging step.
10. Wheel-stud stock does not go negative. An authorized exception cannot waive that. **default, adjustable by team policy.** Other catalog items go negative only with an exception this commit consumes.
11. Replaying an idempotency key does not apply the bundle twice.
12. Concurrent commits that touch the same kit serialize. The loser rolls back completely.
13. Studs already on the car are `opening_identification` rows with unknown history. They are not backfilled with a kit, a date, or an interval.
14. Numeric lead time stays null until an admin enters it. `a few days` is not converted into a number. Forecasts are estimates, not guarantees.
15. No service interval, torque, inspection limit, or part number is shipped as a verified value. The wheel-stud spare target of 4 and the inclusive warning threshold of 4 are owner decisions, not service intervals.

## 16. Open questions

Resolved and removed from this list: the ARP extended-stud identity with a blank part number; hub replacement of one sealed set of five and the ban on mixed or partial hubs; the spare target of 4 and the inclusive warning at 4; the lead-time phrase `a few days`; scrapping removed studs with reuse permanently blocked. Negative-stock exceptions for wheel studs and startup studs with unknown history are decided as defaults in [5.3](#53-strict-defaults), not left open.

Still open:

1. **Whether more than one stud part number will exist, and whether any second number is interchangeable.** UNKNOWN. The commit rejects substitution. The current `part_number` stays null until an admin types the real ARP number. Do not invent it.
2. **Nominal set size for any sealed kit that is not a wheel-stud set.** UNKNOWN. Must not default to 5. Partial-use transitions in the general state model do not apply to wheel studs.
3. **The rest of the catalog:** which parts exist, their units, and whether they are `sealed_kit`, `serialized`, or `bulk`. UNKNOWN.
4. **Reorder numbers for catalog items other than the wheel-stud item.** UNKNOWN. The wheel-stud desired stock and inclusive warning threshold are already set to 4. `min_stock_sets` on the wheel-stud item stays null. Null is not zero.
5. **Supplier names and contacts.** UNKNOWN. Numeric lead time in days is null until an admin enters one. The text `a few days` is already recorded and must not be parsed.
6. **Whether purchase cost is tracked.** UNKNOWN. No price field is required.
7. **Whether individual studs carry a manufacturer mark or serial.** UNKNOWN. `ARP` is the brand, not a serial. Until a mark is observed, component identity is team-assigned. Do not invent serials.
8. **Hub position code strings.** The spare plan is four wheels, one sealed set each. The code list is still UNKNOWN. Until codes exist, wheel-stud replacements fail closed.
9. **Stud replacement interval and service thresholds** (laps, engine hours, events, calendar, warning, critical). UNKNOWN pending `docs/research/wheel-studs.md`. That file is another agent's research. This spec does not treat it as an approved interval and does not copy values from it. No baseline is written from a guessed interval.
10. **Torque, inspection limits, and required measurements.** UNKNOWN until a verified source. Team default: leave them unknown. Captures have a place to record observations. This spec supplies no limits.
11. **Sign-off slots and who must sign.** UNKNOWN. Missing slots fail the commit once a rule defines them. With no such rule, the stock commit does not invent sign-offs and does not call the inspection passed.
12. **Removal-reason taxonomy beyond `failure` and `other`.** UNKNOWN. Disposition for a wheel stud is `scrapped` either way.
13. **Failure-evidence minimum beyond one attached capture.** UNKNOWN.
14. **Standalone open and partial use for sealed kits that are not wheel studs.** UNKNOWN. Wheel-stud standalone open and partial hub replacement are already rejected.
15. **Quarantine release: any conditions beyond an admin `release_quarantine`.** UNKNOWN. Release of a wheel-stud kit restores `sealed` only.
16. **When an event reservation should release if nobody consumes it.** UNKNOWN. The date passing does not release it.
17. **Human kit-label format.** UNKNOWN. Do not adopt the prototype's sample id format as a standard.
18. **Decimal scale for engine hours, and the instrument those hours and laps come from.** UNKNOWN.
19. **VIN and competition identifiers** beyond 2004 Nissan 350Z. UNKNOWN.
20. **Storage location names.** UNKNOWN.
21. **Receipts with no purchase order.** This spec allows them when a supplier and a note are present. Confirm that the team wants that path.
22. **Whether notes and orders should stay two records.** Both are specified because the handoff asks for purchase notes and orders.
23. **Lot, batch, or date code.** UNKNOWN. Not required yet.
24. **How often a hub consumes a sealed set.** Each such job consumes one set. The schedule is UNKNOWN pending `docs/research/wheel-studs.md`. Forecasts must show that gap.
25. **Over-receipt above `quantity_ordered`.** UNKNOWN. Until decided, the extra quantity is rejected.
26. **How a wrong committed baseline is corrected,** once a verified interval exists, beyond appending a new explicit transaction and never deleting the old rows. UNKNOWN.
27. **Adjustment reason taxonomy.** UNKNOWN. Free text plus a short code is required either way.
28. **Binary retention for failure photographs.** Metadata is permanent. Retention of the bytes is UNKNOWN.
29. **Service-rule schema details** beyond `rule_id`, approval source and revision, the hub, which readings apply, and which captures and sign-off slots are required. UNKNOWN here.
30. **Offline queue payload layout.** Stable ids and idempotency keys are the contract. Extra sync fields are UNKNOWN and must not weaken the hub invariant or the atomic commit.
