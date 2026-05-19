import { describe, it, expect } from "vitest";
import { passwordMatches } from "./password";

describe("passwordMatches", () => {
  it("returns true for an exact match", () => {
    expect(passwordMatches("hunter2", "hunter2")).toBe(true);
  });

  it("returns false for a different same-length string", () => {
    expect(passwordMatches("hunter2", "hunter3")).toBe(false);
  });

  it("returns false (without throwing) when the lengths differ", () => {
    // `crypto.timingSafeEqual` throws on unequal-length buffers; this is the
    // short-circuit branch the implementation must guard with explicitly.
    expect(passwordMatches("short", "much-longer-password")).toBe(false);
    expect(passwordMatches("", "non-empty")).toBe(false);
    expect(passwordMatches("non-empty", "")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    // The length-mismatch guard must not short-circuit when both lengths are
    // zero — `timingSafeEqual` accepts equal-length zero-byte buffers.
    expect(passwordMatches("", "")).toBe(true);
  });

  it("compares non-ASCII passwords by their UTF-8 byte sequence", () => {
    expect(passwordMatches("café", "café")).toBe(true);
    expect(passwordMatches("café", "cafe")).toBe(false);
  });
});
