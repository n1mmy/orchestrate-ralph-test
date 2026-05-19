# 22 — Option detail page: route, identity, and Recency

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/option-detail-page/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

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
**"Actions"** section (the `OptionControls` component — wired in ticket 25); a
conditional **"Details"** list; and a single **"History"** section (built in
ticket 23). This slice builds the route, the header, and the Recency and
Details blocks; the Actions and History blocks are stubbed or wired by their
own tickets. There is **no Score block** — the as-built page never displays a
Score number to the Household.

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
exercised in ticket 26), the `TagRecency[]` chips, `recencyDays` (capped at
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
keyboard focus. The Catalog row's Option name becomes a `next/link` to
`/catalog/[id]` in `app/catalog/option-row.tsx`; the Tonight and Log links come
in ticket 27.

## Acceptance criteria

- [ ] `app/catalog/[id]/page.tsx` is a `force-dynamic` server component rendering a detail page for an active Option of either kind
- [ ] A request for an id matching no `options` row, or a malformed id, renders Next's `notFound()`
- [ ] The header shows a "Restaurant" / "Home meal" kind label above the Option name, carried by the meal-kind color channel
- [ ] A "Recency" section renders `RowChips` — the per-Option Recency chip plus the Tag heatmap chips — fed from `rankOption`
- [ ] A conditional "Details" `<dl>` shows notes, the `url` as a clickable link, and for a Restaurant the address, `phone` as a `tel:` link, and a Google Maps link; a Home meal omits the Restaurant-only fields
- [ ] The page renders no Score number anywhere
- [ ] `rankOption` is added to `lib/ranking.ts`, reusing the existing recency internals, and its result for an active Option matches that Option's `rankTonight` row over the same inputs
- [ ] `lib/ranking.test.ts` covers `rankOption` — an active Option matches `rankTonight`, plus the never-eaten flag and `CAP` recency
- [ ] The Option name on a Catalog row links to `/catalog/[id]`
- [ ] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 19–21 (Phase 4 — Rejections) — the detail page reuses the Rejections data and `RejectionRow`
