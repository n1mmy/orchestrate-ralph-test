# 24 — Option detail page: Rejections in History + Bring-back parity

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

This slice completes the **Rejection** half of the **Option detail page**'s
single merged **History** section. The as-built page has **no separate
"Rejection history" section** — a **Rejection** is rendered inline within the
same date-grouped History list built in ticket 23, beside that day's logged
dinners. This ticket makes that Rejection rendering correct and fully
interactive.

The History section's data comes from `getOptionRejections(option.id)` in
`db/queries.ts` — every `rejections` row for the Option, joined to its Option,
ordered newest `rejected_on` first (`created_at` breaking a same-day tie),
returned as the same `LogRejectionRow` shape the Log screen consumes. Unlike
the Tonight queries it is **not** filtered to active Options, since the detail
page serves an Archived Option's Rejection history too. `groupByDay` (ticket
23) interleaves these Rejections with the Option's Log entries into per-date
`DayRecord`s; each group renders its Rejections with `RejectionRow` after that
date's `EntryRow`s.

The shipped page reuses the **`RejectionRow`** component from
`app/log/rejection-row.tsx` verbatim — the same component the Log screen uses.
That means each Rejection on the detail page is, by reuse, fully **editable and
deletable in place**: `RejectionRow` carries Edit (expanding the row into the
shared `RejectionForm` — Option, date, reason) and a §17 inline-confirm Delete,
backed by the existing `updateRejection` / `deleteRejection` actions. There is
no separate, display-only "Bring back" treatment on the detail page — the
shipped build folds Bring-back into ordinary Rejection editing/deletion, and
`updateRejection` / `deleteRejection` already revalidate `/catalog/[id]`, so an
edit or delete refreshes the page in place. A Rejection's optional reason
renders as a quiet line under the row; a Rejection with no reason renders
cleanly without one. An Option that has never been rejected simply contributes
no Rejection rows — the History section's empty state (ticket 23) covers the
no-history-at-all case.

No new server action is added in this slice — `getOptionRejections` and the
reused `RejectionRow` are the whole of the work.

## Acceptance criteria

- [x] `getOptionRejections(optionId)` returns every `rejections` row for the Option as `LogRejectionRow`, newest `rejected_on` first, not filtered to active Options
- [x] The detail page renders each Rejection inside the merged History section's date groups, after that date's logged dinners
- [x] Rejections are rendered with the reused `RejectionRow` component from `app/log/rejection-row.tsx`
- [x] A Rejection can be edited inline (Option, date, reason) and deleted via §17 inline-confirm from the History section
- [x] An edit or delete of a Rejection revalidates `/catalog/[id]` and refreshes the page in place
- [x] A Rejection's optional reason renders as a quiet line; a Rejection with no reason renders cleanly without one
- [x] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 19 — Reject and suppress (the `rejections` table its Rejection data
  reads from)
- 23 — Option detail page: merged History section + dinner-grouping module
