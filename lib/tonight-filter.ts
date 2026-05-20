/**
 * Tonight tri-state Tag-filter logic — pure types and functions.
 *
 * Each Tag chip cycles `off → include → exclude → off`. A row survives the
 * filter when:
 *   - kind matches the active `KindFilter` (`all` / `home` / `restaurant`),
 *   - it carries *every* `include` Tag, AND
 *   - it carries *none* of the `exclude` Tags.
 *
 * Tags compare case-insensitively because Tag names are stored as-typed
 * (see `db/schema.ts`).
 */
import type { TonightRow } from "./ranking";

export type ChipState = "off" | "include" | "exclude";
export type KindFilter = "all" | "home" | "restaurant";
export type TagFilters = Record<string, ChipState>;

/** Off → Include → Exclude → Off. */
export function cycleChipState(state: ChipState): ChipState {
  if (state === "off") return "include";
  if (state === "include") return "exclude";
  return "off";
}

/** Screen-reader label for a Tag chip's current state. */
export function chipStateLabel(state: ChipState): string {
  if (state === "include") return "included";
  if (state === "exclude") return "excluded";
  return "not filtered";
}

function rowCarriesTag(row: TonightRow, tag: string): boolean {
  const lowered = tag.toLowerCase();
  return row.option.tags.some((t) => t.toLowerCase() === lowered);
}

/**
 * AND-semantics: kind AND every include Tag AND no exclude Tag.
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
    for (const tag of includes) {
      if (!rowCarriesTag(row, tag)) return false;
    }
    for (const tag of excludes) {
      if (rowCarriesTag(row, tag)) return false;
    }
    return true;
  });
}

/**
 * The Tag vocabulary surfaced as filter chips. Sorted by `localeCompare`
 * so the chip order is stable across renders.
 */
export function distinctTags(rows: readonly TonightRow[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const tag of row.option.tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

/**
 * Words-only restatement of the current filter, voiced under the chips for
 * `role="status"`.
 */
export function filterHint(kind: KindFilter, tagFilters: TagFilters): string {
  const includes: string[] = [];
  const excludes: string[] = [];
  for (const [tag, state] of Object.entries(tagFilters)) {
    if (state === "include") includes.push(tag);
    else if (state === "exclude") excludes.push(tag);
  }
  const parts: string[] = [];
  if (kind === "home") parts.push("home meals only");
  else if (kind === "restaurant") parts.push("restaurants only");
  if (includes.length > 0) parts.push(`including ${includes.join(", ")}`);
  if (excludes.length > 0) parts.push(`excluding ${excludes.join(", ")}`);
  if (parts.length === 0) return "Showing every Option";
  return `Showing ${parts.join(" · ")}`;
}
