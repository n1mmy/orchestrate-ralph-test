import { describe, expect, it } from "vitest";

import { localMidnightUtc } from "./local-midnight";

describe("localMidnightUtc", () => {
  it("resolves a non-DST date in America/Los_Angeles (PST, UTC-8)", () => {
    const out = localMidnightUtc("2026-01-15", "America/Los_Angeles");
    expect(out.toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("resolves a post-DST date in America/Los_Angeles (PDT, UTC-7)", () => {
    const out = localMidnightUtc("2026-04-15", "America/Los_Angeles");
    expect(out.toISOString()).toBe("2026-04-15T07:00:00.000Z");
  });

  it("survives the spring-forward DST transition", () => {
    // DST starts 2026-03-08 in America/Los_Angeles. The transition is at
    // local 02:00 → 03:00. Local midnight that morning is still PST (UTC-8).
    const out = localMidnightUtc("2026-03-08", "America/Los_Angeles");
    expect(out.toISOString()).toBe("2026-03-08T08:00:00.000Z");
  });

  it("handles UTC zone identically", () => {
    const out = localMidnightUtc("2026-06-01", "UTC");
    expect(out.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("throws on bad input", () => {
    expect(() => localMidnightUtc("nope", "UTC")).toThrow();
  });
});
