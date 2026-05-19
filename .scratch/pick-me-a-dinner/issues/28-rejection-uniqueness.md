# 28 — Rejection uniqueness: UNIQUE(option_id, rejected_on)

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Add a `UNIQUE(option_id, rejected_on)` constraint to the `rejections` table so the same **Option** cannot carry two **Rejections** for one date. This is the foundation of Phase 6: once Rejections become manually creatable and freely dated (ticket 31), a date can be revisited by hand, and ADR-0008 records that this constraint is now required — explicitly superseding ADR-0006's note that no such constraint was needed while Rejections were live-only.

Declare the constraint in `db/schema.ts` on the existing `rejections` `pgTable`. Its third-argument callback already returns `index("rejections_rejected_on_idx").on(t.rejectedOn)`; add a second entry to that array, `unique("rejections_option_rejected_on_unique").on(t.optionId, t.rejectedOn)`, and import `unique` from `drizzle-orm/pg-core`. The exported `Rejection` type (`typeof rejections.$inferSelect`) does not change. Update the table's doc comment to state that `(option_id, rejected_on)` is unique because manual dated entry (ADR-0008) means the same date can be revisited — superseding ADR-0006's live-only reasoning.

Generate the migration with `drizzle-kit`. The shipped repo holds it as `drizzle/0003_motionless_nomad.sql`, a single statement: `ALTER TABLE "rejections" ADD CONSTRAINT "rejections_option_rejected_on_unique" UNIQUE("option_id","rejected_on");`. It follows `0002_aberrant_silver_sable.sql`, which created the `rejections` table with its `rejected_on` index but no unique constraint. The migration is applied out-of-band per the deploy model, and `drizzle/meta/` must be regenerated alongside it so the migration journal stays consistent.

Adding the constraint is safe against existing data, dev and prod alike. Live rejecting (`rejectOption`, Phase 4) only ever writes a Rejection dated today, and a today-rejected Option is suppressed off Tonight for the rest of the day — so no `rejections` table can already hold a conflicting `(option_id, rejected_on)` pair when the migration runs. No data backfill or de-duplication step is needed.

The constraint produces a Postgres `23505` unique-violation on a colliding insert or update; mapping that error code to an inline message is ticket 31's server-action work, not this ticket. This ticket lands only the schema declaration and the migration.

## Acceptance criteria

- [ ] `db/schema.ts` declares `unique("rejections_option_rejected_on_unique").on(t.optionId, t.rejectedOn)` in the `rejections` table callback, alongside the existing `rejections_rejected_on_idx` index
- [ ] `unique` is imported from `drizzle-orm/pg-core`
- [ ] The exported `Rejection` type (`typeof rejections.$inferSelect`) is unchanged
- [ ] A new Drizzle migration (`drizzle/0003_*.sql`) holds the single `ALTER TABLE "rejections" ADD CONSTRAINT "rejections_option_rejected_on_unique" UNIQUE("option_id","rejected_on");` statement, following `0002`
- [ ] `drizzle/meta/` is regenerated so the migration journal stays consistent
- [ ] The migration applies cleanly against an existing `rejections` table — no data backfill or de-duplication needed
- [ ] The `rejections` table doc comment explains the constraint is required because manual dated entry (ADR-0008) allows the same date to be revisited, superseding ADR-0006
- [ ] No mapping of the `23505` error to an inline message is added here — that is ticket 31's work

## Blocked by

- 19 — Reject and suppress (adds the `UNIQUE` constraint to the
  `rejections` table created there; migration `0003` follows `0002`. The
  Phase 5 detail-page work is unrelated to this schema change)
