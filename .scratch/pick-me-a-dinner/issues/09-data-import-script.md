# 09 — Prior-version data import script

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

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

- [ ] `mapPriorData` maps `Meal` / `Restaurant` / `Dinner` into `options` /
      `tags` / `option_tags` / `dinner_log` rows with fresh uuids and rewired
      `Dinner` FKs; an unresolvable FK throws before any DB write
- [ ] `hidden` is inverted to `active`; `orderUrl` / `menuUrl` coalesce into
      one `url`; `phoneNumber` → `phone`
- [ ] Tags are normalized via the shared `normalizeTag` helper and deduped
      across all Options into `tags` + `option_tags`
- [ ] `dinner_log.created_at` is set to the Dinner's date at local midnight in
      `APP_TZ` (`localMidnightUtc`); absent Restaurant / Home fields import as
      `null`
- [ ] `runImport` maps outside the transaction, then inserts all four tables in
      one `db.transaction` that rolls back fully on any failure
- [ ] `scripts/import-prior-data.db.test.ts` covers mapping correctness
      (`hidden→active` inverted, `url` coalesced, tags normalized + deduped,
      the `created_at` local-midnight rule) and the all-or-nothing rollback

## Blocked by

- 03 — Tags on Options (needs the shared `normalizeTag` helper)
