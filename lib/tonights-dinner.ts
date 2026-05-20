/**
 * Tonight's dinner — the pure module behind the two-mode Tonight screen.
 *
 * No DB, no React. The Tonight server component calls `splitTonight` to
 * partition the ranked Catalog into the decided block ("Tonight's dinner")
 * and the picker (what is not yet Picked). It is a pure function of three
 * inputs the page already has — the live ranking, today's Log entries,
 * and a second ranking computed over the Log with today's entries dropped.
 *
 * The second ranking is the load-bearing trick. A just-Picked Option's
 * own Pick would otherwise collapse its per-Option recency to zero and
 * mute every Tag-recency tile in the decided block. `decidedRows` ranks
 * the same Catalog as it stood *before* tonight, so the decided block
 * shows "5d" rather than "0d" for an Option that was last eaten five
 * days before tonight's Pick.
 *
 * `decidedActions` lives here too — the per-row Menu / Call / Recipe
 * button set is a deterministic projection of `kind`, `url`, and `phone`,
 * exactly the same shape `decidedRows` returns, so the screen layer can
 * call it from JSX without re-reading the Option.
 */
import type { RankOption, TonightRow } from "./ranking";

/**
 * A single Log entry dated today. The decided block uses `createdAt` to
 * order Picks oldest-first and `id` as the handle `deleteLogEntry` takes.
 */
export type TodayLogEntry = {
  id: string;
  optionId: string;
  createdAt: Date;
};

/**
 * One row of the decided "Tonight's dinner" block — an Option that was
 * Picked tonight, paired with the Log entry that records the Pick (so
 * the Remove control can address it by id).
 */
export type TonightsDinnerEntry = {
  /** The Log entry id — the handle `deleteLogEntry` takes. */
  entryId: string;
  /** The Option's row as ranked *before* tonight's Picks. */
  row: TonightRow;
};

/**
 * The two halves of Tonight after partitioning by today's Picks.
 */
export type SplitTonight = {
  /** The decided block, oldest Pick first (stable by `createdAt`). */
  tonightsDinner: TonightsDinnerEntry[];
  /** The picker — every still-unpicked row from `rankedRows`. */
  picker: TonightRow[];
};

/**
 * Partition Tonight into the decided block and the picker.
 *
 * - `rankedRows`: the live ranking of the active Catalog, computed over
 *   the whole Log up to and including today.
 * - `todayEntries`: today's `dinner_log` rows (one per Pick).
 * - `decidedRows`: the same Catalog ranked over the Log *minus* today's
 *   entries — so a decided-block Option's chips reflect its recency as
 *   it stood before tonight's Pick rather than collapsing to zero.
 *
 * A today entry whose Option is absent from `decidedRows` (e.g. the
 * Option was Archived after being Picked, so it has dropped out of the
 * active Catalog) is skipped without error.
 */
export function splitTonight(
  rankedRows: readonly TonightRow[],
  todayEntries: readonly TodayLogEntry[],
  decidedRows: readonly TonightRow[],
): SplitTonight {
  const decidedById = new Map<string, TonightRow>();
  for (const row of decidedRows) {
    decidedById.set(row.option.id, row);
  }

  const ordered = [...todayEntries].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const tonightsDinner: TonightsDinnerEntry[] = [];
  const pickedOptionIds = new Set<string>();
  for (const entry of ordered) {
    const row = decidedById.get(entry.optionId);
    if (!row) continue;
    tonightsDinner.push({ entryId: entry.id, row });
    pickedOptionIds.add(entry.optionId);
  }

  const picker = rankedRows.filter(
    (row) => !pickedOptionIds.has(row.option.id),
  );

  return { tonightsDinner, picker };
}

/**
 * The labels each per-row action button can carry. "Menu" and "Call" are
 * Restaurant-only; "Recipe" is Home-meal-only.
 */
export type DecidedActionLabel = "Menu" | "Call" | "Recipe";

/**
 * One per-row action button — a `<Link>` to render in the decided block.
 */
export type DecidedAction = {
  label: DecidedActionLabel;
  href: string;
};

/**
 * The Option's `url` is free text the Household typed; it is never
 * scheme-checked on save. A `javascript:` or `data:` value must yield
 * **no** Menu/Recipe button — only `http(s)` urls become live links.
 *
 * Parsing through `URL` rather than a regex catches whitespace tricks
 * (a leading newline before `javascript:` etc.) for free.
 */
function safeHttpUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Per-row action buttons for the decided block.
 *
 * A Picked Restaurant with a `url` shows "Menu"; with a `phone` shows
 * "Call". A Picked Home meal with a `url` shows "Recipe"; a `phone` on
 * a Home meal is ignored even if somehow set. An unsafe (non-`http(s)`)
 * `url` yields no Menu/Recipe button, but still leaves a "Call" button
 * for a Restaurant whose `phone` is set — the phone is trusted because
 * the field is shaped, not free-form.
 */
export function decidedActions(option: {
  kind: "home" | "restaurant";
  url: string | null;
  phone: string | null;
}): DecidedAction[] {
  const actions: DecidedAction[] = [];
  const safeUrl = safeHttpUrl(option.url);

  if (option.kind === "restaurant") {
    if (safeUrl !== null) {
      actions.push({ label: "Menu", href: safeUrl });
    }
    if (option.phone != null && option.phone.trim() !== "") {
      actions.push({ label: "Call", href: `tel:${option.phone.trim()}` });
    }
    return actions;
  }

  // Home meal — only Recipe, never Menu/Call.
  if (safeUrl !== null) {
    actions.push({ label: "Recipe", href: safeUrl });
  }
  return actions;
}

// Re-export RankOption so callers can use a single import path.
export type { RankOption };
