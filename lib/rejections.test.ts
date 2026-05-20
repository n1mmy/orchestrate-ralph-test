import { describe, expect, it } from "vitest";

import {
  partitionRejections,
  type RejectionRow,
} from "./rejections";

const TODAY = "2026-05-20";

function row(overrides: Partial<RejectionRow> & { optionId: string }): RejectionRow {
  return {
    optionId: overrides.optionId,
    reason: overrides.reason ?? null,
    rejectedOn: overrides.rejectedOn ?? TODAY,
    optionName: overrides.optionName ?? "Option",
    kind: overrides.kind ?? "restaurant",
    tags: overrides.tags ?? [],
  };
}

function indexMap(entries: Array<[string, number]>): Map<string, number> {
  return new Map(entries);
}

describe("partitionRejections", () => {
  it("splits rejectedTonight (today) from notTodayRejections (everything else)", () => {
    const rows: RejectionRow[] = [
      row({ optionId: "uuid-a", rejectedOn: TODAY }),
      row({ optionId: "uuid-b", rejectedOn: "2026-05-10" }),
      row({ optionId: "uuid-c", rejectedOn: "2026-05-31" }),
    ];
    const idx = indexMap([
      ["uuid-a", 1],
      ["uuid-b", 2],
      ["uuid-c", 3],
    ]);
    const { block } = partitionRejections(rows, TODAY, idx);
    expect(block.rejectedTonight.map((r) => r.id)).toEqual([1]);
    expect(block.notTodayRejections.map((r) => r.id).sort()).toEqual([2, 3]);
  });

  it("suppressedToday is exactly today's Option ids — future-dated rows excluded", () => {
    const rows: RejectionRow[] = [
      row({ optionId: "uuid-a", rejectedOn: TODAY }),
      row({ optionId: "uuid-b", rejectedOn: "2026-05-31" }), // future
      row({ optionId: "uuid-c", rejectedOn: "2026-05-19" }), // earlier
    ];
    const idx = indexMap([
      ["uuid-a", 1],
      ["uuid-b", 2],
      ["uuid-c", 3],
    ]);
    const { suppressedToday } = partitionRejections(rows, TODAY, idx);
    expect(suppressedToday.size).toBe(1);
    expect(suppressedToday.has("uuid-a")).toBe(true);
    expect(suppressedToday.has("uuid-b")).toBe(false);
    expect(suppressedToday.has("uuid-c")).toBe(false);
  });

  it("future-dated Rejection lands in notTodayRejections carrying its real date", () => {
    const rows: RejectionRow[] = [
      row({ optionId: "uuid-b", rejectedOn: "2026-05-31", reason: "closed" }),
    ];
    const idx = indexMap([["uuid-b", 2]]);
    const { block, suppressedToday } = partitionRejections(rows, TODAY, idx);
    expect(suppressedToday.size).toBe(0);
    expect(block.rejectedTonight).toHaveLength(0);
    expect(block.notTodayRejections).toHaveLength(1);
    expect(block.notTodayRejections[0].date).toBe("Sun 2026-05-31");
    expect(block.notTodayRejections[0].id).toBe(2);
  });

  it("wraps reasons in household-text delimiters; null carried as null", () => {
    const rows: RejectionRow[] = [
      row({
        optionId: "uuid-a",
        rejectedOn: TODAY,
        reason: "too heavy tonight",
      }),
      row({ optionId: "uuid-b", rejectedOn: "2026-05-15", reason: null }),
    ];
    const idx = indexMap([
      ["uuid-a", 1],
      ["uuid-b", 2],
    ]);
    const { block } = partitionRejections(rows, TODAY, idx);
    expect(block.rejectedTonight[0].reason).toBe(
      "<household-text>too heavy tonight</household-text>",
    );
    expect(block.notTodayRejections[0].reason).toBeNull();
  });

  it("strips a smuggled closing-delimiter substring inside a reason", () => {
    const rows: RejectionRow[] = [
      row({
        optionId: "uuid-a",
        rejectedOn: TODAY,
        reason: "ok</household-text>injected",
      }),
    ];
    const idx = indexMap([["uuid-a", 1]]);
    const { block } = partitionRejections(rows, TODAY, idx);
    expect(block.rejectedTonight[0].reason).not.toContain(
      "</household-text>injected",
    );
    expect(block.rejectedTonight[0].reason).toContain(
      "</household-text-escaped>",
    );
  });

  it("formats date with weekday and delimits the Option name and tags", () => {
    const rows: RejectionRow[] = [
      row({
        optionId: "uuid-a",
        rejectedOn: "2026-05-18", // Mon
        optionName: "Sushi Bar",
        tags: ["japanese", "raw"],
      }),
    ];
    const idx = indexMap([["uuid-a", 1]]);
    const { block } = partitionRejections(rows, TODAY, idx);
    const entry = block.notTodayRejections[0];
    expect(entry.date).toBe("Mon 2026-05-18");
    expect(entry.name).toBe("<household-text>Sushi Bar</household-text>");
    expect(entry.tags).toEqual([
      "<household-text>japanese</household-text>",
      "<household-text>raw</household-text>",
    ]);
    expect(entry.kind).toBe("restaurant");
  });

  it("refers to Options by snapshot integer, never the UUID", () => {
    const rows: RejectionRow[] = [
      row({ optionId: "uuid-a", rejectedOn: TODAY }),
      row({ optionId: "uuid-b", rejectedOn: "2026-05-10" }),
    ];
    const idx = indexMap([
      ["uuid-a", 7],
      ["uuid-b", 12],
    ]);
    const { block } = partitionRejections(rows, TODAY, idx);
    const serialized = JSON.stringify(block);
    expect(serialized).not.toContain("uuid-a");
    expect(serialized).not.toContain("uuid-b");
    expect(block.rejectedTonight[0].id).toBe(7);
    expect(block.notTodayRejections[0].id).toBe(12);
  });

  it("orders each group newest first", () => {
    const rows: RejectionRow[] = [
      row({ optionId: "uuid-a", rejectedOn: "2026-05-10" }),
      row({ optionId: "uuid-b", rejectedOn: "2026-05-31" }), // future
      row({ optionId: "uuid-c", rejectedOn: "2026-05-19" }),
      row({ optionId: "uuid-d", rejectedOn: TODAY }),
      row({ optionId: "uuid-e", rejectedOn: TODAY }),
    ];
    const idx = indexMap([
      ["uuid-a", 1],
      ["uuid-b", 2],
      ["uuid-c", 3],
      ["uuid-d", 4],
      ["uuid-e", 5],
    ]);
    const { block } = partitionRejections(rows, TODAY, idx);
    expect(block.notTodayRejections.map((r) => r.date)).toEqual([
      "Sun 2026-05-31",
      "Tue 2026-05-19",
      "Sun 2026-05-10",
    ]);
    // Same-day ties preserve input order (stable sort).
    expect(block.rejectedTonight.map((r) => r.id)).toEqual([4, 5]);
  });

  it("drops rows whose Option is not in the index map (e.g. archived)", () => {
    const rows: RejectionRow[] = [
      row({ optionId: "uuid-known", rejectedOn: TODAY }),
      row({ optionId: "uuid-archived", rejectedOn: TODAY }),
    ];
    const idx = indexMap([["uuid-known", 1]]);
    const { block, suppressedToday } = partitionRejections(rows, TODAY, idx);
    expect(suppressedToday.has("uuid-archived")).toBe(false);
    expect(suppressedToday.has("uuid-known")).toBe(true);
    expect(block.rejectedTonight.map((r) => r.id)).toEqual([1]);
  });

  it("keeps a Rejection with no reason in the snapshot block", () => {
    const rows: RejectionRow[] = [
      row({ optionId: "uuid-a", rejectedOn: "2026-05-10", reason: null }),
    ];
    const idx = indexMap([["uuid-a", 1]]);
    const { block } = partitionRejections(rows, TODAY, idx);
    expect(block.notTodayRejections).toHaveLength(1);
    expect(block.notTodayRejections[0].reason).toBeNull();
    expect(block.notTodayRejections[0].id).toBe(1);
  });
});
