# 08 — Tonight decided mode: two-mode picker, action buttons, remove

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The Tonight redesign: a second "decided" mode on the home screen, a "Tonight's dinner" block with per-row action buttons (Menu / Call / Recipe), and an inline Remove control so a mis-tapped Pick can be corrected without leaving Tonight.

### Two-mode picker

The core of the Tonight redesign: the home screen (`app/page.tsx` → `app/tonight-screen.tsx`) gains a second mode, decided **server-side** from the Household's Log. When no Log entry is dated today, Tonight is the ranked **picker**, exactly as in the base Tonight. As soon as an Option is Picked, Tonight switches to **decided mode**: a "Tonight's dinner" block shows what was Picked. "Today" is the Household's calendar day in `APP_TZ`, the value `today()` already computes for the ranking, and `app/page.tsx` stays `export const dynamic = "force-dynamic"`. The day boundary needs no extra logic — because the mode keys off Log entries dated *today*, a new calendar day naturally empties Tonight's dinner and the screen falls back to picker mode. The screen heading stays `Tonight` (`<h1>`) in both modes; the decided block sits under a quiet uppercase `<h2>` "Tonight's dinner" sub-label inside a `<section aria-label="Tonight's dinner">`.

Introduce a new pure module `lib/tonights-dinner.ts` (no DB, no React) with a co-located Vitest suite `lib/tonights-dinner.test.ts`. It exports `splitTonight(rankedRows, todayEntries, decidedRows)` returning `SplitTonight` — `{ tonightsDinner, picker }`. `tonightsDinner` is a `TonightsDinnerEntry[]` (each `{ entryId, row }`): the Picked Options ordered by pick order, oldest `createdAt` first, with `entryId` the today Log entry's id. `picker` is `rankedRows` with every already-Picked Option removed, so the picker only ever offers what is not yet Picked — no per-row logic needed. The module also exports `TodayLogEntry` (`{ id, optionId, createdAt: Date }`), `TonightsDinnerEntry`, and `SplitTonight`. Crucially, `splitTonight` takes a **third** argument `decidedRows`: a decided Option's row is taken from `decidedRows`, not `rankedRows`. A today entry whose Option is absent from `decidedRows` (e.g. Archived after being Picked) is skipped without error.

`app/page.tsx` ranks the Catalog **twice**. `rows = rankTonight(options, entries, todayEpochDay)` is the live ranking that feeds the picker. `decidedRows = rankTonight(options, entriesBeforeToday, todayEpochDay)` ranks the same Catalog over the Log with today's entries dropped — so a just-Picked Option's decided-block row shows its Recency and Tag chips as they stood *before* tonight ("5d", not a meaningless "0d") rather than collapsed to zero by its own fresh Pick. The page then calls `splitTonight(rows, todayEntries, decidedRows)` and passes `tonightsDinner` plus the rejection-filtered `picker` (`visiblePicker`) into `TonightScreen` as `tonightsDinner` and `pickerRows`. `TonightScreen` derives `const decided = tonightsDinner.length > 0`; the mode is never client state.

Extend `getTonightData(todaySqlDate)` in `db/queries.ts` to additionally return `todayEntries`: the `dinner_log` rows whose `eaten_on` equals today, each `{ id, optionId, createdAt }` (typed `TodayLogEntry[]`). `createdAt` gives the pick order; `id` is the handle the Remove subsection's mutation deletes. The ranking input (`options`, `logEntries`) is otherwise unchanged. The `pickTonight` server action is unchanged — it still upserts on `(option_id, eaten_on)` for today. The transition into decided mode replaces the old 1.6-second "Logged ✓" flash as the confirmation of a successful Pick; a Pick that grows `tonightsDinner` also smooth-scrolls the page to the top (via a `useEffect` comparing the count held in `sessionStorage`, respecting `prefers-reduced-motion`) so the Household sees the Option land in the decided block.

In decided mode the picker stays **open** below the "Tonight's dinner" block (the source PRD's 2026-05-17 amendment — it no longer collapses behind a toggle). It sits inside a `<section aria-label="Add another option">` with a bordered top divider, an uppercase `<h2>` "Add another option" heading, and a hint paragraph making clear that Picking from it adds a *second* dinner rather than replacing the first. The picker's AI search box, Tag filter chips, and ranked `<ol>` behave exactly as in picker mode; the All/Home/Restaurant `KindSegment` lives in the page header and shows whenever the picker has rows and no AI result is on screen. Picking a second Option inserts a today Log entry and appends it to Tonight's dinner; the picker stays open. When every Option is already Picked, the picker area shows the line "Every Option is already on tonight's dinner." instead. The mode change is announced to assistive tech by a visually-hidden `role="status" aria-live="polite"` region ("Tonight's dinner is decided." / "Choosing tonight's dinner.").

### Action buttons (Menu / Call / Recipe)

This subsection builds the "Tonight's dinner" decided block itself (`app/tonights-dinner-block.tsx`) and the action buttons on each decided row. Once an Option is in Tonight's dinner, the screen turns calm and action-oriented — once the choice is made it helps the Household *act on it* rather than keep searching.

`TonightsDinnerBlock` renders the `<section aria-label="Tonight's dinner">` from the two-mode picker subsection: a `<ul>` of `DecidedRow`s, one per `TonightsDinnerEntry`, keyed by `entryId`. Each `DecidedRow` shows the Option name as a `<Link>` to its detail page (`/catalog/[id]`), the shared `RowChips` from `app/tonight-row.tsx` (the Recency chip followed by the Tag chips with per-Tag recency — the *same* chip row Tonight's picker uses, so a decided dinner still shows how overdue it had been). There is no prose Explanation chip — none exists anywhere in the shipped app. The meal kind is shown not as a badge but by the 3px meal-kind left bar (`kindBarClass`), and each row carries a light kind-tinted wash background — `bg-kind-home-wash` for a Home meal, `bg-kind-restaurant-wash` for a Restaurant (per DESIGN.md) — so the decided area reads as a distinct, settled panel above the picker.

Below the chip row each `DecidedRow` surfaces its action buttons. A Picked **Restaurant** shows a "Menu" button (opening its `url`) and a "Call" button (a `tel:` link to its `phone`). A Picked **Home meal** shows a "Recipe" button (opening its `url`). Each button appears only when its source field is set — a Restaurant with no `phone` shows no "Call"; a Restaurant with neither field shows no action buttons at all. A Home meal never shows "Menu" or "Call"; its `phone` is ignored even if one is somehow set. The `url` button is labelled "Menu" for a Restaurant regardless of whether the link is actually a menu or an order/delivery page — "Menu" is the chosen label regardless. (A "Directions" button from `mapsUrl` was considered and deliberately left out.)

Add `decidedActions(option)` to the `lib/tonights-dinner` module from the two-mode picker subsection (the pure, no-DB, no-React module). Given an Option's `kind`, `url`, and `phone` it returns a `DecidedAction[]` — each `{ label, href }` where `label` is `"Menu" | "Call" | "Recipe"` (`DecidedActionLabel`). A "Call" action's `href` is `tel:<phone>`; "Menu" and "Recipe" carry the Option's `url`. Critically, the `url` is run through a `safeHttpUrl` check first: a Catalog `url` is free text the Household typed and is never scheme-checked on save, so a `javascript:` or `data:` value must yield **no** button — only `http`/`https` urls become live links. A `phone` is still trusted, so an unsafe `url` on a Restaurant with a phone still yields the "Call" button. Extend `getTonightData` so each Option additionally carries `url` and `phone` (both nullable; `phone` is always null for a Home meal) — these feed `decidedActions`.

`decidedActions` is unit-tested in `lib/tonights-dinner.test.ts` (Vitest), matching the pure-logic style of the existing ranking-engine and local-day suites, with hand-built fixtures exercising each kind/field combination plus the unsafe-scheme cases. The decided block carries no UI component unit tests (consistent with v1) but the action buttons must be keyboard-operable with visible focus (plain anchors, with a focus ring) and meet the 44×44px touch-target minimum (`min-h-11` plus horizontal padding); `tel:` links open in place while `url` links open in a new tab with `rel="noopener noreferrer"`.

### Remove a pick

Picking is one tap, so mis-taps happen. Each `DecidedRow` in the "Tonight's dinner" block (`app/tonights-dinner-block.tsx`) gets an inline "Remove" control that deletes today's Log entry for that Option — letting the Household correct a Pick without leaving Tonight. In the decided row layout the "Remove" control sits on the row's right edge, beside the Option name link, above the chip row and action buttons.

"Remove" uses the app's established inline-confirm interaction (plan §17): a confirm step in place, no modal and no undo-toast — the same pattern destructive actions already use elsewhere, e.g. Delete on the Log screen. The control is a small `RemoveControl` component with local `confirming` state: the first tap arms it; once armed it shows a danger-styled "Remove" button and a "Cancel" button (separated by a quiet `·`). The armed "Remove" deletes today's Log entry for that Option; "Cancel" disarms it back to the single resting "Remove" button.

"Remove" reuses the existing `deleteLogEntry` server action — **no new mutation is added**. It deletes by the entry `id` carried as `entry.entryId` on each `TonightsDinnerEntry` (the today Log entry id that `getTonightData` returns and `splitTonight` threads through — see the two-mode picker subsection). `deleteLogEntry` already revalidates Tonight (`revalidatePath("/")`), so on the next render the server recomputes `splitTonight` from the remaining Log entries: the removed Option drops out of the decided block and reappears in the picker, with no post-delete cleanup in the component — `RemoveControl` simply unmounts with its row. Removing the last Option from Tonight's dinner leaves `tonightsDinner` empty, so `TonightScreen` renders picker mode again on its own — the same server-side mode logic from the two-mode picker subsection, with no special-casing.

The server actions need no new tests: `deleteLogEntry` is already covered by the Log suite and "Remove" reuses it as-is. Consistent with v1 there are no UI component unit tests; the "Remove" control is verified by hand. It must be keyboard-operable with visible focus and meet the 44×44px touch-target minimum (`min-h-11`/`min-w-11`).

## Acceptance criteria

### Two-mode picker

- [x] With no Log entry dated today, Tonight renders picker mode — ranked list, kind segment, Tag filters — behaving as in the base Tonight
- [x] Picking an Option switches Tonight to decided mode, showing that Option under a "Tonight's dinner" `<h2>` sub-label; the `<h1>` heading stays "Tonight"
- [x] In decided mode the picker stays open below the "Tonight's dinner" block, inside an "Add another option" section with a divider, heading, and a hint that Picking adds a second dinner
- [x] An already-Picked Option is absent from the picker in decided mode
- [x] Picking a second Option appends it to Tonight's dinner; the picker stays open
- [x] When every Option is already Picked the picker area shows "Every Option is already on tonight's dinner." copy
- [x] A multi-Option Tonight's dinner lists Options in pick order, oldest `createdAt` first, and the order is stable when another is added
- [x] Returning to Tonight later the same day opens directly in decided mode; a new calendar day returns it to picker mode with no day-boundary logic
- [x] A decided-block Option's chips reflect its recency *before* tonight's Pick — `app/page.tsx` ranks the Catalog a second time over `entriesBeforeToday` to produce `decidedRows`
- [x] `getTonightData` returns `todayEntries` — today's `dinner_log` rows as `{ id, optionId, createdAt }`
- [x] `splitTonight` is a pure module (`lib/tonights-dinner.ts`, no DB/React) taking `(rankedRows, todayEntries, decidedRows)` and returning `{ tonightsDinner, picker }`; decided rows come from `decidedRows`
- [x] `splitTonight` is unit-tested (Vitest, `lib/tonights-dinner.test.ts`): no picks → empty dinner + full picker; one/several picks → picked Options excluded from the picker and ordered by `createdAt`; pick order stable as another is added; all Options picked → empty picker; a today entry for an Option absent from `decidedRows` is skipped without error; empty ranked set → both sides empty
- [x] The mode change is announced to assistive tech via a visually-hidden `aria-live` status region

### Action buttons (Menu / Call / Recipe)

- [x] `TonightsDinnerBlock` renders a `<ul>` of decided rows; each row links the Option name to `/catalog/[id]` and shows the shared `RowChips` (Recency chip + Tag chips with per-Tag recency); no Explanation chip
- [x] Each decided row carries the 3px meal-kind left bar and a light kind-tinted wash background (`kind-home-wash` / `kind-restaurant-wash`) distinguishing the decided area from the picker
- [x] A Picked Restaurant with both fields shows a "Menu" button and a "Call" button
- [x] A Picked Restaurant missing one field shows only the button whose field is set; with neither, no action buttons
- [x] A Picked Home meal with a `url` shows a "Recipe" button; without a `url`, no button
- [x] A Home meal never shows "Menu" or "Call", even with a stray `phone`
- [x] "Call" is a `tel:` link; "Menu" and "Recipe" open the Option's `url` in a new tab
- [x] A `url` with a non-`http(s)` scheme (`javascript:`, `data:`) yields no "Menu"/"Recipe" button; an unsafe `url` still leaves a "Call" button when `phone` is set
- [x] `getTonightData` returns each Option's `url` and `phone`
- [x] `decidedActions` is unit-tested (Vitest, `lib/tonights-dinner.test.ts`) across the kind/field combinations and the unsafe-scheme cases
- [x] The action buttons are keyboard-operable with visible focus and meet the 44×44px touch-target minimum

### Remove a pick

- [x] Each decided-block row has an inline "Remove" control on the row's right edge, beside the Option name
- [x] "Remove" arms an inline confirm on first tap, showing a confirming "Remove" plus a "Cancel"; "Cancel" disarms it
- [x] Confirming "Remove" deletes today's Log entry for that Option, identified by the `entryId` on its `TonightsDinnerEntry`
- [x] After a Remove the Option is gone from Tonight's dinner and reappears in the picker (the server recomputes `splitTonight` on revalidation)
- [x] Removing the last Option in Tonight's dinner drops the screen back to picker mode with no special-casing
- [x] Removal reuses the existing `deleteLogEntry` server action — no new server action is introduced
- [x] "Remove" is keyboard-operable with visible focus and meets the 44×44px touch-target minimum

## Blocked by

- 07 — Tonight: ranked list, pick=log, Log screen, tag filters

## Comments

- 2026-05-20: Added `lib/tonights-dinner.ts` (pure `splitTonight` +
  `decidedActions` with `safeHttpUrl`) with a 21-test Vitest suite.
  Extended `getTonightData` to return `todayEntries: { id, optionId,
  createdAt }`. `app/page.tsx` ranks twice (live + `entriesBeforeToday`)
  and threads `splitTonight` output into `TonightScreen`. New
  `TonightsDinnerBlock` renders the decided block with kind-wash rows,
  shared `RowChips`, name link to `/catalog/[id]`, action buttons, and
  the inline `RemoveControl` (reuses `deleteLogEntry`). Gate green
  (`pnpm typecheck`, `pnpm test`, `pnpm build`).
