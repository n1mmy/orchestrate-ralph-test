# 29 — Interleaved day grouping: groupByDay over Log entries and Rejections

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/dated-rejections/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Extend `lib/dinner-grouping.ts` — the pure module Phase 5 introduced for the Option detail page's History section and the Log screen's Dinner grouping — so it can group **Log entries** and **Rejections** together by date. Phase 5 left the module with `groupByDate`, `splitDinners`, the `Dinner<T>` type, and `formatDinnerDate`; this ticket adds the interleaved-grouping half on top, leaving every existing export untouched.

Add a `DayRecord<E, R>` type: a calendar `date` (`"YYYY-MM-DD"`), an `entries: E[]` array (that date's Log entries — its Dinner), and a `rejections: R[]` array (that date's Rejections). It is generic over `E extends { eatenOn: string }` and `R extends { rejectedOn: string }` — the module reads only those two date fields, so it stays pure: no React import, no DB import.

Add `groupByDay(entries, rejections, today)`: given a newest-first Log, the Rejection list, and today's date, it returns `{ upcoming: DayRecord[]; history: DayRecord[] }`. It builds a `Map` keyed by date so a Log entry and a Rejection sharing a date converge on one `DayRecord`; a date with only Rejections and no Dinner still forms a record (a `DayRecord` with an empty `entries` array), so a Rejection-only night is never invisible. Entries push into `record.entries` in caller order and Rejections into `record.rejections` in caller order, so input order is preserved within a record. The split is exact at the today boundary: `date > today` is Upcoming, `date <= today` is History. Upcoming is sorted soonest-first via `a.date.localeCompare(b.date)` (the nearest plan reads at the top of its strip); History is sorted newest-first via `b.date.localeCompare(a.date)` (the screen reads newest-first). Future-dated records carry Planned dinners and Planned rejections.

`formatDinnerDate` is unchanged and stays the date-label helper for `groupByDay`'s records: "Today" / "Tomorrow" / "Yesterday", else the "Fri, May 16" form with a "· N days ago" suffix on a past date, a future date plain. `groupByDate`, `splitDinners`, and `Dinner<T>` remain exported — the Option detail page's History section is reworked onto `groupByDay` in ticket 33, but the older helpers stay in the module.

Extend `lib/dinner-grouping.test.ts` with full unit coverage for `groupByDay`, exercised with hand-built fixtures — a minimal `{ id, eatenOn }` entry helper and a `{ id, rejectedOn }` rejection helper, since the module reads only the date field. Cover: a Log entry and a Rejection sharing a date land in one record; a Rejection-only date forms its own record; the Upcoming/History split is exact at the today boundary for both entries and Rejections; Upcoming is soonest-first and History newest-first; input order is preserved within a record; an empty Log with no Rejections yields `{ upcoming: [], history: [] }`. Framework: Vitest, no live I/O.

## Acceptance criteria

- [ ] `lib/dinner-grouping.ts` exports a `DayRecord<E, R>` type with `date: string`, `entries: E[]`, and `rejections: R[]`, generic over `E extends { eatenOn: string }` and `R extends { rejectedOn: string }`
- [ ] `groupByDay(entries, rejections, today)` returns `{ upcoming: DayRecord[]; history: DayRecord[] }`
- [ ] A Log entry and a Rejection sharing a date converge on one `DayRecord`; a date with only Rejections still forms a record
- [ ] Entries and Rejections keep the caller's input order within a record
- [ ] The Upcoming/History split is exact at the today boundary — `date > today` is Upcoming, `date <= today` is History
- [ ] Upcoming is returned soonest-first; History is returned newest-first
- [ ] The module stays pure — no React, no DB import; it reads only `eatenOn` / `rejectedOn`
- [ ] `groupByDate`, `splitDinners`, `Dinner<T>`, and `formatDinnerDate` are still exported and unchanged
- [ ] `lib/dinner-grouping.test.ts` covers `groupByDay` with hand-built fixtures: same-date interleave, Rejection-only record, exact today-boundary split, ordering, input-order preservation, empty input

## Blocked by

28 — Rejection uniqueness: UNIQUE(option_id, rejected_on)
