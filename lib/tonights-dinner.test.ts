/**
 * Unit tests for `splitTonight` — the pure split of the Tonight ranking into
 * Tonight's dinner (the decided panel) and the picker. Table-style: every
 * case constructs a tiny ranked set and a tiny set of today entries and
 * asserts the two slices.
 */

import { describe, expect, it } from "vitest";
import {
  type TodayLogEntry,
  splitTonight,
} from "./tonights-dinner";
import type { RankOption, TonightRow } from "./ranking";

function opt(over: Partial<RankOption> = {}): RankOption {
  return {
    id: over.id ?? "id-" + (over.name ?? "x"),
    name: "X",
    kind: "home",
    tags: [],
    url: null,
    phone: null,
    ...over,
  };
}

function row(option: RankOption, recencyDays = 0): TonightRow {
  return {
    option,
    score: 0,
    tags: option.tags.map((tag) => ({ tag, days: 0, overdue: false })),
    recencyDays,
    neverEaten: false,
  };
}

function entry(over: Partial<TodayLogEntry> = {}): TodayLogEntry {
  return {
    id: over.id ?? "entry-" + (over.optionId ?? "x"),
    optionId: over.optionId ?? "id-x",
    createdAt: over.createdAt ?? new Date("2026-05-19T18:00:00Z"),
  };
}

describe("splitTonight", () => {
  const carbonara = opt({ id: "1", name: "Carbonara" });
  const salmon = opt({ id: "2", name: "Salmon" });
  const ajiIchi = opt({ id: "3", name: "Aji Ichi", kind: "restaurant" });

  const ranked = [row(carbonara), row(salmon), row(ajiIchi)];

  it("with no picks: tonightsDinner is empty and picker is the full ranking", () => {
    const result = splitTonight(ranked, [], ranked);
    expect(result.tonightsDinner).toEqual([]);
    expect(result.picker.map((r) => r.option.id)).toEqual(["1", "2", "3"]);
  });

  it("with one pick: the Picked Option is on Tonight's dinner and absent from the picker", () => {
    const todayEntries: TodayLogEntry[] = [
      entry({ id: "e1", optionId: "1", createdAt: new Date("2026-05-19T18:00:00Z") }),
    ];
    const result = splitTonight(ranked, todayEntries, ranked);
    expect(result.tonightsDinner.map((d) => d.row.option.id)).toEqual(["1"]);
    expect(result.tonightsDinner[0].entryId).toBe("e1");
    expect(result.picker.map((r) => r.option.id)).toEqual(["2", "3"]);
  });

  it("decided rows are taken from decidedRows, not rankedRows — chips reflect recency before tonight", () => {
    // The live ranking has Carbonara collapsed to 0d by its own fresh Pick;
    // decidedRows still shows the pre-Pick value (5d).
    const livePicked = row(carbonara, 0);
    const livePickedRanked = [livePicked, row(salmon), row(ajiIchi)];
    const decided = [row(carbonara, 5), row(salmon, 12), row(ajiIchi, 30)];
    const todayEntries: TodayLogEntry[] = [
      entry({ id: "e1", optionId: "1" }),
    ];
    const result = splitTonight(livePickedRanked, todayEntries, decided);
    expect(result.tonightsDinner).toHaveLength(1);
    expect(result.tonightsDinner[0].row.recencyDays).toBe(5);
  });

  it("orders Tonight's dinner by createdAt ascending — oldest first", () => {
    const todayEntries: TodayLogEntry[] = [
      entry({ id: "e3", optionId: "3", createdAt: new Date("2026-05-19T20:00:00Z") }),
      entry({ id: "e1", optionId: "1", createdAt: new Date("2026-05-19T17:00:00Z") }),
      entry({ id: "e2", optionId: "2", createdAt: new Date("2026-05-19T18:30:00Z") }),
    ];
    const result = splitTonight(ranked, todayEntries, ranked);
    expect(result.tonightsDinner.map((d) => d.row.option.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(result.picker).toEqual([]);
  });

  it("pick order is stable when another pick is added", () => {
    const first: TodayLogEntry[] = [
      entry({ id: "e1", optionId: "1", createdAt: new Date("2026-05-19T17:00:00Z") }),
    ];
    const second: TodayLogEntry[] = [
      ...first,
      entry({ id: "e2", optionId: "2", createdAt: new Date("2026-05-19T18:30:00Z") }),
    ];
    const a = splitTonight(ranked, first, ranked);
    const b = splitTonight(ranked, second, ranked);
    // The first Pick's slot does not move when the second lands.
    expect(a.tonightsDinner[0].entryId).toBe("e1");
    expect(b.tonightsDinner[0].entryId).toBe("e1");
    expect(b.tonightsDinner[1].entryId).toBe("e2");
  });

  it("when every Option is already picked, the picker is empty", () => {
    const todayEntries: TodayLogEntry[] = [
      entry({ id: "e1", optionId: "1", createdAt: new Date("2026-05-19T17:00:00Z") }),
      entry({ id: "e2", optionId: "2", createdAt: new Date("2026-05-19T17:01:00Z") }),
      entry({ id: "e3", optionId: "3", createdAt: new Date("2026-05-19T17:02:00Z") }),
    ];
    const result = splitTonight(ranked, todayEntries, ranked);
    expect(result.tonightsDinner).toHaveLength(3);
    expect(result.picker).toEqual([]);
  });

  it("skips a today entry whose Option is absent from decidedRows without error", () => {
    // An Option Archived after being Picked is no longer in the active
    // Catalog ranking, so decidedRows omits it — the today entry has nowhere
    // to render on Tonight, but the Log still carries it. Skip silently.
    const todayEntries: TodayLogEntry[] = [
      entry({ id: "e1", optionId: "ghost", createdAt: new Date("2026-05-19T17:00:00Z") }),
      entry({ id: "e2", optionId: "1", createdAt: new Date("2026-05-19T17:01:00Z") }),
    ];
    const result = splitTonight(ranked, todayEntries, ranked);
    expect(result.tonightsDinner.map((d) => d.entryId)).toEqual(["e2"]);
    // The Archived Option's id is still removed from the picker — the pick
    // happened, even if it has nowhere to render in the decided block.
    expect(result.picker.map((r) => r.option.id)).toEqual(["2", "3"]);
  });

  it("with an empty ranked set, both sides are empty", () => {
    const result = splitTonight([], [], []);
    expect(result.tonightsDinner).toEqual([]);
    expect(result.picker).toEqual([]);
  });

  it("breaks ties on identical createdAt by entry id for determinism", () => {
    const when = new Date("2026-05-19T17:00:00Z");
    const todayEntries: TodayLogEntry[] = [
      entry({ id: "e-zeta", optionId: "1", createdAt: when }),
      entry({ id: "e-alpha", optionId: "2", createdAt: when }),
    ];
    const result = splitTonight(ranked, todayEntries, ranked);
    expect(result.tonightsDinner.map((d) => d.entryId)).toEqual([
      "e-alpha",
      "e-zeta",
    ]);
  });
});
