# 03 — Tags on Options

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Tag attachment on the Catalog Option form. The Household attaches Tags to an
Option via the `TagInput` autocomplete token input (`app/catalog/tag-input.tsx`):
typing filters the existing-Tag suggestions and offers a `Create "…"` row for
free text; Enter, comma, or a click adds the Tag, Backspace on an empty field
removes the last token. The component is an ARIA combobox — `role="combobox"`,
`aria-expanded`, `aria-autocomplete="list"` over a `role="listbox"` of
`role="option"` rows. There is no separate Tags-management screen — this token
input is the only place Tags are created or changed. A Tag that ends up with no
Options simply stops appearing anywhere; that is harmless and needs no cleanup.

Introduce the shared `normalizeTag` helper (`lib/normalize-tag.ts`) — a small,
*pure* function that returns `raw.trim().toLowerCase()`. Every Tag passes
through it: `TagInput` normalizes on the way in so the tokens shown are already
canonical, and the server action normalizes again before any DB write.
`normalizeTag` is a *shared* helper because the import script (ticket 09) must
normalize identically — the two call sites (the Catalog tag-attach path and the
import script) cannot drift and bypass the `tags.lower(name)` unique index. A
shared helper is the chosen module shape precisely because two call sites must
agree.

Tag persistence lives in `app/catalog/actions.ts` as `syncOptionTags(tx,
optionId, rawTags)`, called inside the same `createOption` / `updateOption`
transaction from ticket 02. It normalizes and dedupes the incoming Tag set
(`new Set(rawTags.map(normalizeTag).filter(...))`), deletes the Option's
existing `option_tags` rows, then re-inserts. Each Tag name is resolved to its
row id by `resolveTagId(tx, name)`: an `insert(tags).onConflictDoNothing()`
against the `lower(name)` unique index, falling back to a `select` — and
retried once, because under a concurrent same-Tag insert the loser's first
`select` can miss the winner's not-yet-committed row. So adding "Pasta" when
"pasta" already exists reuses the existing row rather than duplicating it. Tag
edits are not retroactive — that only matters once ranking exists (ticket 04),
but the data model here must not assume otherwise.

## Acceptance criteria

- [x] The Catalog `OptionForm` has the `TagInput` autocomplete token input —
      an ARIA combobox that suggests existing Tags and offers a `Create "…"`
      row for free text
- [x] `normalizeTag` is a shared pure function that trims and lowercases; both
      `TagInput` and the tag-attach server path (and later the import script)
      call it
- [x] `syncOptionTags` runs inside the `createOption`/`updateOption`
      transaction, normalizes + dedupes the Tag set, and `resolveTagId` reuses
      an existing Tag for a case-insensitive match — adding "Pasta" when "pasta"
      exists creates no duplicate `tags` row
- [x] Tags attach/detach via `option_tags` rows and persist across reloads
- [x] `lib/normalize-tag.test.ts` covers: trims, lowercases, leaves an
      already-normal Tag unchanged

## Blocked by

- 02 — Catalog: Options CRUD

## Comments

- 2026-05-19: Added the shared `lib/normalize-tag.ts` pure helper (trim + lowercase) and its unit test; introduced `app/catalog/tag-input.tsx` as the ARIA combobox token input — `role="combobox"` / `aria-expanded` / `aria-autocomplete="list"` over a `role="listbox"` of `role="option"` rows, with Enter/comma/click to commit and Backspace-on-empty to remove the last token. `normalizeTag` runs on the way in so the tokens displayed are already canonical. `syncOptionTags(tx, optionId, rawTags)` and `resolveTagId(tx, name)` live in `app/catalog/actions.ts`; both `createOption` and `updateOption` call `syncOptionTags` inside their existing `db.transaction`. `resolveTagId` uses `insert(tags).onConflictDoNothing()` against the `lower(name)` unique index (the table has exactly one unique index, so no explicit target is needed) with a `select` fallback, retried once for the concurrent-insert race. The Catalog page now fetches `getAllTagNames()` alongside `getActiveCatalog()` and threads `tagSuggestions` through `CatalogScreen` → `OptionSection` → `OptionForm`/`OptionRow`. Tests: `lib/normalize-tag.test.ts` (trims, lowercases, leaves an already-normal Tag unchanged), `app/catalog/tag-input.test.tsx` (combobox/listbox roles, Create row for free text, Enter/comma/Backspace, dedupe, suggestion click, hidden inputs), and extended `actions.db.test.ts` for the case-insensitive reuse ("Pasta" + "pasta" → one `tags` row) and the normalize-and-dedupe path on update. Gate green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
