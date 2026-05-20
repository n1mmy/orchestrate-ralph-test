# 04 — Tags on Options + prior-version data import

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Two tightly-coupled scopes that must ship together because the import script
depends on the shared `normalizeTag` helper introduced by the tag-attach work,
and the two call sites cannot drift.

### Tags on Options

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
`normalizeTag` is a *shared* helper because the import script (below) must
normalize identically — the two call sites (the Catalog tag-attach path and the
import script) cannot drift and bypass the `tags.lower(name)` unique index. A
shared helper is the chosen module shape precisely because two call sites must
agree.

Tag persistence lives in `app/catalog/actions.ts` as `syncOptionTags(tx,
optionId, rawTags)`, called inside the same `createOption` / `updateOption`
transaction from ticket 03. It normalizes and dedupes the incoming Tag set
(`new Set(rawTags.map(normalizeTag).filter(...))`), deletes the Option's
existing `option_tags` rows, then re-inserts. Each Tag name is resolved to its
row id by `resolveTagId(tx, name)`: an `insert(tags).onConflictDoNothing()`
against the `lower(name)` unique index, falling back to a `select` — and
retried once, because under a concurrent same-Tag insert the loser's first
`select` can miss the winner's not-yet-committed row. So adding "Pasta" when
"pasta" already exists reuses the existing row rather than duplicating it. Tag
edits are not retroactive — that only matters once ranking exists (ticket 07),
but the data model here must not assume otherwise.

### Prior-version data import

A **one-off script** — `scripts/import-prior-data.ts`, not an ongoing feature —
that imports the prior version's real Catalog and Log history into the v1
schema. This data is the v1 starting point; there is no hand-seed step and no
Cold start.

The prior app was Prisma-backed with tables `Meal` (7), `Restaurant` (21),
`Dinner` (67). The script's pure core, `mapPriorData(prior, timeZone)`, maps
those into v1 `options` / `tags` / `option_tags` / `dinner_log` insert rows:

- `Meal` → `options` `kind='home'`; `Restaurant` → `options`
  `kind='restaurant'`; `Dinner` → `dinner_log`.
- Text cuid `id`s → fresh `randomUUID()`s; an `optionIdByPriorId` map rewires
  the `Dinner` FKs. A `Dinner` referencing neither a `Meal` nor a `Restaurant`,
  or an unresolvable id, **throws before any DB write**.
- `name`, `notes`, `createdAt` → `name`, `notes`, `created_at`.
- `hidden` → `active = !hidden` (inverted).
- `Restaurant.phoneNumber` → `phone`; `orderUrl` / `menuUrl` → `url =
  orderUrl ?? menuUrl ?? null` (never both populated).
- `Meal` / `Restaurant.tags` (`text[]`) → normalized via the shared
  `normalizeTag` helper — the same helper the Catalog tag-attach path uses, so
  the two call sites cannot drift — deduped per Option and across all Options
  into `tags` + `option_tags` rows.
- `Dinner.date` (its `YYYY-MM-DD` head) → `eaten_on`; `Dinner.notes` → `note`;
  `Dinner.type` dropped (redundant with `kind`); `option_id` from the id map.

Import-time defaults for fields the prior schema lacks: `dinner_log.created_at`
is the Dinner's `eaten_on` at **local midnight in `APP_TZ`** — `localMidnightUtc`
resolves the zone offset in two passes so a date whose midnight straddles a DST
change still lands on the correct offset; Restaurant `address` / `lat` / `lng`
/ `google_place_id` / `maps_url` = `null`; Home meal `url` = `null`.

`runImport` maps first (outside the transaction, so a bad FK fails fast without
touching the DB), then inserts all four tables inside a **single
`db.transaction`** — any failure rolls the whole import back, leaving the DB
untouched, so after fixing the offending row it is simply re-run from scratch
against the fresh empty DB. There is no upsert / idempotency machinery. The
script reads its input either from a JSON dump path (`argv[2]`) or, when
`MIGRATE_FROM` is set, straight from the live prior Postgres DB via
`loadPriorDataFromDb`; `DATABASE_URL` and `APP_TZ` come from `.env`.

## Acceptance criteria

### Tags on Options

- [x] The Catalog `OptionForm` has the `TagInput` autocomplete token input —
      an ARIA combobox that suggests existing Tags and offers a `Create "…"`
      row for free text
- [x] `normalizeTag` is a shared pure function that trims and lowercases; both
      `TagInput` and the tag-attach server path (and the import script below)
      call it
- [x] `syncOptionTags` runs inside the `createOption`/`updateOption`
      transaction, normalizes + dedupes the Tag set, and `resolveTagId` reuses
      an existing Tag for a case-insensitive match — adding "Pasta" when "pasta"
      exists creates no duplicate `tags` row
- [x] Tags attach/detach via `option_tags` rows and persist across reloads
- [x] `lib/normalize-tag.test.ts` covers: trims, lowercases, leaves an
      already-normal Tag unchanged

### Prior-version data import

- [x] `mapPriorData` maps `Meal` / `Restaurant` / `Dinner` into `options` /
      `tags` / `option_tags` / `dinner_log` rows with fresh uuids and rewired
      `Dinner` FKs; an unresolvable FK throws before any DB write
- [x] `hidden` is inverted to `active`; `orderUrl` / `menuUrl` coalesce into
      one `url`; `phoneNumber` → `phone`
- [x] Tags are normalized via the shared `normalizeTag` helper and deduped
      across all Options into `tags` + `option_tags`
- [x] `dinner_log.created_at` is set to the Dinner's date at local midnight in
      `APP_TZ` (`localMidnightUtc`); absent Restaurant / Home fields import as
      `null`
- [x] `runImport` maps outside the transaction, then inserts all four tables in
      one `db.transaction` that rolls back fully on any failure
- [x] `scripts/import-prior-data.db.test.ts` covers mapping correctness
      (`hidden→active` inverted, `url` coalesced, tags normalized + deduped,
      the `created_at` local-midnight rule) and the all-or-nothing rollback

## Blocked by

- 03 — Options catalog: CRUD

## Comments

- Shipped `normalizeTag` (`lib/normalize-tag.ts`) + `localMidnightUtc`
  (`lib/local-midnight.ts`), `TagInput` ARIA-combobox token input,
  `syncOptionTags` / `resolveTagId` inside the Catalog `db.transaction`, and
  the one-off `scripts/import-prior-data.ts` with the pure `mapPriorData`
  core and an all-or-nothing `runImport` transaction. Verification gate
  (`pnpm typecheck` / `pnpm test` / `pnpm build`) green.
