/**
 * The Tonight tag-filter zone — a pure module. No DB, no React, no I/O.
 *
 * The Tonight screen ranks every active Option; this module narrows what the
 * Household actually sees from that ranked list, without touching the ranking
 * math. Two filter channels run in parallel and **AND** together:
 *
 *  - the **kind segment** (All / Home / Restaurant) — the segmented control
 *    in the page header that limits the list to one meal kind, and
 *  - the **tag filter chips** — each Tag has a tri-state chip that cycles
 *    `off → include → exclude → off`. An `include` Tag must be present on the
 *    row; an `exclude` Tag must be absent. Multiple `include` Tags AND
 *    together — the row must carry *all* of them.
 *
 * The types and the four predicate/label helpers live here so they're
 * directly unit-testable from `lib/tonight-filter.test.ts`. The screen layer
 * (`app/tonight-screen.tsx`) wires them to React state and renders the chips.
 */

import type { TonightRow } from "./ranking";

/**
 * The three states of a tag filter chip. A chip starts `off` (inert); tapping
 * cycles it through `include` (row must carry this Tag) and `exclude` (row
 * must not carry this Tag) and back to `off`.
 */
export type ChipState = "off" | "include" | "exclude";

/**
 * The kind segment in the page header — `all` shows every Option, `home`
 * shows only home-cooked, `restaurant` only restaurants.
 */
export type KindFilter = "all" | "home" | "restaurant";

/**
 * The active tag filter chips, keyed by Tag name. Tags whose chip is `off`
 * may be omitted (an absent key is treated as `off`).
 */
export type TagFilters = Record<string, ChipState>;

/**
 * Advance a chip one step: `off → include → exclude → off`. The single
 * transition shape every chip uses, so tests can assert the cycle without
 * touching React.
 */
export function cycleChipState(state: ChipState): ChipState {
  switch (state) {
    case "off":
      return "include";
    case "include":
      return "exclude";
    case "exclude":
      return "off";
  }
}

/**
 * Restate a `ChipState` for an accessible name. Combined with the Tag name
 * the chip's `aria-label` becomes "pasta, included" — so a screen reader user
 * hears the state even though sighted users read it from the
 * underline/strikethrough decoration.
 */
export function chipStateLabel(state: ChipState): string {
  switch (state) {
    case "include":
      return "included";
    case "exclude":
      return "excluded";
    case "off":
      return "not filtered";
  }
}

/**
 * The Tonight filter predicate. A row survives only if it
 *
 *  1. matches the kind segment (`all` accepts both kinds), **and**
 *  2. carries every Tag whose chip is `include`, **and**
 *  3. carries none of the Tags whose chip is `exclude`.
 *
 * The order of the input rows is preserved — this is a filter, not a re-sort;
 * the ranking from `rankTonight` is left intact.
 */
export function filterTonightRows(
  rows: readonly TonightRow[],
  kind: KindFilter,
  tagFilters: TagFilters,
): TonightRow[] {
  const includes: string[] = [];
  const excludes: string[] = [];
  for (const [tag, state] of Object.entries(tagFilters)) {
    if (state === "include") includes.push(tag);
    else if (state === "exclude") excludes.push(tag);
  }
  return rows.filter((row) => {
    if (kind !== "all" && row.option.kind !== kind) return false;
    const tags = row.option.tags;
    for (const inc of includes) if (!tags.includes(inc)) return false;
    for (const exc of excludes) if (tags.includes(exc)) return false;
    return true;
  });
}

/**
 * Collect the distinct Tag vocabulary from the ranked rows, sorted via
 * `localeCompare`. This is what the filter zone offers as chips — one chip per
 * Tag that appears anywhere in the ranked list. Tags already canonicalised
 * upstream by `lib/normalize-tag.ts`, so we deduplicate by exact string.
 */
export function distinctTags(rows: readonly TonightRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const tag of row.option.tags) seen.add(tag);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/**
 * Restate the active filter in words for the `role="status"` hint line under
 * the chips. "Showing Home meals with pasta, without fish" — the kind segment
 * names the noun, the include/exclude Tags name the qualifiers. With no
 * filters active the hint reads "Showing all Options".
 */
export function filterHint(kind: KindFilter, tagFilters: TagFilters): string {
  const includes: string[] = [];
  const excludes: string[] = [];
  for (const [tag, state] of Object.entries(tagFilters)) {
    if (state === "include") includes.push(tag);
    else if (state === "exclude") excludes.push(tag);
  }
  includes.sort((a, b) => a.localeCompare(b));
  excludes.sort((a, b) => a.localeCompare(b));

  const noun =
    kind === "home"
      ? "Home meals"
      : kind === "restaurant"
        ? "Restaurants"
        : "all Options";

  const clauses: string[] = [];
  if (includes.length > 0) clauses.push(`with ${includes.join(", ")}`);
  if (excludes.length > 0) clauses.push(`without ${excludes.join(", ")}`);
  if (clauses.length === 0) return `Showing ${noun}`;
  return `Showing ${noun} ${clauses.join(", ")}`;
}
