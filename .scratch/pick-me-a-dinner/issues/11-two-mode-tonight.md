# 11 — Two-mode Tonight: the "Tonight's dinner" decided block

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The core of the Tonight redesign: the home screen (`app/page.tsx` → `app/tonight-screen.tsx`) gains a second mode, decided **server-side** from the Household's Log. When no Log entry is dated today, Tonight is the ranked **picker**, exactly as in v1. As soon as an Option is Picked, Tonight switches to **decided mode**: a "Tonight's dinner" block shows what was Picked. "Today" is the Household's calendar day in `APP_TZ`, the value `today()` already computes for the ranking, and `app/page.tsx` stays `export const dynamic = "force-dynamic"`. The day boundary needs no extra logic — because the mode keys off Log entries dated *today*, a new calendar day naturally empties Tonight's dinner and the screen falls back to picker mode. The screen heading stays `Tonight` (`<h1>`) in both modes; the decided block sits under a quiet uppercase `<h2>` "Tonight's dinner" sub-label inside a `<section aria-label="Tonight's dinner">`.

Introduce a new pure module `lib/tonights-dinner.ts` (no DB, no React) with a co-located Vitest suite `lib/tonights-dinner.test.ts`. It exports `splitTonight(rankedRows, todayEntries, decidedRows)` returning `SplitTonight` — `{ tonightsDinner, picker }`. `tonightsDinner` is a `TonightsDinnerEntry[]` (each `{ entryId, row }`): the Picked Options ordered by pick order, oldest `createdAt` first, with `entryId` the today Log entry's id. `picker` is `rankedRows` with every already-Picked Option removed, so the picker only ever offers what is not yet Picked — no per-row logic needed. The module also exports `TodayLogEntry` (`{ id, optionId, createdAt: Date }`), `TonightsDinnerEntry`, and `SplitTonight`. Crucially, `splitTonight` takes a **third** argument `decidedRows`: a decided Option's row is taken from `decidedRows`, not `rankedRows`. A today entry whose Option is absent from `decidedRows` (e.g. Archived after being Picked) is skipped without error.

`app/page.tsx` ranks the Catalog **twice**. `rows = rankTonight(options, entries, todayEpochDay)` is the live ranking that feeds the picker. `decidedRows = rankTonight(options, entriesBeforeToday, todayEpochDay)` ranks the same Catalog over the Log with today's entries dropped — so a just-Picked Option's decided-block row shows its Recency and Tag chips as they stood *before* tonight ("5d", not a meaningless "0d") rather than collapsed to zero by its own fresh Pick. The page then calls `splitTonight(rows, todayEntries, decidedRows)` and passes `tonightsDinner` plus the rejection-filtered `picker` (`visiblePicker`) into `TonightScreen` as `tonightsDinner` and `pickerRows`. `TonightScreen` derives `const decided = tonightsDinner.length > 0`; the mode is never client state.

Extend `getTonightData(todaySqlDate)` in `db/queries.ts` to additionally return `todayEntries`: the `dinner_log` rows whose `eaten_on` equals today, each `{ id, optionId, createdAt }` (typed `TodayLogEntry[]`). `createdAt` gives the pick order; `id` is the handle ticket 13's "Remove" deletes. The ranking input (`options`, `logEntries`) is otherwise unchanged. The `pickTonight` server action is unchanged — it still upserts on `(option_id, eaten_on)` for today. The transition into decided mode replaces the old 1.6-second "Logged ✓" flash as the confirmation of a successful Pick; a Pick that grows `tonightsDinner` also smooth-scrolls the page to the top (via a `useEffect` comparing the count held in `sessionStorage`, respecting `prefers-reduced-motion`) so the Household sees the Option land in the decided block.

In decided mode the picker stays **open** below the "Tonight's dinner" block (the source PRD's 2026-05-17 amendment — it no longer collapses behind a toggle). It sits inside a `<section aria-label="Add another option">` with a bordered top divider, an uppercase `<h2>` "Add another option" heading, and a hint paragraph making clear that Picking from it adds a *second* dinner rather than replacing the first. The picker's AI search box, Tag filter chips, and ranked `<ol>` behave exactly as in picker mode; the All/Home/Restaurant `KindSegment` lives in the page header and shows whenever the picker has rows and no AI result is on screen. Picking a second Option inserts a today Log entry and appends it to Tonight's dinner; the picker stays open. When every Option is already Picked, the picker area shows the line "Every Option is already on tonight's dinner." instead. The mode change is announced to assistive tech by a visually-hidden `role="status" aria-live="polite"` region ("Tonight's dinner is decided." / "Choosing tonight's dinner.").

## Acceptance criteria

- [ ] With no Log entry dated today, Tonight renders picker mode — ranked list, kind segment, Tag filters — behaving as in v1
- [ ] Picking an Option switches Tonight to decided mode, showing that Option under a "Tonight's dinner" `<h2>` sub-label; the `<h1>` heading stays "Tonight"
- [ ] In decided mode the picker stays open below the "Tonight's dinner" block, inside an "Add another option" section with a divider, heading, and a hint that Picking adds a second dinner
- [ ] An already-Picked Option is absent from the picker in decided mode
- [ ] Picking a second Option appends it to Tonight's dinner; the picker stays open
- [ ] When every Option is already Picked the picker area shows "Every Option is already on tonight's dinner." copy
- [ ] A multi-Option Tonight's dinner lists Options in pick order, oldest `createdAt` first, and the order is stable when another is added
- [ ] Returning to Tonight later the same day opens directly in decided mode; a new calendar day returns it to picker mode with no day-boundary logic
- [ ] A decided-block Option's chips reflect its recency *before* tonight's Pick — `app/page.tsx` ranks the Catalog a second time over `entriesBeforeToday` to produce `decidedRows`
- [ ] `getTonightData` returns `todayEntries` — today's `dinner_log` rows as `{ id, optionId, createdAt }`
- [ ] `splitTonight` is a pure module (`lib/tonights-dinner.ts`, no DB/React) taking `(rankedRows, todayEntries, decidedRows)` and returning `{ tonightsDinner, picker }`; decided rows come from `decidedRows`
- [ ] `splitTonight` is unit-tested (Vitest, `lib/tonights-dinner.test.ts`): no picks → empty dinner + full picker; one/several picks → picked Options excluded from the picker and ordered by `createdAt`; pick order stable as another is added; all Options picked → empty picker; a today entry for an Option absent from `decidedRows` is skipped without error; empty ranked set → both sides empty
- [ ] The mode change is announced to assistive tech via a visually-hidden `aria-live` status region

## Blocked by

- 05 — Pick = log and the Log screen (decided mode keys off today's Log
  entries, so the pick/log write path must exist)
- 06 — Tri-state tag filters on Tonight (the picker keeps its filter zone
  in both modes)
