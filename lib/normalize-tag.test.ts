import { describe, expect, it } from "vitest";

import { normalizeTag } from "./normalize-tag";

describe("normalizeTag", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTag("  pasta  ")).toBe("pasta");
  });

  it("lowercases mixed case", () => {
    expect(normalizeTag("Pasta")).toBe("pasta");
    expect(normalizeTag("HELEN: BURGER")).toBe("helen: burger");
  });

  it("leaves an already-normal Tag unchanged", () => {
    expect(normalizeTag("pasta")).toBe("pasta");
  });

  it("combines trim and lowercase", () => {
    expect(normalizeTag("  Pasta\n")).toBe("pasta");
  });
});
