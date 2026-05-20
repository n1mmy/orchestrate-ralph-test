/**
 * Unit tests for the dinner-grouping module. The module is pure — no DB, no
 * React — precisely so these tests can run table-style without spinning up a
 * Postgres or rendering a component.
 *
 * The fixtures are hand-built: minimal records carrying just the date field
 * each helper reads, so the assertions read like English.
 */

import { describe, expect, it } from "vitest";
import {
  formatDinnerDate,
  groupByDate,
  groupByDay,
  splitDinners,
} from "./dinner-grouping";

type Entry = { id: string; eatenOn: string };
type Rejection = { id: string; rejectedOn: string };

function e(id: string, eatenOn: string): Entry {
  return { id, eatenOn };
}
function r(id: string, rejectedOn: string): Rejection {
  return { id, rejectedOn };
}

describe("formatDinnerDate", () => {
  const TODAY = "2026-05-19"; // Tue, May 19 2026

  it('labels today as "Today"', () => {
    expect(formatDinnerDate("2026-05-19", TODAY)).toBe("Today");
  });

  it('labels today + 1 as "Tomorrow"', () => {
    expect(formatDinnerDate("2026-05-20", TODAY)).toBe("Tomorrow");
  });

  it('labels today - 1 as "Yesterday"', () => {
    expect(formatDinnerDate("2026-05-18", TODAY)).toBe("Yesterday");
  });

  it("labels a non-adjacent date with weekday + month + day", () => {
    expect(formatDinnerDate("2026-05-16", TODAY)).toBe("Sat, May 16");
  });

  it("crosses a month boundary correctly", () => {
    // Today is May 1; the prior date (April 30) renders as a weekday-and-date
    // label in the previous month, not "Yesterday" surrogate gibberish.
    const may1 = "2026-05-01";
    expect(formatDinnerDate("2026-04-30", may1)).toBe("Yesterday");
    expect(formatDinnerDate("2026-04-29", may1)).toBe("Wed, Apr 29");
    // The other direction: today is April 30, tomorrow crosses into May.
    const apr30 = "2026-04-30";
    expect(formatDinnerDate("2026-05-01", apr30)).toBe("Tomorrow");
    expect(formatDinnerDate("2026-05-02", apr30)).toBe("Sat, May 2");
  });
});

describe("groupByDate", () => {
  it("collects same-date items into one bucket, preserving input order", () => {
    const items = [
      e("a", "2026-05-19"),
      e("b", "2026-05-19"),
      e("c", "2026-05-18"),
    ];
    const groups = groupByDate(items, (x) => x.eatenOn);
    expect(groups).toEqual([
      { date: "2026-05-19", items: [items[0], items[1]] },
      { date: "2026-05-18", items: [items[2]] },
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupByDate<Entry>([], (x) => x.eatenOn)).toEqual([]);
  });
});

describe("splitDinners", () => {
  const TODAY = "2026-05-19";

  it("places today in history and tomorrow in upcoming", () => {
    const today = e("today", "2026-05-19");
    const tomorrow = e("tomorrow", "2026-05-20");
    const yesterday = e("yesterday", "2026-05-18");
    const { upcoming, history } = splitDinners(
      [tomorrow, today, yesterday],
      (x) => x.eatenOn,
      TODAY,
    );
    expect(upcoming).toEqual([tomorrow]);
    expect(history).toEqual([today, yesterday]);
  });
});

describe("groupByDay", () => {
  const TODAY = "2026-05-19";

  it("interleaves Log entries and Rejections on the same date into one record", () => {
    const entry = e("entry", "2026-05-18");
    const rejection = r("rej", "2026-05-18");
    const { history } = groupByDay({
      entries: [entry],
      rejections: [rejection],
      todaySql: TODAY,
    });
    expect(history).toEqual([
      { date: "2026-05-18", entries: [entry], rejections: [rejection] },
    ]);
  });

  it("forms a record for a date with only Rejections", () => {
    const rejection = r("rej", "2026-05-17");
    const { history } = groupByDay({
      entries: [],
      rejections: [rejection],
      todaySql: TODAY,
    });
    expect(history).toEqual([
      { date: "2026-05-17", entries: [], rejections: [rejection] },
    ]);
  });

  it("splits at the today boundary — today is History, tomorrow is Upcoming", () => {
    const todayEntry = e("today-entry", "2026-05-19");
    const tomorrowEntry = e("tomorrow-entry", "2026-05-20");
    const yesterdayRej = r("yesterday-rej", "2026-05-18");
    const { upcoming, history } = groupByDay({
      entries: [tomorrowEntry, todayEntry],
      rejections: [yesterdayRej],
      todaySql: TODAY,
    });
    expect(upcoming.map((d) => d.date)).toEqual(["2026-05-20"]);
    expect(history.map((d) => d.date)).toEqual(["2026-05-19", "2026-05-18"]);
  });

  it("orders Upcoming soonest-first and History newest-first", () => {
    const e1 = e("e1", "2026-05-21");
    const e2 = e("e2", "2026-05-23");
    const e3 = e("e3", "2026-05-17");
    const e4 = e("e4", "2026-05-15");
    const { upcoming, history } = groupByDay({
      // Deliberately scrambled — output ordering does not depend on input order.
      entries: [e2, e1, e4, e3],
      rejections: [],
      todaySql: TODAY,
    });
    expect(upcoming.map((d) => d.date)).toEqual(["2026-05-21", "2026-05-23"]);
    expect(history.map((d) => d.date)).toEqual(["2026-05-17", "2026-05-15"]);
  });

  it("preserves input order of entries and rejections within a record", () => {
    const first = e("first", "2026-05-18");
    const second = e("second", "2026-05-18");
    const rejFirst = r("r-first", "2026-05-18");
    const rejSecond = r("r-second", "2026-05-18");
    const { history } = groupByDay({
      entries: [first, second],
      rejections: [rejFirst, rejSecond],
      todaySql: TODAY,
    });
    expect(history).toHaveLength(1);
    expect(history[0].entries).toEqual([first, second]);
    expect(history[0].rejections).toEqual([rejFirst, rejSecond]);
  });

  it("yields empty upcoming and history when both inputs are empty", () => {
    expect(
      groupByDay({ entries: [], rejections: [], todaySql: TODAY }),
    ).toEqual({ upcoming: [], history: [] });
  });
});
