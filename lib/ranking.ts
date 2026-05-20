/**
 * Tonight ranking engine — a pure deep module (ADR-0003).
 *
 * No database, no React, no clock — everything goes in as integers and
 * comes back as a sorted `TonightRow[]`. The Tonight server component is
 * a thin shell around this: it loads Options + Log rows, converts
 * `eaten_on` to epoch-days via `lib/local-day.ts`, and calls
 * `rankTonight`.
 *
 * There is intentionally no explanation string — the shipped Tonight row
 * carries a Recency chip + Tag chips, not the prose "Explanation chip" the
 * older PRDs described. `TonightRow` therefore carries `recencyDays` and
 * `neverEaten` (the inputs the chip renders) but no formatted prose.
 */
import { CAP, OVERDUE_THRESHOLD, W_OPTION, W_TAG } from "./ranking.config";

export type RankOption = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  tags: string[];
  url: string | null;
  phone: string | null;
};

export type RankLogEntry = {
  optionId: string;
  /** Integer epoch-day. The caller has already converted from SQL `date`. */
  eatenOn: number;
};

export type TagRecency = {
  name: string;
  /** Integer days since this Tag was last eaten across the active Catalog. */
  days: number;
  /** True when no active Option carrying this Tag has ever been eaten. */
  neverEaten: boolean;
  /** True when `days >= OVERDUE_THRESHOLD` — the greener tint flips on. */
  overdue: boolean;
};

export type TonightRow = {
  option: RankOption;
  score: number;
  tags: TagRecency[];
  /** Per-Option recency in integer days, capped at `CAP`. */
  recencyDays: number;
  /** True when this Option has never been eaten — chip reads `new`. */
  neverEaten: boolean;
};

/**
 * Integer days from `day` to `today`. `null` (never eaten) yields `CAP`.
 * A future `day` (somehow) is clamped to 0 — Score still rewards the next
 * candidate without going negative.
 */
export function daysSince(day: number | null, today: number): number {
  if (day === null) return CAP;
  return Math.max(0, Math.min(CAP, today - day));
}

/**
 * Most-recent `eatenOn` for `optionId` that is **not after `today`** —
 * Planned dinners (future entries) are excluded from the ranking. `null`
 * when there is no such entry.
 */
export function lastEaten(
  entries: readonly RankLogEntry[],
  optionId: string,
  today: number,
): number | null {
  let best: number | null = null;
  for (const entry of entries) {
    if (entry.optionId !== optionId) continue;
    if (entry.eatenOn > today) continue;
    if (best === null || entry.eatenOn > best) {
      best = entry.eatenOn;
    }
  }
  return best;
}

/**
 * Most-recent `eatenOn` of any active Option carrying `tag`, not after
 * `today`. The Tag's "per-Tag recency" — the variety side of the Score.
 */
export function lastTagUse(
  entries: readonly RankLogEntry[],
  options: readonly RankOption[],
  tag: string,
  today: number,
): number | null {
  const carriers = new Set<string>();
  const lowered = tag.toLowerCase();
  for (const option of options) {
    if (option.tags.some((t) => t.toLowerCase() === lowered)) {
      carriers.add(option.id);
    }
  }
  let best: number | null = null;
  for (const entry of entries) {
    if (!carriers.has(entry.optionId)) continue;
    if (entry.eatenOn > today) continue;
    if (best === null || entry.eatenOn > best) {
      best = entry.eatenOn;
    }
  }
  return best;
}

/**
 * Score = `W_OPTION * antiRepeat + W_TAG * variety`.
 *
 * `variety` is `mean(tagDays)` for a tagged Option and equals `antiRepeat`
 * for a tagless one — so a tagless Option is ranked purely on per-Option
 * recency, and a tagged Option blends in its Tags' aggregate recency.
 */
export function optionScore(antiRepeat: number, tagDays: readonly number[]): number {
  const variety =
    tagDays.length === 0
      ? antiRepeat
      : tagDays.reduce((sum, d) => sum + d, 0) / tagDays.length;
  return W_OPTION * antiRepeat + W_TAG * variety;
}

/**
 * Rank `options` descending by Score, with `localeCompare` tie-break.
 * Cold start (every Score ties — e.g. zero Log entries) therefore falls
 * back to alphabetical order, which the criteria call out explicitly.
 */
export function rankTonight(
  options: readonly RankOption[],
  entries: readonly RankLogEntry[],
  today: number,
): TonightRow[] {
  const rows: TonightRow[] = options.map((option) => {
    const last = lastEaten(entries, option.id, today);
    const antiRepeat = daysSince(last, today);
    const neverEaten = last === null;

    const tags: TagRecency[] = option.tags.map((tagName) => {
      const tagLast = lastTagUse(entries, options, tagName, today);
      const days = daysSince(tagLast, today);
      return {
        name: tagName,
        days,
        neverEaten: tagLast === null,
        overdue: days >= OVERDUE_THRESHOLD,
      };
    });

    const tagDays = tags.map((t) => t.days);
    const score = optionScore(antiRepeat, tagDays);

    return {
      option,
      score,
      tags,
      recencyDays: antiRepeat,
      neverEaten,
    };
  });

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.option.name.localeCompare(b.option.name);
  });
  return rows;
}

/**
 * Single-Option ranking — the input the Option detail page hands to its
 * "Recency" block. Reuses the engine's recency internals (`lastEaten`,
 * `lastTagUse`, `daysSince`, `optionScore`) so that for an active Option
 * the result matches that Option's row in `rankTonight` over the same
 * inputs — the detail page and Tonight never disagree.
 *
 * The caller supplies `activeOptions` and `activeLog` so the engine can
 * compute per-Tag recency against the active Catalog (same scope as
 * `rankTonight`). `targetLog` is the Option's own Log entries — these
 * may include entries for an Archived target (`activeLog` filters
 * Archived Options out, but the target's own history is still relevant
 * to its per-Option recency chip).
 *
 * `score` is `null` for an Archived Option — the detail page exercises
 * that path in a later ticket; for an active Option it equals the
 * Option's `rankTonight` Score over the same inputs.
 */
export type RankOptionInput = {
  target: RankOption;
  activeOptions: readonly RankOption[];
  activeLog: readonly RankLogEntry[];
  /** The target Option's own Log entries (Active or Archived). */
  targetLog: readonly RankLogEntry[];
  /** Integer epoch-day for today. */
  today: number;
  /**
   * When true, the target is treated as Archived: `score` returns `null`
   * and the Recency chip still resolves from `targetLog`. Defaults to
   * `false`. The detail page wires this in a later ticket.
   */
  archived?: boolean;
};

export type OptionRanking = {
  /** `null` for an Archived Option. */
  score: number | null;
  tags: TagRecency[];
  /** Per-Option recency in integer days, capped at `CAP`. */
  recencyDays: number;
  /** True when the target Option has never been eaten. */
  neverEaten: boolean;
};

export function rankOption(input: RankOptionInput): OptionRanking {
  const { target, activeOptions, activeLog, targetLog, today, archived } =
    input;

  // The target's own per-Option recency reads from `targetLog` so an
  // Archived target still resolves a meaningful chip.
  const last = lastEaten(targetLog, target.id, today);
  const antiRepeat = daysSince(last, today);
  const neverEaten = last === null;

  // Per-Tag recency reads from the active Catalog + active Log — same
  // scope as `rankTonight`, so the chip values agree row-for-row.
  const tags: TagRecency[] = target.tags.map((tagName) => {
    const tagLast = lastTagUse(activeLog, activeOptions, tagName, today);
    const days = daysSince(tagLast, today);
    return {
      name: tagName,
      days,
      neverEaten: tagLast === null,
      overdue: days >= OVERDUE_THRESHOLD,
    };
  });

  const tagDays = tags.map((t) => t.days);
  const score = archived ? null : optionScore(antiRepeat, tagDays);

  return {
    score,
    tags,
    recencyDays: antiRepeat,
    neverEaten,
  };
}
