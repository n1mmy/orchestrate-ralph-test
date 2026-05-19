/**
 * The Tonight ranking — a pure module. No DB, no React, no I/O; integer
 * arithmetic only. See ADR-0003: the ranking lives in TypeScript precisely so
 * `lib/ranking.test.ts` can table-test it without spinning up Postgres.
 *
 * The math, in one sentence: each Option's Score is a weighted sum of two
 * recency signals — its own per-Option recency (the "anti-repeat" term) and
 * the mean of its Tags' per-Tag recencies (the "variety" term). A tagless
 * Option's variety term equals its anti-repeat term, so a tagless Option is
 * neither rewarded nor punished by having no Tags.
 *
 * The Tonight row carries **no explanation string** — `DESIGN.md` retired the
 * Explanation chip; the Recency chip and Tag chips together show the numbers
 * behind the Score. This module computes only those numbers.
 */

import { CAP, OVERDUE_THRESHOLD, W_OPTION, W_TAG } from "./ranking.config";

/**
 * The Option as the ranking sees it — every field the Tonight row needs to
 * render, plus the two pass-through restaurant fields (`url`, `phone`) that
 * later phases consume. The ranking math ignores `url` and `phone`.
 */
export type RankOption = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  tags: string[];
  url: string | null;
  phone: string | null;
};

/**
 * One Log entry as the ranking sees it — the join to active Options only is
 * done at the query layer (`db/queries.ts`), so every entry here already
 * refers to an active Option. `eatenOn` is an integer epoch-day, not a SQL
 * date string — see `lib/local-day.ts`.
 */
export type RankLogEntry = {
  optionId: string;
  /** Integer epoch-day in `APP_TZ`. */
  eatenOn: number;
};

/**
 * The per-Tag recency surfaced on a Tonight row. `days` is days since any
 * active Option carrying this Tag was last eaten, capped at `CAP`; `overdue`
 * is `days >= OVERDUE_THRESHOLD` (DESIGN.md's overdue heatmap end).
 */
export type TagRecency = {
  tag: string;
  days: number;
  overdue: boolean;
};

/**
 * One ranked row of the Tonight list. The view layer reads `score` to order,
 * `recencyDays` and `neverEaten` for the Recency chip, and `tags` for the Tag
 * chips. **There is no `explanation` field** — the Recency chip replaced the
 * prose Explanation chip.
 */
export type TonightRow = {
  option: RankOption;
  score: number;
  tags: TagRecency[];
  /** The Option's per-Option recency in days, capped at `CAP`. */
  recencyDays: number;
  /** `true` when the Option has no non-future Log entry. */
  neverEaten: boolean;
};

/**
 * Days from `day` to `today`, clamped to `[0, CAP]`. `null` (the Option was
 * never eaten, or no Tag-mate was ever eaten) maps to `CAP` — a never-eaten
 * Option is maximally overdue. A future `day` (a Planned dinner that slipped
 * past the caller's filter) clamps to 0 rather than going negative.
 */
export function daysSince(day: number | null, today: number): number {
  if (day === null) return CAP;
  return Math.max(0, Math.min(CAP, today - day));
}

/**
 * The most-recent epoch-day on which `optionId` was eaten, **not after**
 * `today`. A Planned dinner — a Log entry dated *after* today — is excluded:
 * planning Friday's pasta should not make pasta look freshly eaten today.
 * Returns `null` when there is no qualifying entry.
 */
export function lastEaten(
  entries: readonly RankLogEntry[],
  optionId: string,
  today: number,
): number | null {
  let best: number | null = null;
  for (const e of entries) {
    if (e.optionId !== optionId) continue;
    if (e.eatenOn > today) continue;
    if (best === null || e.eatenOn > best) best = e.eatenOn;
  }
  return best;
}

/**
 * The most-recent epoch-day on which any active Option carrying `tag` was
 * eaten, **not after** `today`. Same future-exclusion rule as `lastEaten`.
 * Returns `null` when no Option carrying this Tag has a qualifying entry.
 *
 * The Tag match is by exact string (the caller normalises Tag names upstream
 * via `lib/normalize-tag.ts`).
 */
export function lastTagUse(
  entries: readonly RankLogEntry[],
  options: readonly RankOption[],
  tag: string,
  today: number,
): number | null {
  const taggedOptionIds = new Set<string>();
  for (const o of options) {
    if (o.tags.includes(tag)) taggedOptionIds.add(o.id);
  }
  if (taggedOptionIds.size === 0) return null;
  let best: number | null = null;
  for (const e of entries) {
    if (!taggedOptionIds.has(e.optionId)) continue;
    if (e.eatenOn > today) continue;
    if (best === null || e.eatenOn > best) best = e.eatenOn;
  }
  return best;
}

/**
 * One Option's Score. The anti-repeat term is the Option's own per-Option
 * recency (already capped at `CAP`). The variety term is the mean of the
 * Option's Tag-recencies — and for a tagless Option, variety **collapses to
 * the anti-repeat term**, so having no Tags is a no-op signal rather than a
 * penalty. With `W_OPTION = W_TAG = 1.0`, a tagless Option's Score is `2 ·
 * antiRepeat`; a tagged Option's Score is `antiRepeat + mean(tagDays)`.
 */
export function optionScore(antiRepeat: number, tagDays: number[]): number {
  const variety =
    tagDays.length === 0
      ? antiRepeat
      : tagDays.reduce((sum, d) => sum + d, 0) / tagDays.length;
  return W_OPTION * antiRepeat + W_TAG * variety;
}

/**
 * Rank a set of `options` against a Log history for a given `today`
 * (epoch-day). Returns one `TonightRow` per Option, sorted by Score
 * descending. Ties break alphabetically by Option name using
 * `localeCompare` — which is also the **cold-start fallback**: with no
 * non-future Log entries every recency is `CAP`, every Score ties, and the
 * list reduces to alphabetical order.
 */
export function rankTonight(
  options: readonly RankOption[],
  entries: readonly RankLogEntry[],
  today: number,
): TonightRow[] {
  const rows: TonightRow[] = options.map((option) => {
    const last = lastEaten(entries, option.id, today);
    const recencyDays = daysSince(last, today);
    const neverEaten = last === null;
    const tags: TagRecency[] = option.tags.map((tag) => {
      const tagLast = lastTagUse(entries, options, tag, today);
      const days = daysSince(tagLast, today);
      return { tag, days, overdue: days >= OVERDUE_THRESHOLD };
    });
    const score = optionScore(
      recencyDays,
      tags.map((t) => t.days),
    );
    return { option, score, tags, recencyDays, neverEaten };
  });
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.option.name.localeCompare(b.option.name);
  });
  return rows;
}
