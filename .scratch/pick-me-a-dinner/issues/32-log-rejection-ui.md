# 32 — Log screen: interleaved Rejections and the shared RejectionRow

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/dated-rejections/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Rework the **Log** screen (`app/log/log-screen.tsx`) into the Household's full nightly record, interleaving **Rejections** into its date-groups, and build the shared `RejectionRow` component the Option detail page reuses in ticket 33. Phase 5 built the Log screen's Dinner grouping on `lib/dinner-grouping`; this ticket moves it onto the ticket-29 `groupByDay` so each date carries its Dinner *and* its Rejections.

**Interleaved display.** `LogScreen` takes `entries: LogEntryRow[]`, `rejections: LogRejectionRow[]`, `optionChoices: OptionChoice[]`, and `today`. It calls `groupByDay(entries, rejections, today)` and renders `upcoming` and `history`. The Upcoming strip is capped — `UPCOMING_CAP = 5`, with a "+N more planned" line below when the cap bites. Each `DayGroup` renders one `DayRecord`: a `formatDinnerDate` header, then that date's `EntryRow`s, then its `RejectionRow`s (Log entries first, then Rejections). A Rejection-only date still renders as its own group. When both Upcoming and History are present a "History" sub-heading appears; the empty state ("No dinners logged yet — pick one on Tonight →") shows only when `entries` and `rejections` are both empty. The Log page route must load `getLogRejections()` and `getOptionChoices()` alongside `getLog()` and pass them in.

**Two top-of-Log add controls.** A `TopAddControls` component with separate "+ Add a dinner" and "+ Add a rejection" buttons — each one direct action, no mode toggle. Each opens its inline form below the buttons; the form's "Cancel" closes it. The dinner form is the existing `AddEntryForm` (Option select, date, note → `logForDate`); the rejection form is the new `AddRejectionForm`. Both default their date to `today`.

**Per-date-group add controls.** Each `DayGroup` also offers "+ Dinner" and "+ Rejection" buttons that open the same inline forms with `defaultDate` pre-filled to that group's date, so the Household never re-types a date it is already looking at.

**The shared RejectionRow component** lives in a new `app/log/rejection-row.tsx` and is built here for reuse by the Option detail page (ticket 33), so a Rejection is added, edited, and deleted identically wherever it appears. It mirrors `EntryRow` / `EntryEditForm`. It exports:

- `AddRejectionForm({ optionChoices, defaultDate, onCancel, onSaved })` — the inline add form: an Option `<select>` (Home meals / Restaurants optgroups), a `type="date"` input, an optional reason text input, and Add / Cancel. It calls `createRejection`; `onSaved` fires only on `result.ok`.
- `RejectionRow({ rejection, optionChoices })` — one Rejection row. It shows a "Rejected" meta label, the Option name linked to `/catalog/[optionId]`, and the optional reason. Edit / Delete actions: Edit expands the row in place into the shared rejection form (Option, date, reason → `updateRejection`); Delete uses the §17 inline-confirm (the row reveals a confirm/cancel, not a modal) and calls `deleteRejection`. A saved edit collapses with a brief "Saved" `aria-live` note; a failed delete shows an inline error. Every Rejection is editable and deletable regardless of age. The row carries no date of its own — both screens that render it group Rejections under a date header.

A shared internal `RejectionForm` body backs both the add form and the edit form: Option select, date, optional reason, a configurable submit label, and Cancel. A blank date sets the inline "Pick a valid date" error; a failed write — a duplicate `(option_id, rejected_on)` or a stale Option — sets `error` from the action result, shown inline under the date with `role="alert"`, never flashed as success. Suppression falls out of the date rule with no new client code: a Rejection added or edited to today's date drops its Option off Tonight because the ticket-31 actions revalidate `/`; a past-dated one leaves Tonight unchanged.

Visual styling is `DESIGN.md`'s call; this ticket fixes the controls and the interleaved structure. Every add / edit / delete / confirm control is keyboard-operable with a visible focus ring and an adequate (`min-h-11`) touch target.

## Acceptance criteria

- [ ] `LogScreen` consumes `groupByDay(entries, rejections, today)` and renders interleaved `DayGroup`s — Log entries first, then Rejections; a Rejection-only date forms its own group
- [ ] Future-dated groups (Planned dinners and Planned rejections) sit in a capped "Upcoming" strip (`UPCOMING_CAP = 5`) with a "+N more planned" line when the cap bites; past/today groups in History
- [ ] The Log page route loads `getLogRejections()` and `getOptionChoices()` and passes them to `LogScreen`; the empty state shows only when entries and Rejections are both empty
- [ ] Separate "+ Add a dinner" and "+ Add a rejection" controls at the top of the Log, each opening its inline form with a Cancel; each `DayGroup` offers "+ Dinner" / "+ Rejection" with the date pre-filled to the group's date
- [ ] A new `app/log/rejection-row.tsx` exports `AddRejectionForm` and `RejectionRow`, sharing one internal `RejectionForm` body, built for reuse by the Option detail page
- [ ] `AddRejectionForm` takes an Option select, a date, and an optional reason; calls `createRejection`; `onSaved` fires only on `ok`
- [ ] `RejectionRow` shows the Option name (linked to its detail page) and the reason; Edit expands inline into the form (Option, date, reason → `updateRejection`); Delete uses the §17 inline-confirm and calls `deleteRejection`; both work regardless of the Rejection's age
- [ ] A duplicate `(option_id, rejected_on)` on add or edit shows the inline "Already rejected for that date" error; a failed write is reported inline with `role="alert"`, never as success
- [ ] A Rejection added/edited to today drops its Option off Tonight via the action revalidation; a past-dated one leaves Tonight unchanged — no new suppression code
- [ ] Add, edit, delete, and confirm controls are keyboard-operable with visible focus and `min-h-11` touch targets; a saved edit announces "Saved" via `aria-live`

## Blocked by

- 29 — Interleaved day grouping: groupByDay over Log entries and Rejections
- 31 — Rejection-management server actions + Log Rejections queries
