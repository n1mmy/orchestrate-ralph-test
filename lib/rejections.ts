/**
 * Rejections — the pure helper module behind the AI-search snapshot's
 * Rejections block (ADR-0006). The Household's Rejections — explicit
 * "passed on this for tonight, because…" reactions — are kept as dated history
 * and fed into every AI search, the model judging from each reason and its
 * date frequency which Rejections are a standing dislike and which were one
 * one-off. This module owns the partition that splits the full history into
 * the two groups the snapshot block carries, and a `Set<string>` of the
 * Option ids the rest of today is suppressed for.
 *
 * Why a separate module: `lib/ai-search.ts` owns the snapshot shape and the
 * model call; the partition is pure, unit-tested in `lib/rejections.test.ts`,
 * and reused by the eval harness without dragging the Anthropic client along.
 * No I/O lives here — the caller passes in a flat `RejectionRow[]` from
 * `db/queries.ts`'s `getRejections` and the `indexByOptionId` map the snapshot
 * builder already computed from the alphabetical Catalog.
 */

import { delimit, delimitNullable, formatDateWithWeekday } from "./snapshot-format";

/**
 * One row from `getRejections` — the active-Option-joined `rejections` table
 * narrowed to what the snapshot needs. `optionName` / `kind` / `tags` are
 * carried alongside the Rejection itself so the snapshot block stays readable
 * standalone (the model never has to cross-reference an Option's name from
 * the integer id while reading the Rejection list).
 */
export type RejectionRow = {
  optionId: string;
  reason: string | null;
  /** SQL `date` string (`YYYY-MM-DD`) in the Household's calendar. */
  rejectedOn: string;
  optionName: string;
  kind: "home" | "restaurant";
  tags: string[];
};

/**
 * One rendered Rejection entry inside the snapshot block — every field
 * pre-formatted for the model:
 *
 *  - `optionId` is the integer snapshot number the Option was assigned by
 *    `buildSnapshot` (never the UUID).
 *  - `optionName` and each `tag` are wrapped in `<household-text>` delimiters
 *    via `delimit`; any literal delimiter substrings inside the original text
 *    have been stripped first.
 *  - `date` is the ADR-0005 weekday-stamped form (`2026-05-20 (Wednesday)`).
 *  - `reason` is the Household-authored reason wrapped via `delimitNullable`,
 *    so a `null` reason carries through as `null` — an unexplained Rejection
 *    is honest weak data, never a delimited empty string.
 */
export type SnapshotRejection = {
  optionId: number;
  optionName: string;
  kind: "home" | "restaurant";
  tags: string[];
  date: string;
  reason: string | null;
};

/**
 * The Rejections block the snapshot carries — two groups built from the same
 * dated history, parallel to the Log block's grouping:
 *
 *  - `rejectedTonight` — Rejections dated **exactly today**. The Options in
 *    this group are dropped from the candidate `options` array; they are
 *    listed here so the model still knows *why* they were turned down (a
 *    reason on a today-rejected Option may still inform the model's ranking
 *    of other Options).
 *  - `notTodayRejections` — every other Rejection: past-dated history *and*
 *    future-dated Planned rejections. The Options in this group remain
 *    candidates — the model reconsiders them while still seeing why they
 *    were once passed over.
 *
 * Each group is sorted newest `rejectedOn` first by a stable sort.
 */
export type RejectionsBlock = {
  rejectedTonight: SnapshotRejection[];
  notTodayRejections: SnapshotRejection[];
};

/**
 * The full output of `partitionRejections`: the `RejectionsBlock` ready to
 * attach to the snapshot, plus a `suppressedToday` `Set<string>` of every
 * Option id rejected dated exactly today. The Option id is the UUID; the
 * snapshot builder reads the set to drop those Options from the candidate
 * `options` array (and from `idByIndex`) — that is the AI-result side of
 * Rejection suppression.
 */
export type PartitionedRejections = {
  block: RejectionsBlock;
  suppressedToday: Set<string>;
};

/**
 * Partition a flat `RejectionRow[]` into the snapshot block and the
 * `suppressedToday` set. Pure — no I/O, no clock; `today` is passed in.
 *
 * Boundary: an exact equality on the SQL date string. A row dated `today`
 * lands in `rejectedTonight` and its Option's id joins `suppressedToday`;
 * every other row — both past-dated history *and* future-dated Planned
 * rejections — lands in `notTodayRejections` and its Option stays a candidate.
 *
 * Each group is shaped into `SnapshotRejection` entries via the
 * `lib/snapshot-format` helpers — the reason wrapped through `delimitNullable`
 * (so `null` carries through as `null`), the date rendered with weekday by
 * `formatDateWithWeekday`, the Option's name delimited and referred to by its
 * snapshot integer, the tags each delimited. A Rejection whose Option is not
 * in `indexByOptionId` (which only contains active candidates) is dropped on
 * the floor — `getRejections` already filters Archived Options upstream, so
 * this guards against a stale `indexByOptionId` only.
 *
 * Sort within each group: newest `rejectedOn` first, stable. Same shape as
 * the Log block.
 */
export function partitionRejections(
  rows: readonly RejectionRow[],
  today: string,
  indexByOptionId: ReadonlyMap<string, number>,
): PartitionedRejections {
  const rejectedTonight: SnapshotRejection[] = [];
  const notTodayRejections: SnapshotRejection[] = [];
  const suppressedToday = new Set<string>();

  // Stable newest-first sort: tag every row with its original index, sort by
  // (rejectedOn desc, index asc). `Array.prototype.sort` is stable in modern
  // engines but the explicit tiebreaker keeps the behaviour load-bearing.
  const indexed = rows.map((row, idx) => ({ row, idx }));
  indexed.sort((a, b) => {
    if (a.row.rejectedOn > b.row.rejectedOn) return -1;
    if (a.row.rejectedOn < b.row.rejectedOn) return 1;
    return a.idx - b.idx;
  });

  for (const { row } of indexed) {
    const isToday = row.rejectedOn === today;
    if (isToday) {
      // The Option is suppressed for the rest of today whether or not it is
      // currently in `indexByOptionId` — a defensive belt-and-braces in case
      // the candidate set was filtered for some other reason.
      suppressedToday.add(row.optionId);
    }

    const snapshotIndex = indexByOptionId.get(row.optionId);
    if (snapshotIndex === undefined) continue;

    const entry: SnapshotRejection = {
      optionId: snapshotIndex,
      optionName: delimit(row.optionName),
      kind: row.kind,
      tags: row.tags.map((t) => delimit(t)),
      date: formatDateWithWeekday(row.rejectedOn),
      reason: delimitNullable(row.reason),
    };

    if (isToday) rejectedTonight.push(entry);
    else notTodayRejections.push(entry);
  }

  return {
    block: { rejectedTonight, notTodayRejections },
    suppressedToday,
  };
}
