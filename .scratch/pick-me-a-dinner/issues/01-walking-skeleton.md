# 01 — Walking skeleton: scaffold, schema, design foundation

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/pick-me-a-dinner-v1/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The walking skeleton that wires the whole stack end-to-end. Scaffold the Next.js
(App Router) + TypeScript + Tailwind app, add Drizzle ORM (`postgres-js` driver)
against PostgreSQL, and define the schema with the first generated migration.
The lazy DB client lives in `db/index.ts`: `postgres(process.env.DATABASE_URL ??
"")` opens no socket until the first query, so `next build` runs with no
`DATABASE_URL` (every data page is `force-dynamic`). The app boots, the first
migration applies cleanly to an empty Postgres database, and the root route
renders inside the shared centered-column primitive.

The Drizzle schema (`db/schema.ts`) defines the v1 tables. `options`: `id uuid
pk defaultRandom`, `name text notNull`, `kind` — a `pgEnum("option_kind",
["home","restaurant"])` — `notNull`, `url text` null, `notes text` null,
`active boolean notNull default true`, `created_at timestamptz notNull
defaultNow`, plus the restaurant-only nullable fields `address`, `phone`, `lat`
/ `lng` (`doublePrecision`), `google_place_id`, `maps_url`. `tags`: `id uuid
pk`, `name text notNull`, with a **`uniqueIndex` on `lower(name)`** named
`tags_lower_name_unique` (case-insensitive uniqueness, no `citext`).
`option_tags`: `option_id` / `tag_id` uuid FKs, **both `ON DELETE CASCADE`**, a
composite `primaryKey(option_id, tag_id)`, and a separate `index` on `tag_id`
(`option_tags_tag_id_idx` — Postgres does not auto-index FK columns).
`dinner_log`: `id uuid pk`, `option_id` uuid FK **`ON DELETE RESTRICT`**,
`eaten_on date notNull` (may be past, today, or future), `note text` null,
`created_at timestamptz notNull defaultNow`, and a **`unique(option_id,
eaten_on)`** constraint named `dinner_log_option_eaten_on_unique`. (The shipped
schema also carries a `rejections` table — that is a later phase; v1 is the four
tables above.)

Implement the design foundation as CSS custom properties in `app/globals.css`
plus matching Tailwind theme tokens in `tailwind.config.ts`, so every later
screen consumes shared tokens with no per-screen hex literal. Build the *current*
cool-grey functional-color [`DESIGN.md`](../DESIGN.md) system — the v1 PRD's
"§16 warm palette" is dead. The neutral base is `bg #f3f4f6`, `surface #ffffff`,
`raised #e8eaed`, `ink #25282d`, `muted #767a82`, `line #d8dade`. Two functional
color channels: the meal-kind hues `kind-home #2c6e6e` (teal) / `kind-restaurant
#7a4f6b` (plum) for the 3px left bar, and the recency-heatmap anchor stops
`recency-overdue #3f8a4a` / `recency-mid #c8b78f` / `recency-recent #c4453a`.
Plus `action #2c2f36` (the charcoal Pick fill) / `action-hover` / `action-ink`,
`success`, `danger`, `planned`, `exclude`, and the `*-wash` tints, in both the
light token set and a derived dark `@media (prefers-color-scheme: dark)` set.
Lay in the type scale — Fraunces (display) via `next/font/google`, Geist and
Geist Mono (body / data) from the `geist` package, each exposed as a CSS
variable on `<html>` in `app/layout.tsx` — the `--text-*` / `--weight-*` sizes,
the 4px-base spacing scale, the `control`/`input`/`badge` radii, motion
durations, and the `.column` primitive (max-width 560px phone / 700px desktop,
720px `desktop` breakpoint). This ticket lays only the *token* foundation;
`lib/recency-color.ts` and the per-row meal-kind bar are built in ticket 04.

Add `.env.example` with placeholders only for `DATABASE_URL`, `APP_PASSWORD`,
`APP_SECRET`, `APP_TZ`, `GOOGLE_PLACES_API_KEY` (optional). `drizzle.config.ts`
points at `db/schema.ts`, outputs to `./drizzle`, dialect `postgresql`;
migration files are version-controlled and nothing applies them automatically.
Configure two Vitest projects: `vitest.config.ts` for the pure-logic and
component suites (`pnpm test`, excludes `*.db.test.ts` and
`.claude/worktrees/**`) and `vitest.config.db.ts` for the database integration
suite (`pnpm test:db`, includes only `*.db.test.ts`, `fileParallelism: false`,
a `globalSetup` that creates and migrates a per-worktree test database).

## Acceptance criteria

- [ ] `next dev` boots and the root route renders inside the `.column`
      centered-column primitive (max-width 560px phone / 700px desktop, 720px
      `desktop` breakpoint)
- [ ] `db/schema.ts` defines `options`, `tags`, `option_tags`, `dinner_log`
      with the exact constraints: the `option_kind` enum, the `lower(name)`
      unique index on `tags`, `ON DELETE CASCADE` on both `option_tags` FKs +
      its composite PK + `tag_id` index, `ON DELETE RESTRICT` on
      `dinner_log.option_id`, and `unique(option_id, eaten_on)` on `dinner_log`
- [ ] `db/index.ts` builds a lazy `postgres-js` Drizzle client that opens no
      socket on import, so `next build` runs with no `DATABASE_URL`
- [ ] The first migration is generated under `drizzle/`, committed, and applies
      cleanly to an empty Postgres database
- [ ] The cool-grey `DESIGN.md` palette (neutral base, the two color channels —
      `kind-home`/`kind-restaurant` and the `recency-*` heatmap stops — plus
      `action`/`success`/`danger`/`planned`/`exclude`/`*-wash`), the
      Fraunces/Geist/Geist Mono type scale, and the 4px spacing scale exist as
      CSS custom properties in `app/globals.css` + Tailwind theme tokens in
      `tailwind.config.ts`, with a derived dark token set; no per-screen hex
      literals
- [ ] `.env.example` lists the five env vars with placeholder values only
- [ ] Both Vitest configs run — `pnpm test` (unit) and `pnpm test:db`
      (integration), the latter scoped to `*.db.test.ts`

## Blocked by

None — can start immediately.
