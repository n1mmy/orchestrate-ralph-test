import { describe, expect, it } from "vitest";
import { pgErrorMessage, rejectionWriteError } from "./pg-error";

describe("pgErrorMessage", () => {
  it("translates 23503 (foreign_key_violation) into the inline archive hint", () => {
    expect(pgErrorMessage({ code: "23503" })).toBe(
      "In your log — archive instead",
    );
  });

  it("translates 23505 on dinner_log_option_eaten_on_unique into the inline date-collision message", () => {
    expect(
      pgErrorMessage({
        code: "23505",
        constraint_name: "dinner_log_option_eaten_on_unique",
      }),
    ).toBe("Already logged for that date");
    expect(
      pgErrorMessage({
        code: "23505",
        constraint: "dinner_log_option_eaten_on_unique",
      }),
    ).toBe("Already logged for that date");
  });

  it("returns null for a 23505 on an unknown constraint — the caller rethrows", () => {
    expect(
      pgErrorMessage({ code: "23505", constraint_name: "other_unique" }),
    ).toBeNull();
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

describe("rejectionWriteError", () => {
  it("translates 23505 on rejections_option_rejected_on_unique into the collision message", () => {
    expect(
      rejectionWriteError({
        code: "23505",
        constraint_name: "rejections_option_rejected_on_unique",
      }),
    ).toBe("Already rejected for that date");
    expect(
      rejectionWriteError({
        code: "23505",
        constraint: "rejections_option_rejected_on_unique",
      }),
    ).toBe("Already rejected for that date");
  });

  it("translates 22P02 (malformed uuid) into the 'no longer available' message", () => {
    expect(rejectionWriteError({ code: "22P02" })).toBe(
      "That option is no longer available",
    );
  });

  it("translates 23503 (FK violation, stale Option id) into the 'no longer available' message", () => {
    expect(rejectionWriteError({ code: "23503" })).toBe(
      "That option is no longer available",
    );
  });

  it("returns null for a 23505 on an unknown constraint — the caller rethrows", () => {
    expect(
      rejectionWriteError({ code: "23505", constraint_name: "other_unique" }),
    ).toBeNull();
  });

  it("returns null for an unknown error code", () => {
    expect(rejectionWriteError({ code: "42P01" })).toBeNull();
  });

  it("returns null for a non-pg error shape", () => {
    expect(rejectionWriteError(new Error("kaboom"))).toBeNull();
    expect(rejectionWriteError(null)).toBeNull();
    expect(rejectionWriteError(undefined)).toBeNull();
  });
});
