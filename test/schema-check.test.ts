import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  countBundledMigrations,
  decideSchemaOutcome,
} from "../lib/schema-check";

describe("countBundledMigrations", () => {
  it("counts the entries in the real drizzle journal", async () => {
    const count = await countBundledMigrations(
      path.join(__dirname, "..", "drizzle", "meta", "_journal.json"),
    );
    // The skeleton ships one migration; later tickets may add more.
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe("decideSchemaOutcome", () => {
  it("returns `ok` when applied matches bundled", () => {
    const outcome = decideSchemaOutcome({ bundled: 3, applied: 3 });
    expect(outcome.kind).toBe("ok");
  });

  it("returns `behind` with a specific drizzle-kit message when applied is short", () => {
    const outcome = decideSchemaOutcome({ bundled: 5, applied: 3 });
    expect(outcome.kind).toBe("behind");
    if (outcome.kind === "behind") {
      expect(outcome.message).toBe(
        "DB schema 2 migrations behind — run drizzle-kit migrate",
      );
    }
  });

  it("tolerates a DB ahead of the bundle (rolling deploy)", () => {
    const outcome = decideSchemaOutcome({ bundled: 3, applied: 5 });
    expect(outcome.kind).toBe("ahead");
  });

  it("returns `unreachable` when applied is null", () => {
    const outcome = decideSchemaOutcome({
      bundled: 3,
      applied: null,
      unreachableError: "ECONNREFUSED",
    });
    expect(outcome.kind).toBe("unreachable");
    if (outcome.kind === "unreachable") {
      expect(outcome.error).toBe("ECONNREFUSED");
    }
  });

  it("treats a brand-new DB (zero applied) as behind", () => {
    const outcome = decideSchemaOutcome({ bundled: 1, applied: 0 });
    expect(outcome.kind).toBe("behind");
    if (outcome.kind === "behind") {
      expect(outcome.message).toMatch(/1 migrations behind/);
    }
  });
});
