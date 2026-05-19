/**
 * Tonight's two modes — a pure module. No DB, no React, no I/O.
 *
 * The Tonight screen decides server-side which mode to render: when no Log
 * entry is dated today it is the ranked **picker**; as soon as the Household
 * Picks an Option it switches to **decided mode**, surfacing the Picked
 * Options as **Tonight's dinner** while the picker stays open below for a
 * second Option (PRD amendment 2026-05-17).
 *
 * `splitTonight` is the one function: given the live `rankedRows`, today's
 * Log entries, and a second ranking computed over the Log with today dropped
 * (`decidedRows`), it returns the two slices the screen needs. The decided
 * slice draws its rows from `decidedRows` so each chip reflects the
 * Option's recency **before** tonight's Pick — not a meaningless "0d"
 * collapsed by its own fresh Log entry.
 *
 * The day-boundary fall-back is implicit: pass only `todayEntries` dated
 * today (the caller's `getTonightData` already returns just those), and a
 * fresh calendar day naturally empties `tonightsDinner`.
 */

import type { TonightRow } from "./ranking";

/**
 * A `dinner_log` row dated today, in the shape `splitTonight` and the screen
 * consume. `id` is the row's primary key — the handle a later "Remove" action
 * deletes by. `createdAt` is the insert timestamp; the decided block lists
 * Options in pick order (oldest first), so a stable `createdAt` keeps the
 * order from drifting when a second Pick lands.
 */
export type TodayLogEntry = {
  id: string;
  optionId: string;
  createdAt: Date;
};

/**
 * One Option surfaced in **Tonight's dinner** — the decided-mode panel. `row`
 * is the Option's `TonightRow` taken from `decidedRows` (the ranking computed
 * over the Log with today's entries dropped), so the chips show its recency
 * as it stood before tonight's Pick. `entryId` is the today Log entry's id,
 * the handle a "Remove" action deletes by.
 */
export type TonightsDinnerEntry = {
  entryId: string;
  row: TonightRow;
};

/**
 * The two slices the Tonight screen needs. `tonightsDinner` is the decided
 * Options in pick order (oldest `createdAt` first); `picker` is the ranked
 * list with the already-Picked Options removed, so the picker only ever
 * offers what is not yet on Tonight's dinner.
 */
export type SplitTonight = {
  tonightsDinner: TonightsDinnerEntry[];
  picker: TonightRow[];
};

/**
 * Split Tonight into its two halves. The Picked Options come from
 * `decidedRows` (recency *before* today); the picker is `rankedRows` with the
 * Picked Options filtered out — no per-row logic needed, the picker just
 * never offers what is already on Tonight's dinner.
 *
 * Stability: `tonightsDinner` orders entries by `createdAt` ascending; ties
 * (identical timestamps) fall back to `entryId.localeCompare` so the order is
 * deterministic across renders. A `todayEntries` row whose Option is absent
 * from `decidedRows` — e.g. Archived after being Picked, so dropped from the
 * active Catalog — is skipped silently rather than erroring; the entry still
 * lives in the Log, it simply has nowhere to render on Tonight.
 */
export function splitTonight(
  rankedRows: readonly TonightRow[],
  todayEntries: readonly TodayLogEntry[],
  decidedRows: readonly TonightRow[],
): SplitTonight {
  const decidedById = new Map<string, TonightRow>();
  for (const row of decidedRows) decidedById.set(row.option.id, row);

  const sortedEntries = [...todayEntries].sort((a, b) => {
    const delta = a.createdAt.getTime() - b.createdAt.getTime();
    if (delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });

  const tonightsDinner: TonightsDinnerEntry[] = [];
  const pickedOptionIds = new Set<string>();
  for (const entry of sortedEntries) {
    pickedOptionIds.add(entry.optionId);
    const row = decidedById.get(entry.optionId);
    if (!row) continue;
    tonightsDinner.push({ entryId: entry.id, row });
  }

  const picker = rankedRows.filter(
    (row) => !pickedOptionIds.has(row.option.id),
  );

  return { tonightsDinner, picker };
}
