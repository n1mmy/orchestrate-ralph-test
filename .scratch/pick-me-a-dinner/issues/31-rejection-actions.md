# 31 — Rejection-management server actions + Log Rejections queries

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/dated-rejections/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Build the server layer for managing dated **Rejections** — the actions and the queries, no UI (the UI is tickets 32 and 33). Every write to the `rejections` table lives in one module, `app/rejection-actions.ts`, so the `(option_id, rejected_on)` collision is handled in exactly one place. Phase 4's live-Tonight `rejectOption` is folded into this same module rather than left in a Tonight-scoped file — the `23505` insert handling is then shared by every create path.

Add a shared private `recordRejection(optionId, rejectedOn, reason)` core: it inserts a `rejections` row, storing an empty or whitespace-only reason as `null` (via `trimToNull`), revalidates the three Rejection views, and maps a driver error to an inline message; the date is assumed already validated by the caller. Both `createRejection` and `rejectOption` delegate to it. A shared `rejectionWriteError` helper translates an expected Postgres error via `pgErrorMessage`: a `23505` `(option_id, rejected_on)` collision becomes `"Already rejected for that date"` and a `22P02` / `23503` malformed-or-stale Option id becomes `"That option is no longer available"`; anything else rethrows as a 500.

Three new `authedAction`-wrapped actions, written as thin DB writes consistent with `logForDate` / `updateLogEntry` / `deleteLogEntry`:

- `createRejection(optionId, rejectedOn, reason)` — validate the date with `isValidSqlDate` (a blank or malformed date returns `{ ok: false, error: "Pick a valid date" }`), then delegate to `recordRejection`. Returns an `ActionResult`.
- `updateRejection(id, { optionId, rejectedOn, reason })` — validate the date, then `db.update(rejections)` by `id` setting `optionId` / `rejectedOn` / `trimToNull(reason)`, mapping a driver error through `rejectionWriteError`. A collision is reported inline, never silently merged.
- `deleteRejection(id)` — `db.delete(rejections)` by `id`, then revalidate. Returns `void`. The row is removed entirely so it stops feeding AI search (ADR-0006). This is also the action behind Tonight's "Bring back" — bringing back a today-dated Rejection is the same row delete, so there is one shared action, not a duplicate.

`rejectOption(optionId, reason)` is kept (or moved into this module): it is "create a Rejection dated today" — it computes the Household's `today()` and delegates to `recordRejection`, inheriting the `23505` handling so a double-tap or an already-rejected Option returns the inline collision error rather than a 500. A shared `revalidateRejectionViews()` revalidates `/`, `/log`, and `/catalog/[id]` ("page"): a Rejection dated today changes Tonight's suppression, the Log renders it, and the Option detail page shows it.

Add three queries to `db/queries.ts`. `getLogRejections()` — every `rejections` row (past, today, future) joined to its Option, narrowed to a new `LogRejectionRow` shape (`id`, `optionId`, `optionName`, `kind`, `rejectedOn`, `reason`), ordered `desc(rejectedOn)` then `asc(options.name)`; the counterpart of `getLog`, not filtered to active Options. `getOptionRejections(optionId)` — the same `LogRejectionRow` shape scoped to one Option id, ordered `desc(rejectedOn)` then `desc(createdAt)`, not filtered to active Options. `getOptionChoices()` — every Option (Active and Archived alike) as `{ id, name, kind }` picker choices, ordered by name, so an entry logged against an Archived Option stays selectable. (If Phase 5 already added `getOptionChoices`, reuse it.)

Add `app/rejection-actions.db.test.ts`, modelled on `app/log/actions.db.test.ts`: it `vi.mock`s `next/cache` and `lib/require-session`, truncates between tests, and integration-tests the actions against the real test database. Cover create (inserts a dated row; stores a whitespace reason as `null`; rejects a blank/malformed date; reports a stale Option id; the duplicate `(option_id, rejected_on)` collision returns the inline error, not a throw), update (changes Option/date/reason; clears a reason to `null`; rejects a blank date; the duplicate collision returns the inline error and leaves the row untouched), delete (removes the row), `rejectOption` (dates the Rejection to the Household's calendar day; the already-rejected-today collision returns the inline error), and the `getLogRejections` / `getOptionRejections` queries.

## Acceptance criteria

- [ ] `app/rejection-actions.ts` holds `createRejection`, `updateRejection`, `deleteRejection`, and `rejectOption`, all `authedAction`-wrapped, rejecting an unauthenticated caller
- [ ] A shared `recordRejection` core backs both `createRejection` and `rejectOption`; a shared `rejectionWriteError` maps `23505` → "Already rejected for that date" and `22P02`/`23503` → "That option is no longer available"
- [ ] Create and update validate the date with `isValidSqlDate`, store an empty/whitespace reason as `null`, and reject an invalid date with `{ ok: false, error: "Pick a valid date" }`
- [ ] A duplicate `(option_id, rejected_on)` on create or update returns the inline collision error rather than throwing; the row is left untouched on a failed update
- [ ] `deleteRejection` removes the `rejections` row entirely and returns `void`; it is the one shared action behind Tonight's "Bring back"
- [ ] `rejectOption` dates the Rejection to the Household's `today()` and inherits the `23505` handling
- [ ] A shared `revalidateRejectionViews()` revalidates `/`, `/log`, and `/catalog/[id]`
- [ ] `db/queries.ts` exports `getLogRejections()` (all Rejections, joined, `desc(rejectedOn)` then `asc(name)`), `getOptionRejections(optionId)` (one Option, `desc(rejectedOn)` then `desc(createdAt)`), both as `LogRejectionRow`, and `getOptionChoices()` covering Active and Archived Options
- [ ] `app/rejection-actions.db.test.ts` integration-tests create / update / delete / `rejectOption` and the new queries against the real test database, including both collision paths, modelled on `app/log/actions.db.test.ts`

## Blocked by

- 20 — Rejected tonight disclosure (folds `rejectOption` /
  `deleteRejection` in `app/rejection-actions.ts` into the shared module)
- 28 — Rejection uniqueness: UNIQUE(option_id, rejected_on) (the actions
  map the `23505` collision the constraint produces)
