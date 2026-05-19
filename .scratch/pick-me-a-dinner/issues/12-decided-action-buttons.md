# 12 — Action buttons on a picked Option (Menu / Call / Recipe)

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

This slice builds the "Tonight's dinner" decided block itself (`app/tonights-dinner-block.tsx`) and the action buttons on each decided row. Once an Option is in Tonight's dinner, the screen turns calm and action-oriented — once the choice is made it helps the Household *act on it* rather than keep searching.

`TonightsDinnerBlock` renders the `<section aria-label="Tonight's dinner">` from ticket 11: a `<ul>` of `DecidedRow`s, one per `TonightsDinnerEntry`, keyed by `entryId`. Each `DecidedRow` shows the Option name as a `<Link>` to its detail page (`/catalog/[id]`), the shared `RowChips` from `app/tonight-row.tsx` (the Recency chip followed by the Tag chips with per-Tag recency — the *same* chip row Tonight's picker uses, so a decided dinner still shows how overdue it had been). There is no prose Explanation chip — none exists anywhere in the shipped app. The meal kind is shown not as a badge but by the 3px meal-kind left bar (`kindBarClass`), and each row carries a light kind-tinted wash background — `bg-kind-home-wash` for a Home meal, `bg-kind-restaurant-wash` for a Restaurant (per DESIGN.md) — so the decided area reads as a distinct, settled panel above the picker.

Below the chip row each `DecidedRow` surfaces its action buttons. A Picked **Restaurant** shows a "Menu" button (opening its `url`) and a "Call" button (a `tel:` link to its `phone`). A Picked **Home meal** shows a "Recipe" button (opening its `url`). Each button appears only when its source field is set — a Restaurant with no `phone` shows no "Call"; a Restaurant with neither field shows no action buttons at all. A Home meal never shows "Menu" or "Call"; its `phone` is ignored even if one is somehow set. The `url` button is labelled "Menu" for a Restaurant regardless of whether the link is actually a menu or an order/delivery page — "Menu" is the chosen label regardless. (A "Directions" button from `mapsUrl` was considered and deliberately left out.)

Add `decidedActions(option)` to the `lib/tonights-dinner` module from ticket 11 (the pure, no-DB, no-React module). Given an Option's `kind`, `url`, and `phone` it returns a `DecidedAction[]` — each `{ label, href }` where `label` is `"Menu" | "Call" | "Recipe"` (`DecidedActionLabel`). A "Call" action's `href` is `tel:<phone>`; "Menu" and "Recipe" carry the Option's `url`. Critically, the `url` is run through a `safeHttpUrl` check first: a Catalog `url` is free text the Household typed and is never scheme-checked on save, so a `javascript:` or `data:` value must yield **no** button — only `http`/`https` urls become live links. A `phone` is still trusted, so an unsafe `url` on a Restaurant with a phone still yields the "Call" button. Extend `getTonightData` so each Option additionally carries `url` and `phone` (both nullable; `phone` is always null for a Home meal) — these feed `decidedActions`.

`decidedActions` is unit-tested in `lib/tonights-dinner.test.ts` (Vitest), matching the pure-logic style of the existing ranking-engine and local-day suites, with hand-built fixtures exercising each kind/field combination plus the unsafe-scheme cases. The decided block carries no UI component unit tests (consistent with v1) but the action buttons must be keyboard-operable with visible focus (plain anchors, with a focus ring) and meet the 44×44px touch-target minimum (`min-h-11` plus horizontal padding); `tel:` links open in place while `url` links open in a new tab with `rel="noopener noreferrer"`.

## Acceptance criteria

- [ ] `TonightsDinnerBlock` renders a `<ul>` of decided rows; each row links the Option name to `/catalog/[id]` and shows the shared `RowChips` (Recency chip + Tag chips with per-Tag recency); no Explanation chip
- [ ] Each decided row carries the 3px meal-kind left bar and a light kind-tinted wash background (`kind-home-wash` / `kind-restaurant-wash`) distinguishing the decided area from the picker
- [ ] A Picked Restaurant with both fields shows a "Menu" button and a "Call" button
- [ ] A Picked Restaurant missing one field shows only the button whose field is set; with neither, no action buttons
- [ ] A Picked Home meal with a `url` shows a "Recipe" button; without a `url`, no button
- [ ] A Home meal never shows "Menu" or "Call", even with a stray `phone`
- [ ] "Call" is a `tel:` link; "Menu" and "Recipe" open the Option's `url` in a new tab
- [ ] A `url` with a non-`http(s)` scheme (`javascript:`, `data:`) yields no "Menu"/"Recipe" button; an unsafe `url` still leaves a "Call" button when `phone` is set
- [ ] `getTonightData` returns each Option's `url` and `phone`
- [ ] `decidedActions` is unit-tested (Vitest, `lib/tonights-dinner.test.ts`) across the kind/field combinations and the unsafe-scheme cases
- [ ] The action buttons are keyboard-operable with visible focus and meet the 44×44px touch-target minimum

## Blocked by

- 11 — Two-mode Tonight: the "Tonight's dinner" decided block
