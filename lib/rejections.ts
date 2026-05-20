/**
 * Pure Rejection partitioning for the AI search snapshot — no I/O,
 * the unit-test target.
 *
 * The boundary is exact equality on a SQL `YYYY-MM-DD` date string. Today's
 * Rejections (`rejectedOn === today`) feed both the snapshot's
 * "Rejected tonight" group *and* the `suppressedToday` Option-id set the
 * snapshot builder uses to drop today-rejected Options from the candidate
 * list (leaving a deliberate number gap so the model can still see why an
 * Option was passed over without ever resurfacing it as a result).
 *
 * Every other Rejection — past-dated *and* future-dated — lands in the
 * "Other rejections" group and is **not** in `suppressedToday`: those
 * Options stay candidates the model may re-consider while reading their
 * Rejection history.
 *
 * The snapshot refers to every Option by its small alphabetical integer,
 * never the UUID, so this module takes an `indexByOptionId` map and emits
 * `SnapshotRejection` rows already addressed by integer. Free text is
 * wrapped in `<household-text>` delimiters via `delimitNullable` so the
 * model can never read household-authored text as instructions — a `null`
 * reason is carried through as `null` (an unexplained Rejection is honest
 * weak data, not a blank delimiter pair).
 */

import { delimit, delimitNullable, formatDateWithWeekday } from "./snapshot-format";

/**
 * One Rejection row as it enters `partitionRejections`. The Option's
 * `name` / `kind` / `tags` ride along so the snapshot can render the
 * Rejection without a second lookup.
 */
export type RejectionRow = {
  optionId: string;
  /** Household-authored — `null` when blank. */
  reason: string | null;
  /** SQL date string `YYYY-MM-DD`. */
  rejectedOn: string;
  optionName: string;
  kind: "home" | "restaurant";
  tags: string[];
};

/**
 * One snapshot row inside the Rejections block. The Option is named by
 * `name` (delimited) *and* referred to by `id` (the snapshot's integer
 * position) — the model reasons about the Rejection's Option by integer
 * just as it does for Log entries.
 */
export type SnapshotRejection = {
  /** Snapshot integer id of the Option. */
  id: number;
  /** Delimited Option name. */
  name: string;
  kind: "home" | "restaurant";
  /** Each tag wrapped in `<household-text>` delimiters. */
  tags: string[];
  /** `{Weekday} {YYYY-MM-DD}`. */
  date: string;
  /** Wrapped in `<household-text>` when present; `null` carried as `null`. */
  reason: string | null;
};

/**
 * The Rejections block carried inside `ModelSnapshot.rejections`. Two
 * groups: `rejectedTonight` is dated exactly today (Options dropped from
 * the candidate list); `notTodayRejections` is every other row (past
 * *and* future-dated — Options that remain candidates).
 */
export type RejectionsBlock = {
  rejectedTonight: SnapshotRejection[];
  notTodayRejections: SnapshotRejection[];
};

/**
 * Output of `partitionRejections`.
 *
 * `suppressedToday` is the Set of Option ids whose Rejection is dated
 * exactly today — the snapshot builder drops these from the candidate
 * `options` array (and from `idByIndex`) so `parseAndValidate` cannot
 * resurface them. Future-dated Rejections are deliberately excluded from
 * this set (a Planned Rejection doesn't suppress an Option *now*).
 */
export type PartitionedRejections = {
  suppressedToday: Set<string>;
  block: RejectionsBlock;
};

/**
 * Partition a list of Rejection rows around `today` and shape each row
 * into a `SnapshotRejection` referenced by the snapshot's integer id.
 *
 * Rows whose Option has no entry in `indexByOptionId` are dropped — the
 * snapshot can't refer to an Option it never numbered (e.g. an Archived
 * Option, though those are filtered upstream by the query).
 *
 * Each group is sorted newest `rejectedOn` first by a stable sort; ties
 * preserve the input order, so the query's `created_at` secondary sort
 * carries through.
 */
export function partitionRejections(
  rows: ReadonlyArray<RejectionRow>,
  today: string,
  indexByOptionId: ReadonlyMap<string, number>,
): PartitionedRejections {
  const suppressedToday = new Set<string>();
  const rejectedTonightRaw: RejectionRow[] = [];
  const notTodayRaw: RejectionRow[] = [];

  for (const row of rows) {
    if (!indexByOptionId.has(row.optionId)) continue;
    if (row.rejectedOn === today) {
      suppressedToday.add(row.optionId);
      rejectedTonightRaw.push(row);
    } else {
      notTodayRaw.push(row);
    }
  }

  const sortNewestFirst = (a: RejectionRow, b: RejectionRow): number => {
    if (a.rejectedOn < b.rejectedOn) return 1;
    if (a.rejectedOn > b.rejectedOn) return -1;
    return 0;
  };

  rejectedTonightRaw.sort(sortNewestFirst);
  notTodayRaw.sort(sortNewestFirst);

  const shape = (row: RejectionRow): SnapshotRejection => ({
    id: indexByOptionId.get(row.optionId) as number,
    name: delimit(row.optionName) ?? "",
    kind: row.kind,
    tags: row.tags.map((t) => delimit(t) ?? ""),
    date: formatDateWithWeekday(row.rejectedOn),
    reason: delimitNullable(row.reason),
  });

  return {
    suppressedToday,
    block: {
      rejectedTonight: rejectedTonightRaw.map(shape),
      notTodayRejections: notTodayRaw.map(shape),
    },
  };
}
