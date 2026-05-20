import { describe, expect, it } from "vitest";

import type { TonightRow } from "./ranking";
import {
  chipStateLabel,
  cycleChipState,
  distinctTags,
  filterHint,
  filterTonightRows,
} from "./tonight-filter";

function row(
  id: string,
  name: string,
  kind: "home" | "restaurant",
  tags: string[],
): TonightRow {
  return {
    option: { id, name, kind, tags, url: null, phone: null },
    score: 0,
    tags: tags.map((t) => ({ name: t, days: 0, neverEaten: true, overdue: false })),
    recencyDays: 0,
    neverEaten: true,
  };
}

describe("tonight-filter", () => {
  describe("cycleChipState", () => {
    it("cycles off → include → exclude → off", () => {
      expect(cycleChipState("off")).toBe("include");
      expect(cycleChipState("include")).toBe("exclude");
      expect(cycleChipState("exclude")).toBe("off");
    });
  });

  describe("chipStateLabel", () => {
    it("describes each state for screen readers", () => {
      expect(chipStateLabel("off")).toBe("not filtered");
      expect(chipStateLabel("include")).toBe("included");
      expect(chipStateLabel("exclude")).toBe("excluded");
    });
  });

  describe("filterTonightRows", () => {
    const rows: TonightRow[] = [
      row("a", "Pho", "home", ["soup", "asian"]),
      row("b", "Ramen", "restaurant", ["soup", "japanese"]),
      row("c", "Burger", "restaurant", ["meat"]),
      row("d", "Chili", "home", ["meat", "spicy"]),
    ];

    it("kind filter shrinks the list", () => {
      const homeOnly = filterTonightRows(rows, "home", {});
      expect(homeOnly.map((r) => r.option.id)).toEqual(["a", "d"]);
      const restaurantOnly = filterTonightRows(rows, "restaurant", {});
      expect(restaurantOnly.map((r) => r.option.id)).toEqual(["b", "c"]);
    });

    it("requires every include Tag (AND across includes)", () => {
      // include soup AND japanese → only Ramen survives.
      const result = filterTonightRows(rows, "all", {
        soup: "include",
        japanese: "include",
      });
      expect(result.map((r) => r.option.id)).toEqual(["b"]);
    });

    it("excludes rows carrying any exclude Tag", () => {
      const result = filterTonightRows(rows, "all", { meat: "exclude" });
      expect(result.map((r) => r.option.id)).toEqual(["a", "b"]);
    });

    it("ANDs kind and tag filters together", () => {
      const result = filterTonightRows(rows, "home", { soup: "include" });
      expect(result.map((r) => r.option.id)).toEqual(["a"]);
    });

    it("is case-insensitive on Tag names", () => {
      const result = filterTonightRows(rows, "all", { SOUP: "include" });
      expect(result.map((r) => r.option.id)).toEqual(["a", "b"]);
    });
  });

  describe("distinctTags", () => {
    it("returns the Tag vocabulary in localeCompare order", () => {
      const rows: TonightRow[] = [
        row("a", "Pho", "home", ["soup", "asian"]),
        row("b", "Burger", "restaurant", ["meat"]),
      ];
      expect(distinctTags(rows)).toEqual(["asian", "meat", "soup"]);
    });
  });

  describe("filterHint", () => {
    it("no filter → showing every Option", () => {
      expect(filterHint("all", {})).toBe("Showing every Option");
    });
    it("words out the kind filter", () => {
      expect(filterHint("home", {})).toBe("Showing home meals only");
    });
    it("words out includes and excludes together", () => {
      expect(
        filterHint("all", { soup: "include", meat: "exclude" }),
      ).toContain("including soup");
    });
  });
});
