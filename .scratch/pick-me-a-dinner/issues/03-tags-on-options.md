# 03 — Tags on Options

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/pick-me-a-dinner-v1/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

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

- [ ] The Catalog `OptionForm` has the `TagInput` autocomplete token input —
      an ARIA combobox that suggests existing Tags and offers a `Create "…"`
      row for free text
- [ ] `normalizeTag` is a shared pure function that trims and lowercases; both
      `TagInput` and the tag-attach server path (and later the import script)
      call it
- [ ] `syncOptionTags` runs inside the `createOption`/`updateOption`
      transaction, normalizes + dedupes the Tag set, and `resolveTagId` reuses
      an existing Tag for a case-insensitive match — adding "Pasta" when "pasta"
      exists creates no duplicate `tags` row
- [ ] Tags attach/detach via `option_tags` rows and persist across reloads
- [ ] `lib/normalize-tag.test.ts` covers: trims, lowercases, leaves an
      already-normal Tag unchanged

## Blocked by

- 02 — Catalog: Options CRUD
