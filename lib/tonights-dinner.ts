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

import type { RankOption, TonightRow } from "./ranking";

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

/**
 * The three labels an action button on a Picked Option can carry. "Menu" and
 * "Call" appear on a Picked Restaurant, "Recipe" on a Picked Home meal. The
 * label is also the chosen surface text — "Menu" reads as the Restaurant's
 * web link regardless of whether it actually points at a menu, an order
 * page, or a delivery service. (A "Directions" button from `mapsUrl` was
 * considered and deliberately left out.)
 */
export type DecidedActionLabel = "Menu" | "Call" | "Recipe";

/**
 * One action button surfaced on a Picked Option in the decided block. `href`
 * is either a `tel:` URI (for "Call") or the Option's `url` (for "Menu" /
 * "Recipe"). The `url` is filtered through `safeHttpUrl` upstream of the
 * `{ label, href }` shape, so a stored `javascript:` or `data:` `url`
 * disappears as a button rather than rendering an unsafe anchor.
 */
export type DecidedAction = {
  label: DecidedActionLabel;
  href: string;
};

/**
 * The Option fields `decidedActions` reads. A subset of `RankOption` —
 * `kind`, `url`, `phone`. Taking a structural subset rather than the full
 * `RankOption` keeps the unit tests hand-buildable without padding every
 * fixture with `id` / `name` / `tags`.
 */
type DecidedActionsInput = Pick<RankOption, "kind" | "url" | "phone">;

/**
 * The Catalog's `url` column is **free text** the Household types — it is
 * never scheme-checked on save (CONTEXT.md). So before a `url` becomes a
 * live action-button `href`, this guard runs: only `http://…` and
 * `https://…` are admitted; a `javascript:` or `data:` URL yields `null` and
 * disappears from the action row. Trimming covers stray whitespace; an
 * unparseable URL also collapses to `null`.
 *
 * Returns the trimmed `url` string when safe, or `null` when not. Phone
 * numbers go through a different (no-op) trust path — a `phone` is still
 * trusted, so an unsafe `url` on a Restaurant with a phone still produces
 * the "Call" button.
 */
export function safeHttpUrl(url: string | null): string | null {
  if (url === null) return null;
  const trimmed = url.trim();
  if (trimmed === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return trimmed;
}

/**
 * The action buttons surfaced under a Picked Option's chip row. A Restaurant
 * exposes "Menu" (when `url` is set and `http`/`https`) and "Call" (when
 * `phone` is set). A Home meal exposes "Recipe" (when `url` is set and safe)
 * — never "Menu" or "Call", even if a `phone` is somehow attached. Returns
 * the empty array when no field is set, so a row with no action buttons
 * simply renders no action row.
 */
export function decidedActions(option: DecidedActionsInput): DecidedAction[] {
  const safeUrl = safeHttpUrl(option.url);
  const actions: DecidedAction[] = [];
  if (option.kind === "restaurant") {
    if (safeUrl !== null) actions.push({ label: "Menu", href: safeUrl });
    if (option.phone !== null && option.phone.trim() !== "") {
      actions.push({ label: "Call", href: `tel:${option.phone.trim()}` });
    }
    return actions;
  }
  // Home meal: ignore `phone` entirely (it is always null at the query
  // layer, but the rule holds even if something stray ends up here).
  if (safeUrl !== null) actions.push({ label: "Recipe", href: safeUrl });
  return actions;
}
