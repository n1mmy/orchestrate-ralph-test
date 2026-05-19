# 30 — AI snapshot includes the future

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/dated-rejections/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Widen the **AI search** snapshot so the model sees the Household's near future — Planned dinners and Planned rejections — not only past history. This extends ADR-0005: the snapshot is no longer strictly past history; it carries near-future plans, and the model, given today's date, tells plan from history itself.

Add `getFullLogForSnapshot()` to `db/queries.ts`: every `dinner_log` row of an **active** Option, **regardless of date** — past entries and future-dated ones (Planned dinners) alike — selected as `{ optionId, eatenOn, note }` (the existing `TonightLogRow` shape). It is the AI-snapshot counterpart of `getTonightData`'s `logEntries`, which filters `eaten_on <= today` for the deterministic ranking. Only active Options are joined, mirroring how `getTonightData` already excludes Archived Options' Log rows from AI search.

Rewire `app/tonight-actions.ts` (`aiSearchAction`): it currently borrows the non-future `logEntries` from `getTonightData`. Change it to `Promise.all` over `getTonightData(todaySql)` (still read for the active Catalog `options`), `getFullLogForSnapshot()`, and `getRejections()`, and feed the full Log into `buildSnapshot`. The deterministic ranking keeps its own non-future Log from `getTonightData`; `lib/ranking.ts` and the Score (ADR-0003) are untouched, and only the AI path sees the future.

`buildSnapshot` in `lib/ai-search.ts` already accepts a `SnapshotLogEntry` of any date and sorts the snapshot `log` newest-`eatenOn`-first, so a future-dated entry surfaces at the top carrying its real weekday-formatted date — confirm this holds. The Rejections block keeps **two** groups — `rejectedTonight` (Options removed from the candidate set) and `notTodayRejections` (Options still candidates). `partitionRejections` already routes any non-today row — past *or* future — into `notTodayRejections` and keeps the `suppressedToday` set at `rejectedOn === today` only; no third group is added. The not-today group's snapshot type field, the `ModelSnapshot.rejections` doc, and the system prompt must read date-neutrally — the prompt already names the group "Other rejections", states the Log and Rejections may include future-dated rows, and tells the model to compare each row's date against today; keep that wording (a stale "Earlier rejections" label would misdescribe a future row). `getRejections` already returns every Rejection of an active Option with no date filter, so future-dated rows reach the snapshot once they exist — no change there.

Extend `lib/rejections.test.ts` and `lib/ai-search.test.ts` for the future-dated behavior (both already carry such cases — confirm and keep them): a future-dated Rejection lands in `notTodayRejections` carrying its real date and is **not** in `suppressedToday`; a future-dated Log entry appears in the snapshot `log` with its date; an Option whose only Rejection is future-dated stays in the candidate `options`. Framework: Vitest; no live Anthropic call is made in any test.

## Acceptance criteria

- [ ] `db/queries.ts` exports `getFullLogForSnapshot()` returning every `dinner_log` row of an active Option, all dates, as `{ optionId, eatenOn, note }`
- [ ] `aiSearchAction` feeds the snapshot from `getFullLogForSnapshot()`, not from `getTonightData`'s non-future `logEntries`; `getTonightData` is still read for the active Catalog `options`
- [ ] `buildSnapshot`'s snapshot `log` includes future-dated entries, newest-`eatenOn`-first, each with its real weekday-formatted date
- [ ] The deterministic ranking (`lib/ranking.ts`) and `getTonightData`'s `eaten_on <= today` filter are unchanged — only the AI path sees the future
- [ ] `partitionRejections` keeps two groups; `notTodayRejections` carries past *and* future-dated rows; `suppressedToday` stays `rejectedOn === today` only
- [ ] The not-today group's snapshot type field, the `ModelSnapshot.rejections` doc, and the system prompt read date-neutrally and state rows may be future-dated
- [ ] An Option whose only Rejection is future-dated stays in the candidate `options`
- [ ] `lib/rejections.test.ts` and `lib/ai-search.test.ts` cover the future-dated Rejection, future-dated Log entry, and future-only-rejection-stays-candidate cases; no live Anthropic call in any test

## Blocked by

29 — Interleaved day grouping: groupByDay over Log entries and Rejections
