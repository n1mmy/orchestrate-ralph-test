# 15 — Log day grouping + Log Rejections UI + Option detail Rejection management

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

### Interleaved day grouping: groupByDay over Log entries and Rejections

Extend `lib/dinner-grouping.ts` — the pure module ticket 13 introduced for the Option detail page's History section and the Log screen's Dinner grouping — so it can group **Log entries** and **Rejections** together by date. Ticket 13 left the module with `groupByDate`, `splitDinners`, the `Dinner<T>` type, and `formatDinnerDate`; this ticket adds the interleaved-grouping half on top, leaving every existing export untouched.

Add a `DayRecord<E, R>` type: a calendar `date` (`"YYYY-MM-DD"`), an `entries: E[]` array (that date's Log entries — its Dinner), and a `rejections: R[]` array (that date's Rejections). It is generic over `E extends { eatenOn: string }` and `R extends { rejectedOn: string }` — the module reads only those two date fields, so it stays pure: no React import, no DB import.

Add `groupByDay(entries, rejections, today)`: given a newest-first Log, the Rejection list, and today's date, it returns `{ upcoming: DayRecord[]; history: DayRecord[] }`. It builds a `Map` keyed by date so a Log entry and a Rejection sharing a date converge on one `DayRecord`; a date with only Rejections and no Dinner still forms a record (a `DayRecord` with an empty `entries` array), so a Rejection-only night is never invisible. Entries push into `record.entries` in caller order and Rejections into `record.rejections` in caller order, so input order is preserved within a record. The split is exact at the today boundary: `date > today` is Upcoming, `date <= today` is History. Upcoming is sorted soonest-first via `a.date.localeCompare(b.date)` (the nearest plan reads at the top of its strip); History is sorted newest-first via `b.date.localeCompare(a.date)` (the screen reads newest-first). Future-dated records carry Planned dinners and Planned rejections.

`formatDinnerDate` is unchanged and stays the date-label helper for `groupByDay`'s records: "Today" / "Tomorrow" / "Yesterday", else the "Fri, May 16" form with a "· N days ago" suffix on a past date, a future date plain. `groupByDate`, `splitDinners`, and `Dinner<T>` remain exported — the Option detail page's History section is reworked onto `groupByDay` below, but the older helpers stay in the module.

Extend `lib/dinner-grouping.test.ts` with full unit coverage for `groupByDay`, exercised with hand-built fixtures — a minimal `{ id, eatenOn }` entry helper and a `{ id, rejectedOn }` rejection helper, since the module reads only the date field. Cover: a Log entry and a Rejection sharing a date land in one record; a Rejection-only date forms its own record; the Upcoming/History split is exact at the today boundary for both entries and Rejections; Upcoming is soonest-first and History newest-first; input order is preserved within a record; an empty Log with no Rejections yields `{ upcoming: [], history: [] }`. Framework: Vitest, no live I/O.

### Log screen: interleaved Rejections and the shared RejectionRow

Rework the **Log** screen (`app/log/log-screen.tsx`) into the Household's full nightly record, interleaving **Rejections** into its date-groups, and build the shared `RejectionRow` component the Option detail page reuses below. Ticket 13 built the Log screen's Dinner grouping on `lib/dinner-grouping`; this ticket moves it onto the new `groupByDay` so each date carries its Dinner *and* its Rejections.

**Interleaved display.** `LogScreen` takes `entries: LogEntryRow[]`, `rejections: LogRejectionRow[]`, `optionChoices: OptionChoice[]`, and `today`. It calls `groupByDay(entries, rejections, today)` and renders `upcoming` and `history`. The Upcoming strip is capped — `UPCOMING_CAP = 5`, with a "+N more planned" line below when the cap bites. Each `DayGroup` renders one `DayRecord`: a `formatDinnerDate` header, then that date's `EntryRow`s, then its `RejectionRow`s (Log entries first, then Rejections). A Rejection-only date still renders as its own group. When both Upcoming and History are present a "History" sub-heading appears; the empty state ("No dinners logged yet — pick one on Tonight →") shows only when `entries` and `rejections` are both empty. The Log page route must load `getLogRejections()` and `getOptionChoices()` alongside `getLog()` and pass them in.

**Two top-of-Log add controls.** A `TopAddControls` component with separate "+ Add a dinner" and "+ Add a rejection" buttons — each one direct action, no mode toggle. Each opens its inline form below the buttons; the form's "Cancel" closes it. The dinner form is the existing `AddEntryForm` (Option select, date, note → `logForDate`); the rejection form is the new `AddRejectionForm`. Both default their date to `today`.

**Per-date-group add controls.** Each `DayGroup` also offers "+ Dinner" and "+ Rejection" buttons that open the same inline forms with `defaultDate` pre-filled to that group's date, so the Household never re-types a date it is already looking at.

**The shared RejectionRow component** lives in a new `app/log/rejection-row.tsx` and is built here for reuse by the Option detail page below, so a Rejection is added, edited, and deleted identically wherever it appears. It mirrors `EntryRow` / `EntryEditForm`. It exports:

- `AddRejectionForm({ optionChoices, defaultDate, onCancel, onSaved })` — the inline add form: an Option `<select>` (Home meals / Restaurants optgroups), a `type="date"` input, an optional reason text input, and Add / Cancel. It calls `createRejection`; `onSaved` fires only on `result.ok`.
- `RejectionRow({ rejection, optionChoices })` — one Rejection row. It shows a "Rejected" meta label, the Option name linked to `/catalog/[optionId]`, and the optional reason. Edit / Delete actions: Edit expands the row in place into the shared rejection form (Option, date, reason → `updateRejection`); Delete uses the §17 inline-confirm (the row reveals a confirm/cancel, not a modal) and calls `deleteRejection`. A saved edit collapses with a brief "Saved" `aria-live` note; a failed delete shows an inline error. Every Rejection is editable and deletable regardless of age. The row carries no date of its own — both screens that render it group Rejections under a date header.

A shared internal `RejectionForm` body backs both the add form and the edit form: Option select, date, optional reason, a configurable submit label, and Cancel. A blank date sets the inline "Pick a valid date" error; a failed write — a duplicate `(option_id, rejected_on)` or a stale Option — sets `error` from the action result, shown inline under the date with `role="alert"`, never flashed as success. Suppression falls out of the date rule with no new client code: a Rejection added or edited to today's date drops its Option off Tonight because the ticket-12 actions revalidate `/`; a past-dated one leaves Tonight unchanged.

Visual styling is `DESIGN.md`'s call; this ticket fixes the controls and the interleaved structure. Every add / edit / delete / confirm control is keyboard-operable with a visible focus ring and an adequate (`min-h-11`) touch target.

### Option detail page: interleaved History with Rejection management

Bring the **Option detail page**'s History section to the final shipped form, so a **Rejection** is managed identically wherever the Option is shown (ADR-0007 — every sensible control wherever it makes sense). Tickets 13 and 14 built the detail page (`app/catalog/[id]/page.tsx`) with a merged History section interleaving that Option's logged dinners and its Rejections; this ticket reworks that section onto the new `groupByDay` and the shared `RejectionRow` above, so its Rejections become fully manageable in place.

The detail page loads, in its existing `Promise.all`, `getOptionLog(option.id)` and `getOptionRejections(option.id)` (the ticket-12 query — that Option's Rejections, all dates, joined to the Option, newest first), plus `getOptionChoices()` for the edit forms. It calls `groupByDay(optionLog, optionRejections, todaySql)` and renders one merged History section: future-dated groups (Planned dinners and Planned rejections) first, then realized history newest-first — the shipped page builds this as `[...upcoming].reverse().concat(history)`. Each date-group is a `formatDinnerDate` header above that day's `EntryRow`s and `RejectionRow`s, reusing the Log screen's components. When the Option has no logged dinners and no Rejections, the section shows "Nothing logged or rejected yet for this Option."

Every Rejection of that Option — past, today, or future — is inline-editable (Option, date, reason) and deletable through the shared `RejectionRow` above. Edit expands the row into the rejection form and calls `updateRejection`; a duplicate `(option_id, rejected_on)` shows the inline "Already rejected for that date" error. Delete uses the §17 inline-confirm and calls `deleteRejection`, removing the Rejection entirely. The detail page's older today-only **Bring back** affordance is subsumed by this always-available Delete — bringing a Rejection back is just deleting it. Because the ticket-12 actions revalidate `/catalog/[id]`, an edit or delete refreshes this page in place with no manual reload.

The detail page gets **no** dated add-rejection form — creating a Rejection for an arbitrary date is the Log screen's job (the Log screen section above). The detail page keeps its existing live "Reject" control in its Actions block (the affordance built in ticket 14, calling `rejectOption`). Tonight's "Rejected tonight" disclosure is untouched — "Bring back" there stays the today-only quick-undo, a separate affordance from the detail page's per-row Delete. The History section's layout is otherwise unchanged from tickets 13 and 14; this ticket upgrades the controls and the grouping, not the surrounding page structure (Recency, Actions, Details sections stay as built).

## Acceptance criteria

### Interleaved day grouping

- [ ] `lib/dinner-grouping.ts` exports a `DayRecord<E, R>` type with `date: string`, `entries: E[]`, and `rejections: R[]`, generic over `E extends { eatenOn: string }` and `R extends { rejectedOn: string }`
- [ ] `groupByDay(entries, rejections, today)` returns `{ upcoming: DayRecord[]; history: DayRecord[] }`
- [ ] A Log entry and a Rejection sharing a date converge on one `DayRecord`; a date with only Rejections still forms a record
- [ ] Entries and Rejections keep the caller's input order within a record
- [ ] The Upcoming/History split is exact at the today boundary — `date > today` is Upcoming, `date <= today` is History
- [ ] Upcoming is returned soonest-first; History is returned newest-first
- [ ] The module stays pure — no React, no DB import; it reads only `eatenOn` / `rejectedOn`
- [ ] `groupByDate`, `splitDinners`, `Dinner<T>`, and `formatDinnerDate` are still exported and unchanged
- [ ] `lib/dinner-grouping.test.ts` covers `groupByDay` with hand-built fixtures: same-date interleave, Rejection-only record, exact today-boundary split, ordering, input-order preservation, empty input

### Log screen

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

### Option detail page

- [ ] `app/catalog/[id]/page.tsx` loads `getOptionLog`, `getOptionRejections`, and `getOptionChoices` and builds its History section from `groupByDay(optionLog, optionRejections, todaySql)`
- [ ] The merged History section renders future-dated groups first (`[...upcoming].reverse()`) then realized history newest-first, each date-group a `formatDinnerDate` header above that day's `EntryRow`s and `RejectionRow`s
- [ ] An Option with no logged dinners and no Rejections shows "Nothing logged or rejected yet for this Option."
- [ ] Every Rejection row (past, today, or future) offers inline Edit (Option, date, reason → `updateRejection`) and Delete (§17 inline-confirm → `deleteRejection`), reusing the shared `RejectionRow`
- [ ] An edit producing a duplicate `(option_id, rejected_on)` shows the inline "Already rejected for that date" error
- [ ] The detail page's today-only "Bring back" affordance is replaced by the always-available Delete
- [ ] Editing or deleting a Rejection refreshes the detail page in place via the `/catalog/[id]` revalidation
- [ ] No dated add-rejection form is added to the detail page; its existing live "Reject" control is unchanged
- [ ] Tonight's "Rejected tonight" disclosure and its today-only "Bring back" quick-undo are unchanged

## Blocked by

- 12 — Rejected tonight disclosure + rejection-management server actions
- 13 — Option detail page: core, merged History, Option-name links
- 14 — Option detail page: Actions toolbar, Archived Options, Rejection history
