import { describe, expect, it } from "vitest";
import { normalizeTag } from "./normalize-tag";

describe("normalizeTag", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeTag("  pasta  ")).toBe("pasta");
    expect(normalizeTag("\tfish\n")).toBe("fish");
  });

  it("lowercases the Tag", () => {
    expect(normalizeTag("Pasta")).toBe("pasta");
    expect(normalizeTag("FISH")).toBe("fish");
    expect(normalizeTag("Helen: Burger")).toBe("helen: burger");
  });

  it("leaves an already-normal Tag unchanged", () => {
    expect(normalizeTag("pasta")).toBe("pasta");
    expect(normalizeTag("helen: burger")).toBe("helen: burger");
  });

  it("collapses a blank string to empty (callers filter this)", () => {
    expect(normalizeTag("   ")).toBe("");
    expect(normalizeTag("")).toBe("");
  });
});
