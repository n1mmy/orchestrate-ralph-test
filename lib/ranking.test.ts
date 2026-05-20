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

function option(
  id: string,
  name: string,
  tags: string[] = [],
  kind: "home" | "restaurant" = "home",
): RankOption {
  return { id, name, kind, tags, url: null, phone: null };
}

describe("ranking", () => {
  describe("daysSince", () => {
    it("returns CAP for a never-eaten Option (`null`)", () => {
      expect(daysSince(null, 100)).toBe(CAP);
    });
    it("returns the integer difference for a past day", () => {
      expect(daysSince(95, 100)).toBe(5);
    });
    it("clamps at CAP for very-long-ago days", () => {
      expect(daysSince(0, 1000)).toBe(CAP);
    });
    it("clamps at 0 for a (defensively) future day", () => {
      expect(daysSince(110, 100)).toBe(0);
    });
  });

  describe("lastEaten", () => {
    const today = 100;
    const entries: RankLogEntry[] = [
      { optionId: "a", eatenOn: 80 },
      { optionId: "a", eatenOn: 95 },
      { optionId: "a", eatenOn: 105 }, // future — Planned dinner, ignored
      { optionId: "b", eatenOn: 90 },
    ];
    it("picks the most-recent non-future day", () => {
      expect(lastEaten(entries, "a", today)).toBe(95);
      expect(lastEaten(entries, "b", today)).toBe(90);
    });
    it("returns null when there is no non-future entry", () => {
      expect(lastEaten(entries, "ghost", today)).toBeNull();
      const onlyFuture: RankLogEntry[] = [{ optionId: "c", eatenOn: 105 }];
      expect(lastEaten(onlyFuture, "c", today)).toBeNull();
    });
  });

  describe("lastTagUse", () => {
    const today = 100;
    const ramen = option("a", "Ramen", ["soup", "japanese"]);
    const pho = option("b", "Pho", ["soup"]);
    const burger = option("c", "Burger", ["meat"]);
    const options: RankOption[] = [ramen, pho, burger];

    it("returns the most-recent eat of any Option carrying the Tag", () => {
      const entries: RankLogEntry[] = [
        { optionId: "a", eatenOn: 70 },
        { optionId: "b", eatenOn: 90 },
      ];
      expect(lastTagUse(entries, options, "soup", today)).toBe(90);
    });
    it("is case-insensitive on the Tag name", () => {
      const entries: RankLogEntry[] = [{ optionId: "a", eatenOn: 70 }];
      expect(lastTagUse(entries, options, "SOUP", today)).toBe(70);
    });
    it("ignores future entries", () => {
      const entries: RankLogEntry[] = [
        { optionId: "a", eatenOn: 70 },
        { optionId: "b", eatenOn: 110 },
      ];
      expect(lastTagUse(entries, options, "soup", today)).toBe(70);
    });
    it("returns null when no carrier was ever eaten", () => {
      expect(lastTagUse([], options, "soup", today)).toBeNull();
    });
  });

  describe("optionScore", () => {
    it("equals 2*antiRepeat for a tagless Option (variety = antiRepeat)", () => {
      expect(optionScore(10, [])).toBe(20);
    });
    it("blends antiRepeat with mean(tagDays) for a tagged Option", () => {
      // anti = 10, variety = (8 + 12) / 2 = 10, score = 1*10 + 1*10 = 20
      expect(optionScore(10, [8, 12])).toBe(20);
    });
  });

  describe("rankTonight", () => {
    const today = 100;
    it("sorts descending by Score, alphabetically on a tie", () => {
      // Two Options, no Log entries → both at CAP, alphabetical fallback.
      const options: RankOption[] = [
        option("a", "Pho"),
        option("b", "Burger"),
      ];
      const rows = rankTonight(options, [], today);
      expect(rows.map((r) => r.option.name)).toEqual(["Burger", "Pho"]);
    });

    it("cold start (zero entries) falls back to alphabetical", () => {
      const options: RankOption[] = [
        option("a", "Zucchini"),
        option("b", "Apple"),
        option("c", "Mango"),
      ];
      const rows = rankTonight(options, [], today);
      expect(rows.map((r) => r.option.name)).toEqual([
        "Apple",
        "Mango",
        "Zucchini",
      ]);
    });

    it("excludes future Log entries from the ranking", () => {
      const options: RankOption[] = [
        option("a", "Apple"),
        option("b", "Banana"),
      ];
      const entries: RankLogEntry[] = [
        { optionId: "a", eatenOn: today }, // ate today
        { optionId: "b", eatenOn: today + 5 }, // Planned dinner
      ];
      const rows = rankTonight(options, entries, today);
      // Banana's Planned dinner is ignored, so it's "never eaten" → CAP.
      const banana = rows.find((r) => r.option.id === "b")!;
      const apple = rows.find((r) => r.option.id === "a")!;
      expect(banana.recencyDays).toBe(CAP);
      expect(banana.neverEaten).toBe(true);
      expect(apple.recencyDays).toBe(0);
      // Banana out-scores Apple, so Banana is first.
      expect(rows[0].option.id).toBe("b");
    });

    it("marks a Tag as overdue once days >= OVERDUE_THRESHOLD", () => {
      const ramen = option("a", "Ramen", ["soup"]);
      const pho = option("b", "Pho", ["soup"]);
      const entries: RankLogEntry[] = [
        { optionId: "a", eatenOn: today - (OVERDUE_THRESHOLD - 1) },
      ];
      // Recent Soup → not overdue
      let rows = rankTonight([ramen, pho], entries, today);
      const phoRow1 = rows.find((r) => r.option.id === "b")!;
      expect(phoRow1.tags[0].overdue).toBe(false);

      // Slip past the threshold
      const entriesOld: RankLogEntry[] = [
        { optionId: "a", eatenOn: today - OVERDUE_THRESHOLD },
      ];
      rows = rankTonight([ramen, pho], entriesOld, today);
      const phoRow2 = rows.find((r) => r.option.id === "b")!;
      expect(phoRow2.tags[0].overdue).toBe(true);
    });

    it("carries recencyDays / neverEaten / no explanation string", () => {
      const a = option("a", "Apple", ["fruit"]);
      const rows = rankTonight([a], [], today);
      const row = rows[0];
      expect(row.recencyDays).toBe(CAP);
      expect(row.neverEaten).toBe(true);
      // The TonightRow shape carries no explanation prose — verify by key.
      expect(Object.keys(row)).not.toContain("explanation");
      expect(Object.keys(row)).not.toContain("explanationChip");
      expect(Object.keys(row)).not.toContain("explanationText");
    });
  });

  describe("rankOption", () => {
    const today = 100;

    it("matches the target's `rankTonight` row for an active Option", () => {
      const ramen = option("a", "Ramen", ["soup"]);
      const pho = option("b", "Pho", ["soup"]);
      const burger = option("c", "Burger", ["meat"]);
      const options: RankOption[] = [ramen, pho, burger];
      const entries: RankLogEntry[] = [
        { optionId: "a", eatenOn: today - 5 },
        { optionId: "b", eatenOn: today - 12 },
        { optionId: "c", eatenOn: today - 20 },
      ];

      const tonightRows = rankTonight(options, entries, today);
      const ramenRow = tonightRows.find((r) => r.option.id === "a")!;

      const ranking = rankOption({
        target: ramen,
        activeOptions: options,
        activeLog: entries,
        targetLog: entries.filter((e) => e.optionId === "a"),
        today,
      });

      expect(ranking.score).toBe(ramenRow.score);
      expect(ranking.recencyDays).toBe(ramenRow.recencyDays);
      expect(ranking.neverEaten).toBe(ramenRow.neverEaten);
      expect(ranking.tags).toEqual(ramenRow.tags);
    });

    it("flags never-eaten and returns CAP recency", () => {
      const fresh = option("z", "Fresh", ["new-tag"]);
      const ranking = rankOption({
        target: fresh,
        activeOptions: [fresh],
        activeLog: [],
        targetLog: [],
        today,
      });
      expect(ranking.neverEaten).toBe(true);
      expect(ranking.recencyDays).toBe(CAP);
      expect(ranking.tags[0].neverEaten).toBe(true);
      expect(ranking.tags[0].days).toBe(CAP);
      expect(ranking.tags[0].overdue).toBe(true); // CAP >= OVERDUE_THRESHOLD
    });

    it("caps recency at CAP for a very-long-ago eat", () => {
      const old = option("old", "Old", []);
      const ranking = rankOption({
        target: old,
        activeOptions: [old],
        activeLog: [{ optionId: "old", eatenOn: today - 9999 }],
        targetLog: [{ optionId: "old", eatenOn: today - 9999 }],
        today,
      });
      expect(ranking.recencyDays).toBe(CAP);
      expect(ranking.neverEaten).toBe(false);
    });

    it("returns null score when the target is Archived", () => {
      const archived = option("arch", "Archived", []);
      const ranking = rankOption({
        target: archived,
        activeOptions: [],
        activeLog: [],
        targetLog: [{ optionId: "arch", eatenOn: today - 3 }],
        today,
        archived: true,
      });
      expect(ranking.score).toBeNull();
      expect(ranking.recencyDays).toBe(3);
      expect(ranking.neverEaten).toBe(false);
    });

    it("derives Tag overdue from OVERDUE_THRESHOLD", () => {
      const ramen = option("a", "Ramen", ["soup"]);
      const pho = option("b", "Pho", ["soup"]);
      const overdueEntries: RankLogEntry[] = [
        { optionId: "a", eatenOn: today - OVERDUE_THRESHOLD },
      ];
      const ranking = rankOption({
        target: pho,
        activeOptions: [ramen, pho],
        activeLog: overdueEntries,
        targetLog: [],
        today,
      });
      expect(ranking.tags[0].overdue).toBe(true);
    });
  });
});
