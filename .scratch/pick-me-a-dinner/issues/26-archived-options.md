# 26 — Archived Options: detail page, Un-archive, and Catalog disclosure

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Make **Archived** Options first-class on the **Option detail page** and
reachable again from the **Catalog**.

An Archived Option's detail page renders its header, "Recency" section,
"Actions", "Details", and merged "History" section normally — archiving hides
an Option from ranking without hiding its record. The as-built page has **no
Score block**, so there is **no "Archived — not ranked" label** to render
(the background PRD's instruction is moot — the code wins). What the Archived
path drives is `rankOption`'s `score: null` branch: `rankOption` returns
`score: null` when the `target` is not among `activeOptions`, while still
computing the factual `recencyDays`, `neverEaten`, and per-Tag `tags` chips —
so the "Recency" section's `RowChips` render unchanged for an Archived Option.
The page passes the active Catalog (`getTonightData`) and the Option's own
`getOptionLog` straight to `rankOption`; per-Option recency derives from the
Option's own `targetLog` regardless of Active/Archived state, while per-Tag
recency derives from the active carriers only — an Archived Option's own Log
history does not move its own Tag chips.

The page's Archive control becomes an **Archive / Un-archive toggle** in
`OptionControls`: an `active` Option offers Archive (behind the §17 confirm),
an Archived one offers **Un-archive**, which runs in one tap (it is benign —
it only restores the Option), keeps the member on the page, and turns it back
into a normal ranked detail page. **Un-archive** is the one genuinely new
server action: `unarchiveOption(optionId)` in `app/catalog/actions.ts` —
`authedAction`-wrapped, sets `active = true`, runs through the shared
`revalidateCatalog()` (so it revalidates `/catalog` and `/catalog/[id]`),
mirroring `archiveOption`. As a thin `authedAction` DB write it gets no
dedicated test.

Archived Options are reached again via a new collapsed **"Archived"
disclosure** in `app/catalog/catalog-screen.tsx`, pinned at the bottom after
the Home meals and Restaurants sections — the same disclosure pattern as
Tonight's "Rejected tonight". The button reads `Archived (N)`; expanded, it
lists each Archived Option as a `next/link` to its `/catalog/[id]` detail page.
It is rendered only when something is Archived (`archived.length > 0`), so the
active Catalog reads exactly as before. `db/queries.ts` gains
`getArchivedOptions()` — `active = false` Options ordered by name, narrowed to
the `{ id, name }` (`ArchivedOption`) the disclosure links — and the Catalog
page passes its result into `CatalogScreen`.

`lib/ranking.test.ts` is extended to cover the Archived case: an Archived
`target` (absent from `activeOptions`) returns `score: null` while its
`recencyDays` and `neverEaten` are still computed from `targetLog`, and per-Tag
recency counts only active carriers of a Tag — an Archived Option's own Log
entries do not move its Tag chips, so a Tag with no active carrier caps at
`CAP`.

## Acceptance criteria

- [ ] An Archived Option's detail page renders its header, Recency, Actions, Details, and History sections normally
- [ ] `rankOption` returns `score: null` for an Archived Option (target absent from `activeOptions`) while still computing `recencyDays`, `neverEaten`, and the per-Tag chips
- [ ] The "Recency" section's `RowChips` render for an Archived Option from those still-computed fields
- [ ] `OptionControls`' Archive control is an Archive / Un-archive toggle; Un-archive runs in one tap and keeps the member on the page
- [ ] `unarchiveOption(optionId)` is added to `app/catalog/actions.ts` — `authedAction`-wrapped, sets `active = true`, revalidates `/catalog` and `/catalog/[id]`
- [ ] `app/catalog/catalog-screen.tsx` has a collapsed `Archived (N)` disclosure listing Archived Options as links to their detail pages, rendered only when something is Archived
- [ ] `getArchivedOptions()` returns `active = false` Options as `{ id, name }` ordered by name; the active Catalog list is unchanged
- [ ] `lib/ranking.test.ts` covers the Archived case — `score: null`, recency still computed from `targetLog`, only active Tag carriers count
- [ ] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 25 — Option detail page: the Actions section (OptionControls)
