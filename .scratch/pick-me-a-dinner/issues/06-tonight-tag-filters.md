# 06 — Tri-state tag filters on Tonight

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The filter zone on the Tonight screen, with its pure logic extracted into
`lib/tonight-filter.ts` so it is directly unit-testable.

The `lib/tonight-filter.ts` module holds the filter types and pure functions —
no DB, no React. `ChipState` is `"off" | "include" | "exclude"`; `KindFilter`
is `"all" | "home" | "restaurant"`; `TagFilters` is a `Record<string,
ChipState>`. `cycleChipState` advances **off → include → exclude → off**.
`chipStateLabel` restates a state for an accessible name ("included" /
"excluded" / "not filtered"). `filterTonightRows(rows, kind, tagFilters)` is the
predicate: a row shows only if it satisfies the kind segment **AND** carries
every include Tag **AND** carries none of the exclude Tags. `distinctTags`
collects the Tag vocabulary from the ranked rows, `localeCompare`-sorted.
`filterHint` restates the active filter in words ("Showing Home meals with
pasta, without fish").

In the screen: the **All/Home/Restaurant** `KindSegment` sits in the page
header beside the "Tonight" heading — `aria-pressed` buttons that set the
`KindFilter`. Below the header, in a sticky filter zone, the **tag filter
chips** each cycle off → include → exclude → off on tap via `cycleChipState`.
Each chip's state has its own fill — a neutral off chip, an `action`-filled
include chip, an `exclude`-filled exclude chip — plus a text decoration
(underline for include, line-through for exclude) so state stays legible
without color (§18). The chip border is present in every state so toggling
never reflows the wrapped rows. A hint line (`filterHint`) under the chips,
`role="status"` `aria-live="polite"`, states the active filter in words.

Per §18: chip state is legible in grayscale (the underline / strikethrough text
decorations carry it, not color alone), each chip's accessible name announces
its state via `aria-label` ("pasta, included"). The kind segment buttons are
≥ 44×44px; the tag chips are deliberately compact (the zone holds ~20 tags and
density beats a 44px target there). The carried-over `exclude` token still
awaits its own visual pass against the cool base — re-tune it here if needed,
but the underline/strikethrough affordances are the load-bearing signal.

## Acceptance criteria

- [ ] The All/Home/Restaurant `KindSegment` (in the page header) filters the
      Tonight list by Option kind
- [ ] Tag chips cycle off → include → exclude → off via `cycleChipState`;
      include shows only matching Options, exclude hides matching Options
- [ ] `filterTonightRows` ANDs the kind segment and all tag filters together;
      the `filterHint` line states the active filter in words
- [ ] Chip state is distinguishable in grayscale (underline / strikethrough)
      and announced to screen readers via `aria-label` (`chipStateLabel`)
- [ ] `lib/tonight-filter.test.ts` covers the off → include → exclude cycle
      and that the kind segment and tag filters AND together

## Blocked by

- 04 — Tonight: ranked list
