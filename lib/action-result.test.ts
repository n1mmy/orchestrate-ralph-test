import { describe, expect, it } from "vitest";

import { trimToNull } from "./action-result";

describe("trimToNull", () => {
  it("returns null for null and undefined", () => {
    expect(trimToNull(null)).toBeNull();
    expect(trimToNull(undefined)).toBeNull();
  });

  it("returns null for empty and whitespace-only strings", () => {
    expect(trimToNull("")).toBeNull();
    expect(trimToNull("   ")).toBeNull();
    expect(trimToNull("\t\n")).toBeNull();
  });

  it("trims and returns the remainder when non-empty", () => {
    expect(trimToNull("  hello  ")).toBe("hello");
    expect(trimToNull("closed Sundays")).toBe("closed Sundays");
  });
});
