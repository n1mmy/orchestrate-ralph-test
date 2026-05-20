import { describe, expect, it } from "vitest";

import {
  epochDayFromSqlDate,
  isValidSqlDate,
  todayEpochDay,
  todaySqlDate,
} from "./local-day";

describe("local-day", () => {
  describe("isValidSqlDate", () => {
    it("accepts a well-formed YYYY-MM-DD", () => {
      expect(isValidSqlDate("2026-05-20")).toBe(true);
    });
    it("rejects non-strings, wrong shape, and impossible dates", () => {
      expect(isValidSqlDate(null)).toBe(false);
      expect(isValidSqlDate("2026/05/20")).toBe(false);
      expect(isValidSqlDate("26-05-20")).toBe(false);
      expect(isValidSqlDate("2026-13-01")).toBe(false);
      expect(isValidSqlDate("2026-02-31")).toBe(false);
    });
  });

  describe("epochDayFromSqlDate", () => {
    it("treats 1970-01-01 as day 0", () => {
      expect(epochDayFromSqlDate("1970-01-01")).toBe(0);
    });
    it("counts consecutive days as +1 across DST boundaries", () => {
      // US spring-forward 2026-03-08 in America/Los_Angeles — a real 23h day
      // when measured by wall-clock ms; the integer day-difference must
      // still be 1.
      const a = epochDayFromSqlDate("2026-03-07");
      const b = epochDayFromSqlDate("2026-03-08");
      const c = epochDayFromSqlDate("2026-03-09");
      expect(b - a).toBe(1);
      expect(c - b).toBe(1);
    });
    it("counts across the fall-back DST boundary as +1 too", () => {
      // US fall-back 2026-11-01 — a 25h day by wall-clock ms.
      const a = epochDayFromSqlDate("2026-10-31");
      const b = epochDayFromSqlDate("2026-11-01");
      const c = epochDayFromSqlDate("2026-11-02");
      expect(b - a).toBe(1);
      expect(c - b).toBe(1);
    });
  });

  describe("todaySqlDate", () => {
    it("formats `now` in the given timezone as YYYY-MM-DD", () => {
      // 2026-05-20T03:00:00Z is still 2026-05-19 in Los Angeles (UTC-7).
      const earlyMorningUtc = new Date("2026-05-20T03:00:00Z");
      expect(todaySqlDate(earlyMorningUtc, "UTC")).toBe("2026-05-20");
      expect(todaySqlDate(earlyMorningUtc, "America/Los_Angeles")).toBe(
        "2026-05-19",
      );
    });
  });

  describe("todayEpochDay", () => {
    it("agrees with epochDayFromSqlDate(todaySqlDate)", () => {
      const now = new Date("2026-05-20T12:00:00Z");
      expect(todayEpochDay(now, "UTC")).toBe(
        epochDayFromSqlDate(todaySqlDate(now, "UTC")),
      );
    });
  });
});
