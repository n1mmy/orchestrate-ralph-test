import { describe, expect, it } from "vitest";
import { pgErrorMessage } from "./pg-error";

describe("pgErrorMessage", () => {
  it("translates 23503 (foreign_key_violation) into the inline archive hint", () => {
    expect(pgErrorMessage({ code: "23503" })).toBe(
      "In your log — archive instead",
    );
  });

  it("returns null for an unknown error code — the caller rethrows", () => {
    expect(pgErrorMessage({ code: "42P01" })).toBeNull();
  });

  it("returns null for a non-pg error shape", () => {
    expect(pgErrorMessage(new Error("kaboom"))).toBeNull();
    expect(pgErrorMessage(null)).toBeNull();
    expect(pgErrorMessage(undefined)).toBeNull();
    expect(pgErrorMessage("string")).toBeNull();
  });
});
