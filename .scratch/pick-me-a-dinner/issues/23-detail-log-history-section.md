# 23 — Option detail page: merged History section + dinner-grouping module

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The **single "History" section** of the **Option detail page** — the as-built
page has **one** History block, not the separate "Log history" and "Rejection
history" sections the background PRD describes. It is a merged, date-grouped
list interleaving this **Option**'s logged dinners (its **Log entries**) and
its **Rejections**, so the Household reads "when did we have this, and when did
we turn it down" in one chronological place.

The section is built from `groupByDay` in `lib/dinner-grouping.ts`. The page
calls `getOptionLog(option.id)` and `getOptionRejections(option.id)` and passes
both — plus today's SQL date — to `groupByDay`, which returns `{ upcoming,
history }`: `DayRecord`s split at the today boundary (a record dated today is
History, one dated tomorrow is Upcoming), `upcoming` soonest-first and
`history` newest-first. Each `DayRecord` collects that date's Log entries
*and* that date's Rejections; a date with only Rejections still forms a record.
The page renders future-dated groups first (it reverses `upcoming` so the
**Planned** dinners/rejections read newest-first ahead of the realized
history): `const activity = [...upcoming].reverse().concat(history)`. Each
group is a `formatDinnerDate` header above a `<ul>` of that day's `EntryRow`s
followed by its `RejectionRow`s. An Option with no Log entries and no
Rejections shows a quiet empty state ("Nothing logged or rejected yet for this
Option.").

The rows are **reused, not re-implemented**. The Log entry row and its inline
edit form — currently private in `app/log/log-screen.tsx` as `EntryRow` /
`EntryEditForm` — are extracted into a shared `app/log/log-entry-row.tsx`,
exporting `EntryRow` (and the shared `inputClass` / `labelClass`); the
`RejectionRow` already lives in `app/log/rejection-row.tsx`. The detail page
imports `EntryRow` and `RejectionRow` directly, so a logged Dinner and a
Rejection are edited and deleted in place on the detail page exactly as on the
Log screen — via the existing `updateLogEntry` / `deleteLogEntry` /
`updateRejection` / `deleteRejection` actions, whose `revalidatePath` calls
already target `/catalog/[id]`.

This slice also extracts and creates the pure `lib/dinner-grouping.ts` module
(no React, no DB dependency): `groupByDate`, `splitDinners`, `formatDinnerDate`
(the "Today / Tomorrow / Yesterday / Fri, May 16 · N days ago" label), and
`groupByDay`. The Log screen is refactored to consume this module — its
rendered behavior is unchanged. A new `lib/dinner-grouping.test.ts` (Vitest,
pure functions, hand-built fixtures, modeled on `lib/tonight-filter.test.ts`)
pins the behavior before reuse: the exact today-boundary split for both Log
entries and Rejections, same-date grouping into one record, a Rejection-only
date still forming a record, the `upcoming` soonest-first / `history`
newest-first ordering, input-order preservation within a record, and the date
label resolution including the month-boundary case.

## Acceptance criteria

- [x] `lib/dinner-grouping.ts` is a pure module providing `groupByDate`, `splitDinners`, `formatDinnerDate`, and `groupByDay`
- [x] `lib/dinner-grouping.test.ts` covers the today-boundary split, same-date grouping, a Rejection-only date forming a record, the upcoming/history ordering, and the date labels
- [x] The Log screen consumes `lib/dinner-grouping.ts`; its rendered behavior is unchanged
- [x] `EntryRow` / `EntryEditForm` are extracted into a shared `app/log/log-entry-row.tsx` used by both the Log screen and the detail page
- [x] The detail page has a single "History" section — one merged, date-grouped list interleaving the Option's Log entries and Rejections
- [x] Future-dated (Planned) groups render first, then realized history newest-first
- [x] Each date group reuses `EntryRow` for logged dinners and `RejectionRow` for Rejections under a `formatDinnerDate` header
- [x] An Option with no Log entries and no Rejections shows a quiet empty state
- [x] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 22 — Option detail page: route, identity, and Recency

## Comments

Implemented the pure `lib/dinner-grouping.ts` module (`groupByDate`,
`splitDinners`, `formatDinnerDate`, `groupByDay` with a typed `DayRecord`),
refactored the Log screen to consume it, and added the merged History
section to `/catalog/[id]` using `groupByDay`. Added a focused
`getOptionLogEntries(optionId)` query returning `LogEntry[]` including
future-dated rows so Planned dinners can surface under Upcoming. The
detail page passes `rejections: []` for now — `getOptionRejections` and
`RejectionRow` land in ticket 24 and slot into the existing `DayRecord`
shape with no further structural change.
