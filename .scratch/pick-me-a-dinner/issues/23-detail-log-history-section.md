# 23 — Option detail page: merged History section + dinner-grouping module

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/option-detail-page/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

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

- [ ] `lib/dinner-grouping.ts` is a pure module providing `groupByDate`, `splitDinners`, `formatDinnerDate`, and `groupByDay`
- [ ] `lib/dinner-grouping.test.ts` covers the today-boundary split, same-date grouping, a Rejection-only date forming a record, the upcoming/history ordering, and the date labels
- [ ] The Log screen consumes `lib/dinner-grouping.ts`; its rendered behavior is unchanged
- [ ] `EntryRow` / `EntryEditForm` are extracted into a shared `app/log/log-entry-row.tsx` used by both the Log screen and the detail page
- [ ] The detail page has a single "History" section — one merged, date-grouped list interleaving the Option's Log entries and Rejections
- [ ] Future-dated (Planned) groups render first, then realized history newest-first
- [ ] Each date group reuses `EntryRow` for logged dinners and `RejectionRow` for Rejections under a `formatDinnerDate` header
- [ ] An Option with no Log entries and no Rejections shows a quiet empty state
- [ ] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 22 — Option detail page: route, identity, and Recency
