# 11 — AI snapshot extensions: rejections feed + future window

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Two extensions to the AI search snapshot that build on the end-to-end AI search of ticket 09 and the Rejections work of ticket 10: feed every Rejection (with full history) into the snapshot as both the AI-result side of suppression and a learning signal, then widen the Log and Rejection windows so the snapshot also carries the near future (Planned dinners and future-dated Rejections).

### Feed Rejections into AI search

Make the Household's Rejections shape future **AI searches** (ADR-0006). Where ticket 10 suppressed a rejected Option from the deterministic list, this slice carries every Rejection into the AI search snapshot — both as the AI-result side of suppression and as a learning signal the model reasons over.

Add a pure `lib/rejections.ts` module — no I/O, the unit-test target. It exports a `RejectionRow` input type (`optionId`, `reason: string | null`, `rejectedOn` SQL date string, plus the Option's `optionName` / `kind` / `tags` carried for snapshot readability) and a `partitionRejections(rows, today, indexByOptionId)` function. `indexByOptionId` is a `ReadonlyMap<string, number>` — the snapshot-number map keyed by Option UUID — because the snapshot refers to every Option by a small integer, never the UUID; the partition is built around that index map. `partitionRejections` produces a `PartitionedRejections`: a **`suppressedToday`** `Set<string>` of the Option ids whose `rejectedOn` equals today (and nothing from any other day), and a **`block`** `RejectionsBlock` with two groups — **`rejectedTonight`** (rows dated exactly today) and **`notTodayRejections`** (every other row — past-dated *and* future-dated). The boundary is exact equality on the date string. Each group is shaped into `SnapshotRejection` entries: the `reason` wrapped in `<household-text>` delimiters via `delimitNullable` (a `null` reason carried through as `null`, never an empty delimiter — an unexplained Rejection is honest weak data), the `date` formatted with weekday via `formatDateWithWeekday` (the ADR-0005 date-with-weekday format), the Option named by `delimit` and referred to by its snapshot integer (`indexByOptionId.get(...)!`), `kind` and delimited `tags` carried through, and each group sorted newest `rejectedOn` first by a stable sort — parallel to the Log block. Reuse the `delimit` / `delimitNullable` / `formatDateWithWeekday` helpers from `lib/snapshot-format.ts`. `lib/rejections.ts` operates only on what it is given — Rejections of Archived Options are excluded upstream in the query, mirroring how the Log already excludes Archived Options' entries.

Extend the AI search snapshot in `lib/ai-search.ts`. `ModelSnapshot` gains a `rejections: RejectionsBlock` field. `buildSnapshot` accepts a `rejections: RejectionRow[]` input: it numbers the whole active Catalog alphabetically into `indexByOptionId`, calls `partitionRejections` to get `suppressedToday` and the `block`, drops every `suppressedToday` Option from the candidate `options` array — leaving a deliberate gap in the integer numbering — and attaches the `block`. The number gap matters: a today-rejected Option keeps a stable snapshot number for its history rows but is absent from both the candidate `options` and the `idByIndex` map, so `parseAndValidate` can never resurface it as a result — that is the AI-result side of suppression. An Option rejected only on an earlier (or a future) day stays in the candidate `options`, so the model re-considers it while still seeing why it was once passed over.

Extend `buildSystemPrompt` / the system prompt text: describe the Rejections block as the Household's record of Options turned down and why, with its two groups — "Rejected tonight" Options deliberately left out of the Catalog and **not** candidates to return (but their reasons may still inform the ranking of other Options), and "Other rejections" still candidates. Instruct the model to read each reason together with its date and how often it recurs and decide **for itself** which Rejections are standing ("closed on Sundays") and which were one-off ("too heavy tonight") — ADR-0006 — and that a Rejection with no reason is a light "passed on this" signal, nothing more. The block is raw dated history, consistent with ADR-0005 — no pre-digested signal; the model reasons over it the way it reasons over the Log.

Add a `getRejections()` query to `db/queries.ts`: every `rejections` row joined to its Option, returning the `RejectionRow` shape (`optionId`, `reason`, `rejectedOn`, `optionName`, `kind`, `tags`), for **active** Options only, ordered newest `rejected_on` first with `created_at` breaking a same-day tie. This is a separate query from ticket 10's `getTodayRejections` — the today-only subset feeds suppression and the disclosure, while `getRejections` feeds the full-history snapshot; the AI path partitions the full result with `lib/rejections.ts`. Wire it into the `aiSearchAction` server action in `app/tonight-actions.ts`: load `getRejections()` alongside `getTonightData` and `getFullLogForSnapshot`, and pass the rows through to `buildSnapshot` as its `rejections` input. `buildSnapshot` then handles candidate-drop and the block; no change to `app/page.tsx` is needed for the snapshot.

Test per the source PRD: full Vitest unit coverage of `lib/rejections.ts` in a new `lib/rejections.test.ts` (partition on the exact today boundary including a future-dated Planned row landing in `notTodayRejections`; the `suppressedToday` set being exactly today's Option ids and excluding future-dated rows; the snapshot block's delimited reasons, delimiter-substring stripping, weekday dates, newest-first ordering, `null` reason carried as `null`, delimited name and tags, the snapshot number carried through), modelled on `lib/tonight-filter.test.ts` and `lib/tonights-dinner.test.ts` with hand-built fixtures. Extend `lib/ai-search.test.ts` in place with a `buildSnapshot — Rejections` block: today's-rejected Options dropped from `options` (leaving the number gap, absent from `idByIndex`), an earlier-rejected Option still a candidate, a future-dated Planned rejection in `notTodayRejections` with its Option still a candidate, the block carrying the `rejectedTonight` and `notTodayRejections` groups with delimited reasons and weekday dates, and a null reason carried as null. No live Anthropic call is made in a test; the thin server actions get no dedicated tests, and `app/tonight-screen.test.tsx` is left as-is.

### Include the future in the AI snapshot

Widen the **AI search** snapshot so the model sees the Household's near future — Planned dinners and Planned rejections — not only past history. This extends ADR-0005: the snapshot is no longer strictly past history; it carries near-future plans, and the model, given today's date, tells plan from history itself.

Add `getFullLogForSnapshot()` to `db/queries.ts`: every `dinner_log` row of an **active** Option, **regardless of date** — past entries and future-dated ones (Planned dinners) alike — selected as `{ optionId, eatenOn, note }` (the existing `TonightLogRow` shape). It is the AI-snapshot counterpart of `getTonightData`'s `logEntries`, which filters `eaten_on <= today` for the deterministic ranking. Only active Options are joined, mirroring how `getTonightData` already excludes Archived Options' Log rows from AI search.

Rewire `app/tonight-actions.ts` (`aiSearchAction`): it currently borrows the non-future `logEntries` from `getTonightData`. Change it to `Promise.all` over `getTonightData(todaySql)` (still read for the active Catalog `options`), `getFullLogForSnapshot()`, and `getRejections()`, and feed the full Log into `buildSnapshot`. The deterministic ranking keeps its own non-future Log from `getTonightData`; `lib/ranking.ts` and the Score (ADR-0003) are untouched, and only the AI path sees the future.

`buildSnapshot` in `lib/ai-search.ts` already accepts a `SnapshotLogEntry` of any date and sorts the snapshot `log` newest-`eatenOn`-first, so a future-dated entry surfaces at the top carrying its real weekday-formatted date — confirm this holds. The Rejections block keeps **two** groups — `rejectedTonight` (Options removed from the candidate set) and `notTodayRejections` (Options still candidates). `partitionRejections` already routes any non-today row — past *or* future — into `notTodayRejections` and keeps the `suppressedToday` set at `rejectedOn === today` only; no third group is added. The not-today group's snapshot type field, the `ModelSnapshot.rejections` doc, and the system prompt must read date-neutrally — the prompt already names the group "Other rejections", states the Log and Rejections may include future-dated rows, and tells the model to compare each row's date against today; keep that wording (a stale "Earlier rejections" label would misdescribe a future row). `getRejections` already returns every Rejection of an active Option with no date filter, so future-dated rows reach the snapshot once they exist — no change there.

Extend `lib/rejections.test.ts` and `lib/ai-search.test.ts` for the future-dated behavior (both already carry such cases — confirm and keep them): a future-dated Rejection lands in `notTodayRejections` carrying its real date and is **not** in `suppressedToday`; a future-dated Log entry appears in the snapshot `log` with its date; an Option whose only Rejection is future-dated stays in the candidate `options`. Framework: Vitest; no live Anthropic call is made in any test.

## Acceptance criteria

### Feed Rejections into AI search

- [x] A pure `lib/rejections.ts` exports `RejectionRow`, `RejectionsBlock`, `PartitionedRejections`, and `partitionRejections(rows, today, indexByOptionId)`
- [x] `partitionRejections` partitions rows into `rejectedTonight` (dated exactly today) and `notTodayRejections` (every other row, past and future) on an exact date-string boundary
- [x] It derives a `suppressedToday` `Set` of exactly today's rejected Option ids — future-dated rows excluded
- [x] The snapshot block delimits reasons (`null` carried as `null`), strips delimiter substrings, formats dates with weekday, delimits name and tags, refers to Options by snapshot integer, and orders each group newest first
- [x] `ModelSnapshot` gains a `rejections: RejectionsBlock` field
- [x] `buildSnapshot` accepts `rejections: RejectionRow[]`, drops `suppressedToday` Options from the candidate `options` (and from `idByIndex`) leaving a number gap, and attaches the Rejections block
- [x] An earlier-rejected or future-dated-rejected Option still appears in the candidate `options`
- [x] A today-rejected Option is absent from AI search results for the rest of the day (absent from `idByIndex`, so `parseAndValidate` cannot resurface it)
- [x] The system prompt explains the Rejections block, its two groups, and that the model judges standing versus one-off itself
- [x] A `getRejections()` query joins `rejections` rows to their **active** Options as `RejectionRow`, newest `rejected_on` first; `aiSearchAction` in `app/tonight-actions.ts` loads it and passes the rows to `buildSnapshot`
- [x] Rejections of Archived Options are excluded from the snapshot (by `getRejections`'s active-only join)
- [x] A Rejection with no reason is still carried into the snapshot
- [x] New unit tests cover `lib/rejections.ts` in full; `lib/ai-search.test.ts` is extended for the candidate-drop and the Rejections block

### Include the future in the AI snapshot

- [x] `db/queries.ts` exports `getFullLogForSnapshot()` returning every `dinner_log` row of an active Option, all dates, as `{ optionId, eatenOn, note }`
- [x] `aiSearchAction` feeds the snapshot from `getFullLogForSnapshot()`, not from `getTonightData`'s non-future `logEntries`; `getTonightData` is still read for the active Catalog `options`
- [x] `buildSnapshot`'s snapshot `log` includes future-dated entries, newest-`eatenOn`-first, each with its real weekday-formatted date
- [x] The deterministic ranking (`lib/ranking.ts`) and `getTonightData`'s `eaten_on <= today` filter are unchanged — only the AI path sees the future
- [x] `partitionRejections` keeps two groups; `notTodayRejections` carries past *and* future-dated rows; `suppressedToday` stays `rejectedOn === today` only
- [x] The not-today group's snapshot type field, the `ModelSnapshot.rejections` doc, and the system prompt read date-neutrally and state rows may be future-dated
- [x] An Option whose only Rejection is future-dated stays in the candidate `options`
- [x] `lib/rejections.test.ts` and `lib/ai-search.test.ts` cover the future-dated Rejection, future-dated Log entry, and future-only-rejection-stays-candidate cases; no live Anthropic call in any test
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green

## Blocked by

- 09 — AI search: end-to-end
- 10 — Rejections: reject/suppress + uniqueness

## Comments

- Implemented pure `lib/rejections.ts` (partition + shape), wired `getRejections` + `getFullLogForSnapshot` queries, updated `aiSearchAction` to `Promise.all` all three reads, made `buildSnapshot` partition rejections and drop today-rejected Options from candidate `options`/`idByIndex` leaving a number gap, and extended the system prompt to explain the two groups and standing-vs-one-off self-judgment. Removed the now-orphaned `getAiSearchSnapshotInput` and pointed `scripts/ai-search-eval.ts` at the same path the action uses. Gates green: typecheck, 220 tests (10 new in `lib/rejections.test.ts` + ai-search extensions), build.
