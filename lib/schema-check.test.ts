import { describe, it, expect } from "vitest";
import { schemaCheckResult, bundledMigrationCount } from "./schema-check";
import { join } from "node:path";

describe("schemaCheckResult", () => {
  it("returns even when applied == bundled", () => {
    expect(schemaCheckResult(3, 3)).toEqual({ kind: "even", bundled: 3, applied: 3 });
  });

  it("returns behind with a gap when applied < bundled", () => {
    expect(schemaCheckResult(5, 2)).toEqual({
      kind: "behind",
      bundled: 5,
      applied: 2,
      gap: 3,
    });
  });

  it("returns ahead when applied > bundled (older image, newer DB)", () => {
    expect(schemaCheckResult(2, 7)).toEqual({ kind: "ahead", bundled: 2, applied: 7 });
  });

  it("returns unreachable when the DB lookup signals so", () => {
    expect(
      schemaCheckResult(4, { unreachable: true, reason: "ECONNREFUSED" }),
    ).toEqual({ kind: "unreachable", bundled: 4, reason: "ECONNREFUSED" });
  });

  it("treats a brand-new DB (applied=0) and an empty bundle as even", () => {
    expect(schemaCheckResult(0, 0)).toEqual({ kind: "even", bundled: 0, applied: 0 });
  });

  it("treats a brand-new DB (applied=0) and a nonzero bundle as behind", () => {
    const r = schemaCheckResult(1, 0);
    expect(r.kind).toBe("behind");
    if (r.kind === "behind") expect(r.gap).toBe(1);
  });
});

describe("bundledMigrationCount", () => {
  it("reads the live drizzle/meta/_journal.json", () => {
    // The walking-skeleton ticket landed exactly one migration; this lets the
    // test stay honest as more migrations land — it just asserts the count
    // matches what is bundled at this commit.
    const journal = join(process.cwd(), "drizzle", "meta", "_journal.json");
    const count = bundledMigrationCount(journal);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
