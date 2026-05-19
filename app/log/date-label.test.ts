import { describe, expect, it } from "vitest";
import { dateLabel } from "./date-label";

describe("dateLabel", () => {
  const TODAY = "2026-05-19"; // Tue, May 19 2026

  it('returns "Today" for today', () => {
    expect(dateLabel("2026-05-19", TODAY)).toBe("Today");
  });

  it('returns "Tomorrow" for today+1', () => {
    expect(dateLabel("2026-05-20", TODAY)).toBe("Tomorrow");
  });

  it('returns "Yesterday" for today-1', () => {
    expect(dateLabel("2026-05-18", TODAY)).toBe("Yesterday");
  });

  it('returns a weekday-and-date label for other dates', () => {
    // Fri, May 16 2026.
    expect(dateLabel("2026-05-16", TODAY)).toBe("Sat, May 16");
  });
});
