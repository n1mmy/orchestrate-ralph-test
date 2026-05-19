import { describe, expect, it } from "vitest";
import { err, ok, trimToNull } from "./action-result";

/**
 * Unit tests for the shared `ActionResult` sugar — `ok`/`err` and the
 * `trimToNull` helper that collapses an empty or whitespace-only form
 * field to `null` before a DB write.
 */
describe("ok", () => {
  it("returns a bare success when called with no value", () => {
    expect(ok()).toEqual({ ok: true });
  });

  it("returns a success carrying a value when called with one", () => {
    expect(ok({ id: "a" })).toEqual({ ok: true, value: { id: "a" } });
  });
});

describe("err", () => {
  it("wraps a message in a failure result", () => {
    expect(err("boom")).toEqual({ ok: false, error: "boom" });
  });
});

describe("trimToNull", () => {
  it("returns null for undefined", () => {
    expect(trimToNull(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(trimToNull(null)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(trimToNull("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(trimToNull("   ")).toBeNull();
    expect(trimToNull("\t\n  ")).toBeNull();
  });

  it("returns the trimmed value for a non-blank string", () => {
    expect(trimToNull("  too salty  ")).toBe("too salty");
  });

  it("returns the value unchanged when it has no surrounding whitespace", () => {
    expect(trimToNull("too salty")).toBe("too salty");
  });
});
