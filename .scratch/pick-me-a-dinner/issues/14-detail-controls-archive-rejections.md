# 14 — Option detail page: Actions toolbar, Archived Options, Rejection history

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

### Actions toolbar (OptionControls)

The **"Actions" section** of the **Option detail page** — a new client
component `app/catalog/[id]/option-controls.tsx` exporting `OptionControls`,
rendered by `page.tsx` under the "Actions" heading. Following ADR-0007, it
carries every control that makes sense for an **Option** so the Household can
act on it from its full view, not only from the screen that happens to carry
each control.

`OptionControls` takes the `OptionWithTags`, the full `allTags` list,
`placesEnabled`, and a `canDelete` boolean. It renders a wrapping toolbar row:
**Edit**, **Archive** (or **Un-archive** — the toggle is completed in the
Archived-Options work below; the Archive side ships first), a conditional
**Delete**, and — pinned to the row's right edge — **Reject** and the shared
**`PickButton`**. Every control reuses an existing server action:
`pickTonight` (via `PickButton`), `rejectOption`, `updateOption` (via the
reused `OptionForm`), `archiveOption`, and `deleteOption`.

**Edit** swaps the whole component for the reused `OptionForm` inline
(`kind`, `initial`, `allTags`, `placesEnabled`, with `onCancel` / `onSaved`
collapsing it); a save revalidates `/catalog/[id]` so the page's fields and
Recency refresh in place. **Reject** toggles an inline reason form on the row
(an autofocused optional-reason text input with Submit and Cancel); Submit
calls `rejectOption(option.id, reason)` and, on the typed `{ ok: false }`
result of a same-day collision, shows the error inline rather than letting it
500. **Archive** and **Delete** each take a §17 inline-confirm step
("Archive · Cancel" / "Delete · Cancel"), consistent with the Catalog row and
`DESIGN.md` — a destructive action cannot be triggered with a single mis-tap.

The **Delete** control renders only when `canDelete` is true — `page.tsx`
passes `optionLog.length === 0`, since the **Hard-delete** rule (ADR-0001)
blocks deleting an Option with Log entries, so the control is hidden rather
than shown to fail. `runDelete` still keeps an inline-error path as a guard
against a Log entry being added between page load and the click. A successful
Delete uses `useRouter().push("/catalog")` to send the member back to the
Catalog screen, since the Option no longer exists; a blocked Delete shows the
inline error and keeps the page. Pick, Reject, and Edit update the page in
place — the reused actions revalidate `/catalog/[id]`.

This slice also extends the reused actions' revalidation: `app/catalog/actions.ts`
gains a `revalidateCatalog()` helper that revalidates `/catalog` **and**
`/catalog/[id]` (`revalidatePath("/catalog/[id]", "page")`), called from
`updateOption`, `archiveOption`, and `deleteOption`; `rejectOption`'s
revalidation in `app/rejection-actions.ts` likewise adds `/catalog/[id]`. The
existing `/`, `/catalog`, and `/log` targets are kept — a control behaves
identically wherever it is invoked (ADR-0007).

### Archived Options: detail page + Un-archive + Catalog disclosure

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

### Rejection history (Rejection rows in the merged History + Bring-back parity)

This slice completes the **Rejection** half of the **Option detail page**'s
single merged **History** section. The as-built page has **no separate
"Rejection history" section** — a **Rejection** is rendered inline within the
same date-grouped History list built in ticket 13, beside that day's logged
dinners. This work makes that Rejection rendering correct and fully
interactive.

The History section's data comes from `getOptionRejections(option.id)` in
`db/queries.ts` — every `rejections` row for the Option, joined to its Option,
ordered newest `rejected_on` first (`created_at` breaking a same-day tie),
returned as the same `LogRejectionRow` shape the Log screen consumes. Unlike
the Tonight queries it is **not** filtered to active Options, since the detail
page serves an Archived Option's Rejection history too. `groupByDay` (ticket
13) interleaves these Rejections with the Option's Log entries into per-date
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
no Rejection rows — the History section's empty state (ticket 13) covers the
no-history-at-all case.

No new server action is added for the Rejection-history work — `getOptionRejections`
and the reused `RejectionRow` are the whole of it.

## Acceptance criteria

- [ ] `app/catalog/[id]/option-controls.tsx` exports `OptionControls`, rendered under the page's "Actions" heading
- [ ] The toolbar offers Edit, Archive, a conditional Delete, Reject, and a `PickButton`, each reusing its existing server action
- [ ] Edit swaps the controls for the reused `OptionForm` inline; a save revalidates `/catalog/[id]` and refreshes the page
- [ ] Reject opens an inline optional-reason form; a same-day collision shows the typed-result error inline
- [ ] Archive and Delete each take a §17 inline-confirm step
- [ ] Delete renders only when the Option has no Log entries (`canDelete`)
- [ ] A successful Delete routes to `/catalog`; a Delete blocked by the Hard-delete rule shows an inline error and keeps the page
- [ ] `updateOption` / `archiveOption` / `deleteOption` and `rejectOption` revalidate `/catalog/[id]` alongside their existing targets
- [ ] An Archived Option's detail page renders its header, Recency, Actions, Details, and History sections normally
- [ ] `rankOption` returns `score: null` for an Archived Option (target absent from `activeOptions`) while still computing `recencyDays`, `neverEaten`, and the per-Tag chips
- [ ] The "Recency" section's `RowChips` render for an Archived Option from those still-computed fields
- [ ] `OptionControls`' Archive control is an Archive / Un-archive toggle; Un-archive runs in one tap and keeps the member on the page
- [ ] `unarchiveOption(optionId)` is added to `app/catalog/actions.ts` — `authedAction`-wrapped, sets `active = true`, revalidates `/catalog` and `/catalog/[id]`
- [ ] `app/catalog/catalog-screen.tsx` has a collapsed `Archived (N)` disclosure listing Archived Options as links to their detail pages, rendered only when something is Archived
- [ ] `getArchivedOptions()` returns `active = false` Options as `{ id, name }` ordered by name; the active Catalog list is unchanged
- [ ] `lib/ranking.test.ts` covers the Archived case — `score: null`, recency still computed from `targetLog`, only active Tag carriers count
- [ ] `getOptionRejections(optionId)` returns every `rejections` row for the Option as `LogRejectionRow`, newest `rejected_on` first, not filtered to active Options
- [ ] The detail page renders each Rejection inside the merged History section's date groups, after that date's logged dinners
- [ ] Rejections are rendered with the reused `RejectionRow` component from `app/log/rejection-row.tsx`
- [ ] A Rejection can be edited inline (Option, date, reason) and deleted via §17 inline-confirm from the History section
- [ ] An edit or delete of a Rejection revalidates `/catalog/[id]` and refreshes the page in place
- [ ] A Rejection's optional reason renders as a quiet line; a Rejection with no reason renders cleanly without one
- [ ] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 10 — Rejections: reject/suppress + uniqueness
- 13 — Option detail page: core, merged History, Option-name links
