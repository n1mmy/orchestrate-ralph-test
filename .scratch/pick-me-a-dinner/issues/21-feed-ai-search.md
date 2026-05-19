# 21 — Feed AI search

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/rejections/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Make the Household's Rejections shape future **AI searches** (ADR-0006). Where ticket 19 suppressed a rejected Option from the deterministic list, this slice carries every Rejection into the AI search snapshot — both as the AI-result side of suppression and as a learning signal the model reasons over.

Add a pure `lib/rejections.ts` module — no I/O, the unit-test target. It exports a `RejectionRow` input type (`optionId`, `reason: string | null`, `rejectedOn` SQL date string, plus the Option's `optionName` / `kind` / `tags` carried for snapshot readability) and a `partitionRejections(rows, today, indexByOptionId)` function. `indexByOptionId` is a `ReadonlyMap<string, number>` — the snapshot-number map keyed by Option UUID — because the snapshot refers to every Option by a small integer, never the UUID; the partition is built around that index map. `partitionRejections` produces a `PartitionedRejections`: a **`suppressedToday`** `Set<string>` of the Option ids whose `rejectedOn` equals today (and nothing from any other day), and a **`block`** `RejectionsBlock` with two groups — **`rejectedTonight`** (rows dated exactly today) and **`notTodayRejections`** (every other row — past-dated *and* future-dated). The boundary is exact equality on the date string. Each group is shaped into `SnapshotRejection` entries: the `reason` wrapped in `<household-text>` delimiters via `delimitNullable` (a `null` reason carried through as `null`, never an empty delimiter — an unexplained Rejection is honest weak data), the `date` formatted with weekday via `formatDateWithWeekday` (the ADR-0005 date-with-weekday format), the Option named by `delimit` and referred to by its snapshot integer (`indexByOptionId.get(...)!`), `kind` and delimited `tags` carried through, and each group sorted newest `rejectedOn` first by a stable sort — parallel to the Log block. Reuse the `delimit` / `delimitNullable` / `formatDateWithWeekday` helpers from `lib/snapshot-format.ts`. `lib/rejections.ts` operates only on what it is given — Rejections of Archived Options are excluded upstream in the query, mirroring how the Log already excludes Archived Options' entries.

Extend the AI search snapshot in `lib/ai-search.ts`. `ModelSnapshot` gains a `rejections: RejectionsBlock` field. `buildSnapshot` accepts a `rejections: RejectionRow[]` input: it numbers the whole active Catalog alphabetically into `indexByOptionId`, calls `partitionRejections` to get `suppressedToday` and the `block`, drops every `suppressedToday` Option from the candidate `options` array — leaving a deliberate gap in the integer numbering — and attaches the `block`. The number gap matters: a today-rejected Option keeps a stable snapshot number for its history rows but is absent from both the candidate `options` and the `idByIndex` map, so `parseAndValidate` can never resurface it as a result — that is the AI-result side of suppression. An Option rejected only on an earlier (or a future) day stays in the candidate `options`, so the model re-considers it while still seeing why it was once passed over.

Extend `buildSystemPrompt` / the system prompt text: describe the Rejections block as the Household's record of Options turned down and why, with its two groups — "Rejected tonight" Options deliberately left out of the Catalog and **not** candidates to return (but their reasons may still inform the ranking of other Options), and "Other rejections" still candidates. Instruct the model to read each reason together with its date and how often it recurs and decide **for itself** which Rejections are standing ("closed on Sundays") and which were one-off ("too heavy tonight") — ADR-0006 — and that a Rejection with no reason is a light "passed on this" signal, nothing more. The block is raw dated history, consistent with ADR-0005 — no pre-digested signal; the model reasons over it the way it reasons over the Log.

Add a `getRejections()` query to `db/queries.ts`: every `rejections` row joined to its Option, returning the `RejectionRow` shape (`optionId`, `reason`, `rejectedOn`, `optionName`, `kind`, `tags`), for **active** Options only, ordered newest `rejected_on` first with `created_at` breaking a same-day tie. This is a separate query from ticket 19's `getTodayRejections` — the today-only subset feeds suppression and the disclosure, while `getRejections` feeds the full-history snapshot; the AI path partitions the full result with `lib/rejections.ts`. Wire it into the `aiSearchAction` server action in `app/tonight-actions.ts`: load `getRejections()` alongside `getTonightData` and `getFullLogForSnapshot`, and pass the rows through to `buildSnapshot` as its `rejections` input. `buildSnapshot` then handles candidate-drop and the block; no change to `app/page.tsx` is needed for the snapshot.

Test per the source PRD: full Vitest unit coverage of `lib/rejections.ts` in a new `lib/rejections.test.ts` (partition on the exact today boundary including a future-dated Planned row landing in `notTodayRejections`; the `suppressedToday` set being exactly today's Option ids and excluding future-dated rows; the snapshot block's delimited reasons, delimiter-substring stripping, weekday dates, newest-first ordering, `null` reason carried as `null`, delimited name and tags, the snapshot number carried through), modelled on `lib/tonight-filter.test.ts` and `lib/tonights-dinner.test.ts` with hand-built fixtures. Extend `lib/ai-search.test.ts` in place with a `buildSnapshot — Rejections` block: today's-rejected Options dropped from `options` (leaving the number gap, absent from `idByIndex`), an earlier-rejected Option still a candidate, a future-dated Planned rejection in `notTodayRejections` with its Option still a candidate, the block carrying the `rejectedTonight` and `notTodayRejections` groups with delimited reasons and weekday dates, and a null reason carried as null. No live Anthropic call is made in a test; the thin server actions get no dedicated tests, and `app/tonight-screen.test.tsx` is left as-is.

## Acceptance criteria

- [ ] A pure `lib/rejections.ts` exports `RejectionRow`, `RejectionsBlock`, `PartitionedRejections`, and `partitionRejections(rows, today, indexByOptionId)`
- [ ] `partitionRejections` partitions rows into `rejectedTonight` (dated exactly today) and `notTodayRejections` (every other row, past and future) on an exact date-string boundary
- [ ] It derives a `suppressedToday` `Set` of exactly today's rejected Option ids — future-dated rows excluded
- [ ] The snapshot block delimits reasons (`null` carried as `null`), strips delimiter substrings, formats dates with weekday, delimits name and tags, refers to Options by snapshot integer, and orders each group newest first
- [ ] `ModelSnapshot` gains a `rejections: RejectionsBlock` field
- [ ] `buildSnapshot` accepts `rejections: RejectionRow[]`, drops `suppressedToday` Options from the candidate `options` (and from `idByIndex`) leaving a number gap, and attaches the Rejections block
- [ ] An earlier-rejected or future-dated-rejected Option still appears in the candidate `options`
- [ ] A today-rejected Option is absent from AI search results for the rest of the day (absent from `idByIndex`, so `parseAndValidate` cannot resurface it)
- [ ] The system prompt explains the Rejections block, its two groups, and that the model judges standing versus one-off itself
- [ ] A `getRejections()` query joins `rejections` rows to their **active** Options as `RejectionRow`, newest `rejected_on` first; `aiSearchAction` in `app/tonight-actions.ts` loads it and passes the rows to `buildSnapshot`
- [ ] Rejections of Archived Options are excluded from the snapshot (by `getRejections`'s active-only join)
- [ ] A Rejection with no reason is still carried into the snapshot
- [ ] New unit tests cover `lib/rejections.ts` in full; `lib/ai-search.test.ts` is extended for the candidate-drop and the Rejections block
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green

## Blocked by

- 17 — AI search: mode polish, habit reasoning, and accessibility (extends
  `buildSnapshot` and `buildSystemPrompt`)
- 19 — Reject and suppress (needs the `rejections` table this snapshot
  block reasons over)
