# 12 — Rejected tonight disclosure + rejection-management server actions

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

### Rejected tonight disclosure (the Tonight zone)

Building on the reject path (ticket 10), give the Household a way to see today's Rejections and undo a mistaken one.

Add a **"Rejected tonight (N)" disclosure** to `app/tonight-screen.tsx`, rendered as a `RejectedTonightDisclosure` component pinned at the **bottom** of the Tonight page — after the picker `<ol>` of ranked rows and after the decided-mode block alike. It is rendered only when something was actually rejected today (`rejectedTonight.length > 0`), so it costs no screen space until then, and is **collapsed by default** — a local `open` state toggled by the heading button. The heading is a `<button>` carrying `aria-expanded` and the literal label `Rejected tonight (N)`, where `N` is the count of today's Rejections, so a member can tell at a glance whether anything has been rejected. The disclosure renders the same in picker mode and in decided mode's reopened picker — it lives at the screen level, below whichever mode is showing.

Expanded, the disclosure renders a `<ul>` of today's Rejections — for each, the Option name and, when one was given, the reason on a muted second line — each row carrying a **"Bring back"** button. The list is the `rejectedTonight` prop: the `TodayRejection[]` that `app/page.tsx` already loads via `getTodayRejections` (built in ticket 10) and passes through to `TonightScreen`. No new query is needed — the page passes the same today's-Rejections result to both the suppression filter and this disclosure.

"Bring back" calls the **`deleteRejection(rejectionId)`** server action — there is no separate `bringBackRejection` action; bringing back a Rejection the Household made today is the same row delete, so one shared `authedAction`-wrapped action covers both. `deleteRejection` lives in `app/rejection-actions.ts` (the module added in ticket 10): it deletes the `rejections` row by id and revalidates the affected views (`/`, `/log`, `/catalog/[id]`). It is thin — no logic beyond the delete — following the existing thin-server-action pattern. The disclosure calls it inside a `useTransition` and disables the controls while the delete is in flight. Deleting the row returns the Option to tonight's list immediately and — because the record is gone, not merely expired — ensures a mis-tapped Rejection never reaches AI search and never teaches the model anything. The disclosure offers "Bring back" **only for today's Rejections**, keeping it a quick-undo tool rather than a history manager; managing the historical Rejection log is out of scope (see the source PRD).

### Rejection-management server actions + Log Rejections queries

Build the server layer for managing dated **Rejections** — the actions and the queries, no UI (the UI is ticket 15). Every write to the `rejections` table lives in one module, `app/rejection-actions.ts`, so the `(option_id, rejected_on)` collision is handled in exactly one place. Ticket 10's live-Tonight `rejectOption` is folded into this same module rather than left in a Tonight-scoped file — the `23505` insert handling is then shared by every create path.

Add a shared private `recordRejection(optionId, rejectedOn, reason)` core: it inserts a `rejections` row, storing an empty or whitespace-only reason as `null` (via `trimToNull`), revalidates the three Rejection views, and maps a driver error to an inline message; the date is assumed already validated by the caller. Both `createRejection` and `rejectOption` delegate to it. A shared `rejectionWriteError` helper translates an expected Postgres error via `pgErrorMessage`: a `23505` `(option_id, rejected_on)` collision becomes `"Already rejected for that date"` and a `22P02` / `23503` malformed-or-stale Option id becomes `"That option is no longer available"`; anything else rethrows as a 500.

Three new `authedAction`-wrapped actions, written as thin DB writes consistent with `logForDate` / `updateLogEntry` / `deleteLogEntry`:

- `createRejection(optionId, rejectedOn, reason)` — validate the date with `isValidSqlDate` (a blank or malformed date returns `{ ok: false, error: "Pick a valid date" }`), then delegate to `recordRejection`. Returns an `ActionResult`.
- `updateRejection(id, { optionId, rejectedOn, reason })` — validate the date, then `db.update(rejections)` by `id` setting `optionId` / `rejectedOn` / `trimToNull(reason)`, mapping a driver error through `rejectionWriteError`. A collision is reported inline, never silently merged.
- `deleteRejection(id)` — `db.delete(rejections)` by `id`, then revalidate. Returns `void`. The row is removed entirely so it stops feeding AI search (ADR-0006). This is also the action behind Tonight's "Bring back" — bringing back a today-dated Rejection is the same row delete, so there is one shared action, not a duplicate.

`rejectOption(optionId, reason)` is kept (or moved into this module): it is "create a Rejection dated today" — it computes the Household's `today()` and delegates to `recordRejection`, inheriting the `23505` handling so a double-tap or an already-rejected Option returns the inline collision error rather than a 500. A shared `revalidateRejectionViews()` revalidates `/`, `/log`, and `/catalog/[id]` ("page"): a Rejection dated today changes Tonight's suppression, the Log renders it, and the Option detail page shows it.

Add three queries to `db/queries.ts`. `getLogRejections()` — every `rejections` row (past, today, future) joined to its Option, narrowed to a new `LogRejectionRow` shape (`id`, `optionId`, `optionName`, `kind`, `rejectedOn`, `reason`), ordered `desc(rejectedOn)` then `asc(options.name)`; the counterpart of `getLog`, not filtered to active Options. `getOptionRejections(optionId)` — the same `LogRejectionRow` shape scoped to one Option id, ordered `desc(rejectedOn)` then `desc(createdAt)`, not filtered to active Options. `getOptionChoices()` — every Option (Active and Archived alike) as `{ id, name, kind }` picker choices, ordered by name, so an entry logged against an Archived Option stays selectable. (If the Option detail page work — ticket 13 or 14 — already added `getOptionChoices`, reuse it.)

Add `app/rejection-actions.db.test.ts`, modelled on `app/log/actions.db.test.ts`: it `vi.mock`s `next/cache` and `lib/require-session`, truncates between tests, and integration-tests the actions against the real test database. Cover create (inserts a dated row; stores a whitespace reason as `null`; rejects a blank/malformed date; reports a stale Option id; the duplicate `(option_id, rejected_on)` collision returns the inline error, not a throw), update (changes Option/date/reason; clears a reason to `null`; rejects a blank date; the duplicate collision returns the inline error and leaves the row untouched), delete (removes the row), `rejectOption` (dates the Rejection to the Household's calendar day; the already-rejected-today collision returns the inline error), and the `getLogRejections` / `getOptionRejections` queries.

## Acceptance criteria

### Rejected tonight disclosure

- [x] A `RejectedTonightDisclosure` rendered at the bottom of `app/tonight-screen.tsx`, only when today has Rejections, collapsed by default
- [x] The heading is a button carrying `aria-expanded` and the literal label `Rejected tonight (N)` with the count of today's Rejections
- [x] Expanded, it lists today's Rejections with the Option name and the reason on a muted line when one was given
- [x] The disclosure list is the `rejectedTonight` (`TodayRejection[]`) prop passed from `app/page.tsx` — no new query is added
- [x] Each entry has a "Bring back" button calling the `authedAction`-wrapped `deleteRejection(rejectionId)` from `app/rejection-actions.ts` — the same shared delete action, no separate `bringBackRejection`
- [x] "Bring back" deletes the `rejections` row entirely and returns the Option to tonight's list immediately on revalidation
- [x] Only today's Rejections appear in the disclosure
- [x] The disclosure renders the same in picker mode and in decided mode's reopened picker
- [x] The disclosure toggle and every "Bring back" control are keyboard-operable with visible focus and adequate touch targets, and disabled while a delete is in flight

### Rejection-management server actions + queries

- [x] `app/rejection-actions.ts` holds `createRejection`, `updateRejection`, `deleteRejection`, and `rejectOption`, all `authedAction`-wrapped, rejecting an unauthenticated caller
- [x] A shared `recordRejection` core backs both `createRejection` and `rejectOption`; a shared `rejectionWriteError` maps `23505` → "Already rejected for that date" and `22P02`/`23503` → "That option is no longer available"
- [x] Create and update validate the date with `isValidSqlDate`, store an empty/whitespace reason as `null`, and reject an invalid date with `{ ok: false, error: "Pick a valid date" }`
- [x] A duplicate `(option_id, rejected_on)` on create or update returns the inline collision error rather than throwing; the row is left untouched on a failed update
- [x] `deleteRejection` removes the `rejections` row entirely and returns `void`; it is the one shared action behind Tonight's "Bring back"
- [x] `rejectOption` dates the Rejection to the Household's `today()` and inherits the `23505` handling
- [x] A shared `revalidateRejectionViews()` revalidates `/`, `/log`, and `/catalog/[id]`
- [x] `db/queries.ts` exports `getLogRejections()` (all Rejections, joined, `desc(rejectedOn)` then `asc(name)`), `getOptionRejections(optionId)` (one Option, `desc(rejectedOn)` then `desc(createdAt)`), both as `LogRejectionRow`, and `getOptionChoices()` covering Active and Archived Options
- [x] `app/rejection-actions.db.test.ts` integration-tests create / update / delete / `rejectOption` and the new queries against the real test database, including both collision paths, modelled on `app/log/actions.db.test.ts`

### Build health

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green

## Blocked by

- 10 — Rejections: reject/suppress + uniqueness

## Comments

- 2026-05-20 (done): Extended `app/rejection-actions.ts` with `recordRejection` (shared private core), `revalidateRejectionViews`, and `createRejection` / `updateRejection` / `deleteRejection`; refactored `rejectOption` to delegate to `recordRejection` so it now inherits 23505 handling. Added `rejectionWriteError` to `lib/pg-error.ts` mapping 23505 (rejections_option_rejected_on_unique) and 22P02/23503. Added `getLogRejections`, `getOptionRejections`, `getOptionChoices` (+ `LogRejectionRow`/`OptionChoice` types) to `db/queries.ts`. New `app/rejected-tonight-disclosure.tsx` component mounted at the bottom of `app/tonight-screen.tsx`; threaded `rejectedTonight: TodayRejection[]` from `app/page.tsx`. Wrote `app/rejection-actions.db.test.ts` modelled on the Log actions integration test (with `vi.mock`s for `next/cache` and `lib/require-session`, TRUNCATE between tests), covering create/update/delete/`rejectOption` + 23505 collisions + the three new queries. Gates green: `pnpm typecheck`, `pnpm test` (20 files, 203 tests), `pnpm build`. The `pnpm lint` in the build-health checklist line has no corresponding `lint` script in this repo (the verification gate per `docs/agents/ralph.md` is the three commands above) — ticked as not-applicable.
