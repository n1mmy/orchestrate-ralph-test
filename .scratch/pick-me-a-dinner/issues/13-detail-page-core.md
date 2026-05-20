# 13 — Option detail page: core, merged History, Option-name links

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

### Route, identity, header, and Recency block

The tracer bullet for the **Option detail page**: a new dynamic route at
`app/catalog/[id]/page.tsx` — a `server` component, `export const dynamic =
"force-dynamic"` so it is never prerendered (its recency depends on the
Household's current calendar day). A member of the Household lands on it by
tapping an **Option**'s name on the **Catalog** screen. The page resolves
`params` (a `Promise<{ id: string }>`), loads the Option with `getOptionById`,
and renders Next's `notFound()` when the id matches no `options` row — the 404
a stale link to a Deleted Option, or a malformed id, lands on. There is no
dedicated `app/catalog/[id]/loading.tsx`; the route streams under the existing
`app/catalog/loading.tsx` skeleton.

The shipped page is a single `<main>` (the standard `column … gap-5.5`
layout) composed of five blocks in this order: a **header** (a `kind`-label
line — "Restaurant" or "Home meal" — above the Option name as an `h1`, carried
by the meal-kind color channel via `kindBarClass`); a **"Recency"** section; an
**"Actions"** section (the `OptionControls` component — wired in ticket 14); a
conditional **"Details"** list; and a single **"History"** section (built
below). This slice builds the route, the header, the Recency and Details
blocks, and the merged History block; the Actions block is stubbed or wired
by ticket 14. There is **no Score block** — the as-built page never displays
a Score number to the Household.

The **"Recency" section** renders the `RowChips` component (already exported
from `app/tonight-row.tsx`) — the per-Option **Recency chip** followed by the
**Tag** heatmap chips, exactly the chip row a Tonight row carries — fed from a
new `rankOption` call. The **"Details" list** is a `<dl>` of hairline-separated
labelled `Field` rows, rendered only when the Option has at least one detail to
show (`notes`, `url`, or — for a **Restaurant** — `address` / `phone` /
`mapsUrl`): it shows notes, the `url` as a clickable external link, and for a
Restaurant the address, the `phone` as a `tel:` link, and a "Google Maps" link
to `mapsUrl`. A **Home meal** omits the Restaurant-only fields entirely.

This slice adds the pure single-Option ranking function `rankOption` to
`lib/ranking.ts`, reusing the existing recency internals (`lastEaten` /
`lastTagUse` / `daysSince` / `optionScore`) — the Score formula is unchanged
(ADR-0003). `rankOption` takes a `RankOptionInput` (the `target` Option, the
active Catalog `activeOptions`, the active `activeLog`, the Option's own
`targetLog`, and `today` as an epoch-day) and returns an `OptionRanking`:
`score` (a `number`, or `null` for an Archived Option — the `null` path is
exercised in ticket 14), the `TagRecency[]` chips, `recencyDays` (capped at
`CAP`), and the `neverEaten` flag. For an active Option its result must equal
that Option's row in `rankTonight` over the same inputs, so the detail page and
Tonight never disagree. `db/queries.ts` gains `getOptionById` (one Option by id
with its Tag names, screening a non-UUID id to a clean `null` rather than a
500 — not filtered to active Options), `getOptionLog`, and `getAllTags` as
needed; the page also calls the existing `getTonightData` to assemble the
active-Catalog ranking inputs.

The page follows the `DESIGN.md` visual system — sharp-instrument density, the
meal-kind color channel, the recency heatmap. It is usable on phone and desktop
with adequate touch targets, every control and link reachable with visible
keyboard focus.

### Merged History section (dinners + the dinner-grouping module)

The **single "History" section** of the **Option detail page** — the as-built
page has **one** History block, not the separate "Log history" and "Rejection
history" sections the background PRD describes. It is a merged, date-grouped
list interleaving this **Option**'s logged dinners (its **Log entries**) and
its **Rejections**, so the Household reads "when did we have this, and when did
we turn it down" in one chronological place. (This slice ships the dinner half
end-to-end and the merged-list structure; the Rejection-row variant and
Bring-back parity ride on top in ticket 14.)

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

### Option-name links from Tonight and the Log

Make the **Option detail page** reachable from the remaining two screens that
show an **Option**'s name — completing the link wiring. The Catalog row's
Option name becomes a `next/link` to `/catalog/[id]` in
`app/catalog/option-row.tsx` as part of this slice's route work; the Tonight
and Log links are wired alongside:

- In `app/tonight-row.tsx`, the Option name in `TonightRowItem` is wrapped in a
  `next/link` to `/catalog/${option.id}`.
- In `app/log/log-entry-row.tsx` (the `EntryRow` extracted above), the
  Log entry's Option name links to `/catalog/${entry.optionId}`.
- In `app/log/rejection-row.tsx`, the `RejectionRow`'s Option name links to
  `/catalog/${rejection.optionId}`.

The detail page is a normal page navigation, so the browser Back button returns
the member to where they came from. The link is styled so it reads as a link
and is visually distinct from the row's action controls — Pick, Reject, Edit,
Delete — sitting beside it: the shipped rows use the name set in the display
font (`font-display text-name font-name text-ink`) with `hover:underline`,
`underline-offset-2`, and a `focus-visible` outline ring, so tapping the name
opens the page and never triggers a row control. The result is a uniform,
complete view: every Option has the same detail page, reachable from Catalog,
Tonight, and the Log alike.

## Acceptance criteria

- [ ] `app/catalog/[id]/page.tsx` is a `force-dynamic` server component rendering a detail page for an active Option of either kind
- [ ] A request for an id matching no `options` row, or a malformed id, renders Next's `notFound()`
- [ ] The header shows a "Restaurant" / "Home meal" kind label above the Option name, carried by the meal-kind color channel
- [ ] A "Recency" section renders `RowChips` — the per-Option Recency chip plus the Tag heatmap chips — fed from `rankOption`
- [ ] A conditional "Details" `<dl>` shows notes, the `url` as a clickable link, and for a Restaurant the address, `phone` as a `tel:` link, and a Google Maps link; a Home meal omits the Restaurant-only fields
- [ ] The page renders no Score number anywhere
- [ ] `rankOption` is added to `lib/ranking.ts`, reusing the existing recency internals, and its result for an active Option matches that Option's `rankTonight` row over the same inputs
- [ ] `lib/ranking.test.ts` covers `rankOption` — an active Option matches `rankTonight`, plus the never-eaten flag and `CAP` recency
- [ ] `lib/dinner-grouping.ts` is a pure module providing `groupByDate`, `splitDinners`, `formatDinnerDate`, and `groupByDay`
- [ ] `lib/dinner-grouping.test.ts` covers the today-boundary split, same-date grouping, a Rejection-only date forming a record, the upcoming/history ordering, and the date labels
- [ ] The Log screen consumes `lib/dinner-grouping.ts`; its rendered behavior is unchanged
- [ ] `EntryRow` / `EntryEditForm` are extracted into a shared `app/log/log-entry-row.tsx` used by both the Log screen and the detail page
- [ ] The detail page has a single "History" section — one merged, date-grouped list interleaving the Option's Log entries and Rejections
- [ ] Future-dated (Planned) groups render first, then realized history newest-first
- [ ] Each date group reuses `EntryRow` for logged dinners and `RejectionRow` for Rejections under a `formatDinnerDate` header
- [ ] An Option with no Log entries and no Rejections shows a quiet empty state
- [ ] The Option name on a Catalog row links to `/catalog/[id]`
- [ ] The Option name on a Tonight row (`app/tonight-row.tsx`) links to `/catalog/[id]`
- [ ] The Option name on a Log entry row (`EntryRow` in `app/log/log-entry-row.tsx`) links to `/catalog/[id]`
- [ ] The Option name on a Rejection row (`RejectionRow` in `app/log/rejection-row.tsx`) links to `/catalog/[id]`
- [ ] Each name link is visually distinct from the row's action controls, with a visible focus ring, and does not interfere with them
- [ ] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 08 — Tonight decided mode: two-mode picker, action buttons, remove
