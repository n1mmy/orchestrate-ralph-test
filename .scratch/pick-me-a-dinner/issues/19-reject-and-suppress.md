# 19 — Reject and suppress

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The first complete path through **Rejections**, end to end: a member of the Household turns down an **Option** on the **Tonight** picker for tonight's decision, the Option leaves tonight's deterministic list, and it returns on its own the next calendar day. The "Rejected tonight" disclosure (ticket 20) and the AI-search wiring (ticket 21) are deliberately out of this slice.

Add a new `rejections` table to `db/schema.ts`: `id` (uuid pk, `defaultRandom`), `option_id` (uuid, FK → `options.id`, `ON DELETE CASCADE`), `reason` (text, nullable — the reason is optional), `rejected_on` (`date`, not null — the Household's calendar day in `APP_TZ`), `created_at` (timestamptz, not null, `defaultNow`). `ON DELETE CASCADE` ensures a Rejection never blocks an Option's hard-delete (allowed only for an Option with no Log entries — ADR-0001); a Rejection of a hard-deleted Option is meaningless, so it goes with the Option. A Rejection is *not* a Log entry and carries no Score weight. Add an index on `rejected_on` (`rejections_rejected_on_idx`) to support the today's-rejections query; the table is single-household-small, so that is the only index needed at this phase. Export a `Rejection` row type via `typeof rejections.$inferSelect`. Ship a new Drizzle migration, `drizzle/0002_*.sql`, applied out-of-band per the deploy model. (A `UNIQUE(option_id, rejected_on)` constraint is added to this table later, in Phase 6 — ticket 28, dated Rejections — when the same date can be revisited by manual entry; it is not part of this phase's table creation.)

Add the write actions in a new `app/rejection-actions.ts` module — every write to the `rejections` table lives in this one file. Add `rejectOption(optionId, reason)` — `authedAction`-wrapped, returning an `ActionResult`. It computes the Household's calendar day via `today()` (`lib/local-day`), inserts a `rejections` row with `rejected_on` = that day, stores an empty or whitespace-only reason as `null` (via `trimToNull` from `lib/action-result`), and then revalidates the affected views (`/`, and — kept consistent for later phases — `/log` and `/catalog/[id]`). A driver error is mapped to an inline message rather than thrown: a malformed or stale Option id (`22P02` / `23503`) becomes `"That option is no longer available"`. The action is thin — no logic beyond the dated write — following the existing `pickTonight` / `aiSearchAction` pattern. `authedAction`-wrapping is not optional: a Server Action is reachable by id from any route, so the shared-password session check must run; an unauthenticated caller is rejected.

On each Tonight picker row in `app/tonight-row.tsx` add a **secondary, low-emphasis Reject control**, stacked below the primary Pick button on the row's right edge — visually subordinate to Pick (the one-tap `pick = log` action stays the obvious primary). Tapping Reject toggles a local `rejecting` state that inline-expands a reason **form** on the row — not a modal: an `autoFocus` text input placeheld `"Reason (optional)"` with an `aria-label`, plus a **Submit** button and a **Cancel** button. The reason is optional. Submit calls `rejectOption(option.id, reason)` inside a `useTransition`; on `{ ok: true }` it invokes the row's `onRejected` callback (which drives the list's live-region "removed" announcement) and the row drops out on revalidation. Cancel collapses the box and clears the reason with nothing recorded. The two-step (Reject → Submit) is itself the mis-tap guard; there is no separate post-submit undo on the row (the disclosure's "Bring back" covers mistakes, built in ticket 20). The Reject button carries `aria-expanded` / `aria-controls` tied to the form's id. A write that returns `{ ok: false }` shows the error inline on the row rather than silently dropping it.

A submitted Rejection removes the Option from the deterministic Tonight list immediately. Suppression is **server-derived** and a **presentation filter only**: `lib/ranking.ts` and the Score are untouched (ADR-0003, ADR-0006). Add a `getTodayRejections(todaySqlDate)` query to `db/queries.ts` returning the `rejections` rows whose `rejected_on` equals today, joined to their Option (`id`, `optionId`, `optionName`, `reason`), `active = true` only, newest `created_at` first — typed as `TodayRejection`. In `app/page.tsx`, load `getTodayRejections` alongside `getTonightData`, build a `Set` of today's rejected Option ids, and filter the ranked picker rows by it after `rankTonight` runs (the same kind of filter as the existing tag filter). Because the query keys on `rejected_on = today`, a new calendar day empties the result on its own and a rejected Option reappears with no day-boundary logic. Rejecting works in picker mode and in decided mode's reopened picker ("Add another option") alike, and whether or not `ANTHROPIC_API_KEY` is configured — only the AI-feeding half (ticket 21) is moot without a key. When every remaining picker row is rejected, pass an `allRejected` flag to the screen so it can show an honest "Every Option has been rejected for tonight. They'll be back tomorrow." state rather than a blank screen.

## Acceptance criteria

- [ ] A `rejections` table (Option FK `ON DELETE CASCADE`, optional `reason`, `rejected_on` date, `created_at` timestamptz, `rejections_rejected_on_idx` index) added to `db/schema.ts` with a `Rejection` `$inferSelect` type, and a Drizzle migration `drizzle/0002_*.sql`
- [ ] An Option's hard-delete is not blocked by its Rejections (the cascade removes them)
- [ ] `app/rejection-actions.ts` exports an `authedAction`-wrapped `rejectOption(optionId, reason)` that inserts a `rejections` row dated `today()`, stores a blank/whitespace reason as `null`, revalidates the affected views, and rejects an unauthenticated caller
- [ ] `rejectOption` returns an inline `ActionResult` error for a stale/malformed Option id rather than throwing a 500
- [ ] Every Tonight picker row carries a secondary, low-emphasis Reject control subordinate to Pick, in both picker mode and decided mode's reopened picker
- [ ] Tapping Reject inline-expands an autofocused reason form with Submit and Cancel (not a modal); the reason is optional; Cancel records nothing
- [ ] Submit records the Rejection dated today and the row drops out of the list on revalidation
- [ ] A `getTodayRejections(todaySqlDate)` query returns today's Rejections joined to their active Options, newest `created_at` first, typed as `TodayRejection`
- [ ] `app/page.tsx` derives today's rejected Option ids and removes them from the ranked picker rows after `rankTonight`; the suppression survives a page reload
- [ ] A rejected Option reappears on its own the next calendar day with no day-boundary logic
- [ ] Rejecting every remaining Option yields an honest `allRejected` empty-list state, distinct from a genuinely empty Catalog
- [ ] `lib/ranking.ts`, the Score, and `rankTonight`'s tests are unchanged — suppression is a presentation filter
- [ ] Rejecting works with no `ANTHROPIC_API_KEY` set
- [ ] The Reject control, reason input, Submit, and Cancel are keyboard-operable with visible focus and adequate touch targets; the Reject button carries `aria-expanded` / `aria-controls`, and the row's removal is announced to assistive tech
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green, and `pnpm build` passes with no env vars set

## Blocked by

- 11 — Two-mode Tonight (the Reject control sits on picker rows in both
  picker mode and decided mode's reopened picker; rejecting is independent
  of AI search — only the AI-feeding half, ticket 21, needs Phase 3)
