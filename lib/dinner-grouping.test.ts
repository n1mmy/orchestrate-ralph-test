import { describe, expect, it } from "vitest";

import {
  formatDinnerDate,
  groupByDate,
  groupByDay,
  splitDinners,
  type DayRecord,
  type LogEntryLike,
  type RejectionLike,
} from "./dinner-grouping";

function entry(id: string, eatenOn: string): LogEntryLike {
  return { id, eatenOn };
}

function rejection(id: string, rejectedOn: string): RejectionLike {
  return { id, rejectedOn };
}

describe("dinner-grouping", () => {
  describe("groupByDate", () => {
    it("buckets items by the date returned by `dateOf`", () => {
      const items = [
        entry("a", "2026-05-20"),
        entry("b", "2026-05-19"),
        entry("c", "2026-05-20"),
      ];
      const grouped = groupByDate(items, (e) => e.eatenOn);
      expect(grouped.get("2026-05-20")?.map((e) => e.id)).toEqual(["a", "c"]);
      expect(grouped.get("2026-05-19")?.map((e) => e.id)).toEqual(["b"]);
    });

    it("preserves input order within a bucket", () => {
      const items = [
        entry("first", "2026-05-20"),
        entry("second", "2026-05-20"),
        entry("third", "2026-05-20"),
      ];
      const grouped = groupByDate(items, (e) => e.eatenOn);
      expect(grouped.get("2026-05-20")?.map((e) => e.id)).toEqual([
        "first",
        "second",
        "third",
      ]);
    });
  });

  describe("splitDinners", () => {
    it("treats a record dated today as History (not Upcoming)", () => {
      const today = "2026-05-20";
      const records: DayRecord[] = [
        { date: today, entries: [entry("a", today)], rejections: [] },
        {
          date: "2026-05-21",
          entries: [entry("b", "2026-05-21")],
          rejections: [],
        },
      ];
      const { upcoming, history } = splitDinners(records, today);
      expect(upcoming.map((r) => r.date)).toEqual(["2026-05-21"]);
      expect(history.map((r) => r.date)).toEqual([today]);
    });

    it("orders upcoming soonest-first and history newest-first", () => {
      const today = "2026-05-20";
      const records: DayRecord[] = [
        { date: "2026-05-15", entries: [entry("a", "2026-05-15")], rejections: [] },
        { date: "2026-05-22", entries: [entry("b", "2026-05-22")], rejections: [] },
        { date: "2026-05-18", entries: [entry("c", "2026-05-18")], rejections: [] },
        { date: "2026-05-25", entries: [entry("d", "2026-05-25")], rejections: [] },
      ];
      const { upcoming, history } = splitDinners(records, today);
      expect(upcoming.map((r) => r.date)).toEqual(["2026-05-22", "2026-05-25"]);
      expect(history.map((r) => r.date)).toEqual(["2026-05-18", "2026-05-15"]);
    });
  });

  describe("groupByDay", () => {
    const today = "2026-05-20";

    it("splits Log entries at the today boundary", () => {
      const entries = [
        entry("a", today),
        entry("b", "2026-05-22"),
        entry("c", "2026-05-15"),
      ];
      const { upcoming, history } = groupByDay(entries, [], today);
      expect(upcoming.map((r) => r.date)).toEqual(["2026-05-22"]);
      expect(history.map((r) => r.date)).toEqual([today, "2026-05-15"]);
    });

    it("splits Rejections at the today boundary the same way", () => {
      const rejections = [
        rejection("r1", today),
        rejection("r2", "2026-05-21"),
        rejection("r3", "2026-05-10"),
      ];
      const { upcoming, history } = groupByDay([], rejections, today);
      expect(upcoming.map((r) => r.date)).toEqual(["2026-05-21"]);
      expect(history.map((r) => r.date)).toEqual([today, "2026-05-10"]);
    });

    it("collapses same-date Log entries and Rejections into one record", () => {
      const entries = [entry("e1", "2026-05-18"), entry("e2", "2026-05-18")];
      const rejections = [rejection("r1", "2026-05-18")];
      const { history } = groupByDay(entries, rejections, today);
      expect(history).toHaveLength(1);
      expect(history[0].date).toBe("2026-05-18");
      expect(history[0].entries.map((e) => e.id)).toEqual(["e1", "e2"]);
      expect(history[0].rejections.map((r) => r.id)).toEqual(["r1"]);
    });

    it("forms a record for a date carrying only Rejections", () => {
      const rejections = [rejection("only", "2026-05-12")];
      const { history } = groupByDay([], rejections, today);
      expect(history).toHaveLength(1);
      expect(history[0].date).toBe("2026-05-12");
      expect(history[0].entries).toEqual([]);
      expect(history[0].rejections.map((r) => r.id)).toEqual(["only"]);
    });

    it("preserves input order within a record's arrays", () => {
      const entries = [
        entry("first", "2026-05-18"),
        entry("second", "2026-05-18"),
        entry("third", "2026-05-18"),
      ];
      const rejections = [
        rejection("rA", "2026-05-18"),
        rejection("rB", "2026-05-18"),
      ];
      const { history } = groupByDay(entries, rejections, today);
      expect(history[0].entries.map((e) => e.id)).toEqual([
        "first",
        "second",
        "third",
      ]);
      expect(history[0].rejections.map((r) => r.id)).toEqual(["rA", "rB"]);
    });

    it("orders upcoming soonest-first and history newest-first", () => {
      const entries = [
        entry("a", "2026-05-25"),
        entry("b", "2026-05-22"),
        entry("c", "2026-05-15"),
        entry("d", "2026-05-18"),
      ];
      const { upcoming, history } = groupByDay(entries, [], today);
      expect(upcoming.map((r) => r.date)).toEqual([
        "2026-05-22",
        "2026-05-25",
      ]);
      expect(history.map((r) => r.date)).toEqual([
        "2026-05-18",
        "2026-05-15",
      ]);
    });

    it("returns empty arrays for empty inputs", () => {
      expect(groupByDay([], [], today)).toEqual({
        upcoming: [],
        history: [],
      });
    });

    it("places a today-dated Rejection in History, not Upcoming", () => {
      // Pin the exact today boundary for both entries and Rejections.
      const entries = [entry("e-today", today)];
      const rejections = [
        rejection("r-today", today),
        rejection("r-tomorrow", "2026-05-21"),
      ];
      const { upcoming, history } = groupByDay(entries, rejections, today);
      expect(upcoming.map((r) => r.date)).toEqual(["2026-05-21"]);
      expect(history.map((r) => r.date)).toEqual([today]);
      // Same-date entry + rejection collapse into the today record.
      expect(history[0].entries.map((e) => e.id)).toEqual(["e-today"]);
      expect(history[0].rejections.map((r) => r.id)).toEqual(["r-today"]);
    });
  });

  describe("formatDinnerDate", () => {
    const today = "2026-05-20";

    it("labels today as `Today`", () => {
      expect(formatDinnerDate(today, today)).toBe("Today");
    });

    it("labels +1 day as `Tomorrow`", () => {
      expect(formatDinnerDate("2026-05-21", today)).toBe("Tomorrow");
    });

    it("labels -1 day as `Yesterday`", () => {
      expect(formatDinnerDate("2026-05-19", today)).toBe("Yesterday");
    });

    it("labels a past date as `<short weekday>, <Month> <D> · N days ago`", () => {
      // 2026-05-15 is a Friday (May 1 2026 is a Friday).
      expect(formatDinnerDate("2026-05-15", today)).toBe(
        "Fri, May 15 · 5 days ago",
      );
    });

    it("labels a far-future date as `<short weekday>, <Month> <D>` (no `days ago` suffix)", () => {
      // 2026-05-25 is a Monday.
      expect(formatDinnerDate("2026-05-25", today)).toBe("Mon, May 25");
    });

    it("crosses a month boundary correctly", () => {
      // today is 2026-05-02; date is 2026-04-28 — a Tuesday, 4 days ago.
      expect(formatDinnerDate("2026-04-28", "2026-05-02")).toBe(
        "Tue, Apr 28 · 4 days ago",
      );
    });
  });
});
