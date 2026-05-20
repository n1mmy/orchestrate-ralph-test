import { describe, expect, it } from "vitest";
import {
  daysSince,
  lastEaten,
  lastTagUse,
  optionScore,
  rankOption,
  rankTonight,
  type RankLogEntry,
  type RankOption,
} from "./ranking";
import { CAP, OVERDUE_THRESHOLD } from "./ranking.config";

const TODAY = 20_000;

function option(
  id: string,
  name: string,
  tags: string[] = [],
  kind: "home" | "restaurant" = "home",
): RankOption {
  return { id, name, kind, tags, url: null, phone: null };
}

function entry(optionId: string, eatenOn: number): RankLogEntry {
  return { optionId, eatenOn };
}

describe("daysSince", () => {
  it("maps null to CAP (never eaten is maximally overdue)", () => {
    expect(daysSince(null, TODAY)).toBe(CAP);
  });

  it("returns plain integer day difference within the cap", () => {
    expect(daysSince(TODAY - 1, TODAY)).toBe(1);
    expect(daysSince(TODAY - 17, TODAY)).toBe(17);
  });

  it("clamps to CAP at and beyond the ceiling", () => {
    expect(daysSince(TODAY - CAP, TODAY)).toBe(CAP);
    expect(daysSince(TODAY - (CAP + 100), TODAY)).toBe(CAP);
  });

  it("guards against a future day, clamping to 0 rather than going negative", () => {
    expect(daysSince(TODAY + 5, TODAY)).toBe(0);
  });
});

describe("lastEaten", () => {
  const entries: RankLogEntry[] = [
    entry("a", TODAY - 30),
    entry("a", TODAY - 5),
    entry("a", TODAY - 12),
    entry("b", TODAY - 1),
  ];

  it("picks the most-recent non-future entry for the Option", () => {
    expect(lastEaten(entries, "a", TODAY)).toBe(TODAY - 5);
    expect(lastEaten(entries, "b", TODAY)).toBe(TODAY - 1);
  });

  it("excludes future entries (Planned dinners)", () => {
    const withPlanned = [...entries, entry("a", TODAY + 3)];
    expect(lastEaten(withPlanned, "a", TODAY)).toBe(TODAY - 5);
  });

  it("returns null when the Option has no qualifying history", () => {
    expect(lastEaten(entries, "never-eaten", TODAY)).toBeNull();
    // Only future entries → null.
    expect(lastEaten([entry("c", TODAY + 1)], "c", TODAY)).toBeNull();
  });

  it("treats today itself as non-future (eaten today qualifies)", () => {
    expect(lastEaten([entry("a", TODAY)], "a", TODAY)).toBe(TODAY);
  });
});

describe("lastTagUse", () => {
  const options: RankOption[] = [
    option("a", "Pasta carbonara", ["pasta"]),
    option("b", "Pasta primavera", ["pasta"]),
    option("c", "Salmon", ["fish"]),
  ];

  it("picks the most-recent non-future entry across all options carrying the tag", () => {
    const entries = [
      entry("a", TODAY - 10),
      entry("b", TODAY - 2),
      entry("c", TODAY - 1),
    ];
    expect(lastTagUse(entries, options, "pasta", TODAY)).toBe(TODAY - 2);
    expect(lastTagUse(entries, options, "fish", TODAY)).toBe(TODAY - 1);
  });

  it("excludes future Log entries", () => {
    const entries = [entry("a", TODAY - 10), entry("b", TODAY + 5)];
    expect(lastTagUse(entries, options, "pasta", TODAY)).toBe(TODAY - 10);
  });

  it("returns null when no Option carries the tag", () => {
    expect(lastTagUse([], options, "vegan", TODAY)).toBeNull();
  });

  it("returns null when no carrier has a qualifying entry", () => {
    expect(lastTagUse([], options, "pasta", TODAY)).toBeNull();
  });
});

describe("optionScore", () => {
  it("for a tagless Option, variety collapses to anti-repeat (Score = 2·antiRepeat at default weights)", () => {
    expect(optionScore(10, [])).toBe(20);
    expect(optionScore(0, [])).toBe(0);
  });

  it("for a tagged Option, variety is the mean of tag recencies", () => {
    // antiRepeat=10, tags=[20, 0] → mean 10 → score 10 + 10 = 20.
    expect(optionScore(10, [20, 0])).toBe(20);
    // antiRepeat=5, tags=[30] → score 5 + 30 = 35.
    expect(optionScore(5, [30])).toBe(35);
  });

  it("cold start: every recency at CAP → identical Score for tagged and tagless", () => {
    expect(optionScore(CAP, [])).toBe(2 * CAP);
    expect(optionScore(CAP, [CAP, CAP, CAP])).toBe(2 * CAP);
  });
});

describe("overdue threshold", () => {
  it("a Tag's overdue flag flips on at OVERDUE_THRESHOLD", () => {
    const options: RankOption[] = [option("a", "Aji", ["fish"])];
    const entries = [entry("a", TODAY - (OVERDUE_THRESHOLD - 1))];
    const [row] = rankTonight(options, entries, TODAY);
    expect(row.tags[0]?.days).toBe(OVERDUE_THRESHOLD - 1);
    expect(row.tags[0]?.overdue).toBe(false);
  });

  it("at exactly OVERDUE_THRESHOLD the Tag is overdue", () => {
    const options: RankOption[] = [option("a", "Aji", ["fish"])];
    const entries = [entry("a", TODAY - OVERDUE_THRESHOLD)];
    const [row] = rankTonight(options, entries, TODAY);
    expect(row.tags[0]?.days).toBe(OVERDUE_THRESHOLD);
    expect(row.tags[0]?.overdue).toBe(true);
  });
});

describe("rankTonight", () => {
  it("sorts by Score descending — more-overdue first", () => {
    const options: RankOption[] = [
      option("a", "Aji", []),
      option("b", "Burger", []),
    ];
    // Aji eaten yesterday; Burger eaten 30 days ago — Burger ranks first.
    const entries = [entry("a", TODAY - 1), entry("b", TODAY - 30)];
    const rows = rankTonight(options, entries, TODAY);
    expect(rows.map((r) => r.option.id)).toEqual(["b", "a"]);
  });

  it("breaks ties alphabetically by Option name (localeCompare)", () => {
    // Both never eaten — every Score ties at 2·CAP.
    const options: RankOption[] = [
      option("z", "Zucchini"),
      option("a", "Avocado"),
      option("m", "Macaroni"),
    ];
    const rows = rankTonight(options, [], TODAY);
    expect(rows.map((r) => r.option.name)).toEqual([
      "Avocado",
      "Macaroni",
      "Zucchini",
    ]);
  });

  it("cold start (no non-future Log) falls back to alphabetical order", () => {
    const options: RankOption[] = [
      option("c", "Cabbage"),
      option("a", "Apple"),
      option("b", "Banana"),
    ];
    // Only a future Planned dinner — every recency is CAP.
    const entries = [entry("a", TODAY + 1)];
    const rows = rankTonight(options, entries, TODAY);
    expect(rows.map((r) => r.option.name)).toEqual([
      "Apple",
      "Banana",
      "Cabbage",
    ]);
  });

  it("populates recencyDays, neverEaten, and TagRecency on every row", () => {
    const options: RankOption[] = [
      option("a", "Aji", ["fish"]),
      option("b", "Burger", ["beef"]),
    ];
    const entries = [entry("a", TODAY - 7)];
    const rows = rankTonight(options, entries, TODAY);
    const aji = rows.find((r) => r.option.id === "a")!;
    const burger = rows.find((r) => r.option.id === "b")!;
    expect(aji.recencyDays).toBe(7);
    expect(aji.neverEaten).toBe(false);
    expect(aji.tags).toEqual([{ tag: "fish", days: 7, overdue: false }]);
    expect(burger.recencyDays).toBe(CAP);
    expect(burger.neverEaten).toBe(true);
    expect(burger.tags).toEqual([{ tag: "beef", days: CAP, overdue: true }]);
  });

  it("excludes Planned dinners (future Log entries) from recency", () => {
    const options: RankOption[] = [option("a", "Aji")];
    const entries = [entry("a", TODAY + 5)];
    const [row] = rankTonight(options, entries, TODAY);
    expect(row.recencyDays).toBe(CAP);
    expect(row.neverEaten).toBe(true);
  });
});

describe("rankOption", () => {
  it("for an Active Option, returns the same numbers as that Option's `rankTonight` row over the same inputs", () => {
    const target = option("a", "Aji", ["fish", "japanese"]);
    const others: RankOption[] = [
      target,
      option("b", "Burger", ["beef"]),
      option("c", "Salmon", ["fish"]),
    ];
    const entries: RankLogEntry[] = [
      entry("a", TODAY - 7),
      entry("b", TODAY - 30),
      entry("c", TODAY - 3),
    ];
    const tonight = rankTonight(others, entries, TODAY);
    const expected = tonight.find((r) => r.option.id === "a");
    if (!expected) throw new Error("Target row missing from rankTonight");

    const result = rankOption({
      target,
      activeOptions: others,
      activeLog: entries,
      targetLog: entries,
      today: TODAY,
    });

    expect(result.score).toBe(expected.score);
    expect(result.recencyDays).toBe(expected.recencyDays);
    expect(result.neverEaten).toBe(expected.neverEaten);
    expect(result.tags).toEqual(expected.tags);
  });

  it("flags an Option with no non-future Log entry as never-eaten and caps recency at CAP", () => {
    const target = option("a", "Aji", []);
    const result = rankOption({
      target,
      activeOptions: [target],
      activeLog: [],
      targetLog: [],
      today: TODAY,
    });
    expect(result.neverEaten).toBe(true);
    expect(result.recencyDays).toBe(CAP);
  });

  it("a future Planned dinner does not satisfy never-eaten — recency still pins at CAP", () => {
    const target = option("a", "Aji", []);
    const targetLog = [entry("a", TODAY + 5)];
    const result = rankOption({
      target,
      activeOptions: [target],
      activeLog: targetLog,
      targetLog,
      today: TODAY,
    });
    expect(result.neverEaten).toBe(true);
    expect(result.recencyDays).toBe(CAP);
  });
});
