import { describe, expect, it } from "vitest";
import {
  epochDayFromSqlDate,
  isValidSqlDate,
  todayEpochDay,
  todaySqlDate,
} from "./local-day";

describe("epochDayFromSqlDate", () => {
  it("anchors the Unix epoch at day 0", () => {
    expect(epochDayFromSqlDate("1970-01-01")).toBe(0);
  });

  it("counts forward in single-day steps", () => {
    expect(epochDayFromSqlDate("1970-01-02")).toBe(1);
    expect(epochDayFromSqlDate("1970-02-01")).toBe(31);
  });

  it("counts backward into negative days before the epoch", () => {
    expect(epochDayFromSqlDate("1969-12-31")).toBe(-1);
  });

  it("differences across a US DST spring-forward boundary are exactly 1 per day", () => {
    // 2026-03-08 is the US 'spring forward' Sunday — the day-of has 23 hours
    // in America/New_York. The integer epoch-day delta must still be 1.
    const sat = epochDayFromSqlDate("2026-03-07");
    const sun = epochDayFromSqlDate("2026-03-08");
    const mon = epochDayFromSqlDate("2026-03-09");
    expect(sun - sat).toBe(1);
    expect(mon - sun).toBe(1);
  });

  it("differences across a US DST fall-back boundary are exactly 1 per day", () => {
    // 2026-11-01 is the US 'fall back' Sunday — 25 hours. Same integer delta.
    const sat = epochDayFromSqlDate("2026-10-31");
    const sun = epochDayFromSqlDate("2026-11-01");
    const mon = epochDayFromSqlDate("2026-11-02");
    expect(sun - sat).toBe(1);
    expect(mon - sun).toBe(1);
  });
});

describe("isValidSqlDate", () => {
  it("accepts a well-formed real calendar date", () => {
    expect(isValidSqlDate("2026-05-19")).toBe(true);
    expect(isValidSqlDate("2024-02-29")).toBe(true); // leap day
  });

  it("rejects a non-string", () => {
    expect(isValidSqlDate(20260519)).toBe(false);
    expect(isValidSqlDate(null)).toBe(false);
    expect(isValidSqlDate(undefined)).toBe(false);
  });

  it("rejects malformed shapes", () => {
    expect(isValidSqlDate("2026-5-19")).toBe(false);
    expect(isValidSqlDate("19-05-2026")).toBe(false);
    expect(isValidSqlDate("not a date")).toBe(false);
    expect(isValidSqlDate("")).toBe(false);
  });

  it("rejects an impossible calendar day even when shape is right", () => {
    expect(isValidSqlDate("2026-02-30")).toBe(false);
    expect(isValidSqlDate("2026-13-01")).toBe(false);
    expect(isValidSqlDate("2025-02-29")).toBe(false); // not a leap year
  });
});

describe("todaySqlDate", () => {
  it("uses the supplied time zone, not the system zone", () => {
    // 2026-01-15 03:00 UTC is 2026-01-14 22:00 in New York (EST = -5h).
    const now = new Date("2026-01-15T03:00:00Z");
    expect(todaySqlDate(now, "America/New_York")).toBe("2026-01-14");
    expect(todaySqlDate(now, "UTC")).toBe("2026-01-15");
  });

  it("rolls over at local midnight, not UTC midnight", () => {
    // 2026-01-15 04:30 UTC is 2026-01-14 23:30 in New York — still yesterday.
    // 2026-01-15 05:30 UTC is 2026-01-15 00:30 in New York — already today.
    expect(
      todaySqlDate(new Date("2026-01-15T04:30:00Z"), "America/New_York"),
    ).toBe("2026-01-14");
    expect(
      todaySqlDate(new Date("2026-01-15T05:30:00Z"), "America/New_York"),
    ).toBe("2026-01-15");
  });
});

describe("todayEpochDay", () => {
  it("composes the SQL date and the epoch-day conversion", () => {
    const now = new Date("2026-05-19T15:00:00Z");
    expect(todayEpochDay(now, "UTC")).toBe(
      epochDayFromSqlDate("2026-05-19"),
    );
  });
});
