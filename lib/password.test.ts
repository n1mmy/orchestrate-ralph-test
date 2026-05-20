import { describe, expect, it } from "vitest";

import { passwordMatches } from "./password";

describe("passwordMatches", () => {
  it("matches identical passwords", () => {
    expect(passwordMatches("correct horse battery staple", "correct horse battery staple")).toBe(
      true,
    );
  });

  it("rejects a wrong password of the same length", () => {
    expect(passwordMatches("abcdefgh", "12345678")).toBe(false);
  });

  it("rejects a wrong password of a different length (short-circuits)", () => {
    expect(passwordMatches("short", "longer-password")).toBe(false);
  });

  it("rejects an empty submission against a real password", () => {
    expect(passwordMatches("", "real-secret")).toBe(false);
  });

  it("matches multi-byte unicode passwords by byte length", () => {
    // Two strings whose JS .length differs from their UTF-8 byte length.
    expect(passwordMatches("héllo-世界", "héllo-世界")).toBe(true);
  });
});
