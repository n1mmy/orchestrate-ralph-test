/**
 * Unit tests for the Tonight tag-filter zone. The module is pure — no DB, no
 * React — precisely so these tests can run table-style without spinning up a
 * Postgres or rendering a component.
 */

import { describe, expect, it } from "vitest";
import {
  type ChipState,
  type TagFilters,
  chipStateLabel,
  cycleChipState,
  distinctTags,
  filterHint,
  filterTonightRows,
} from "./tonight-filter";
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

function row(option: RankOption, score = 0): TonightRow {
  return {
    option,
    score,
    tags: option.tags.map((tag) => ({ tag, days: 0, overdue: false })),
    recencyDays: 0,
    neverEaten: false,
  };
}

describe("cycleChipState", () => {
  it("advances off → include → exclude → off", () => {
    const sequence: ChipState[] = ["off"];
    for (let i = 0; i < 4; i++) {
      sequence.push(cycleChipState(sequence[sequence.length - 1]));
    }
    expect(sequence).toEqual(["off", "include", "exclude", "off", "include"]);
  });
});

describe("chipStateLabel", () => {
  it("restates each state for an accessible name", () => {
    expect(chipStateLabel("off")).toBe("not filtered");
    expect(chipStateLabel("include")).toBe("included");
    expect(chipStateLabel("exclude")).toBe("excluded");
  });
});

describe("filterTonightRows", () => {
  const pastaHome = row(
    opt({ id: "1", name: "Carbonara", kind: "home", tags: ["pasta"] }),
  );
  const fishHome = row(
    opt({ id: "2", name: "Salmon", kind: "home", tags: ["fish"] }),
  );
  const pastaFishHome = row(
    opt({ id: "3", name: "Tuna Pasta", kind: "home", tags: ["pasta", "fish"] }),
  );
  const sushiRest = row(
    opt({ id: "4", name: "Aji Ichi", kind: "restaurant", tags: ["fish"] }),
  );
  const burgerRest = row(
    opt({ id: "5", name: "Burger Joint", kind: "restaurant", tags: [] }),
  );

  const all = [pastaHome, fishHome, pastaFishHome, sushiRest, burgerRest];

  it("returns every row when no filters are active", () => {
    expect(filterTonightRows(all, "all", {})).toEqual(all);
  });

  it("keeps the input order — the ranking is preserved", () => {
    const filtered = filterTonightRows(all, "all", {});
    expect(filtered.map((r) => r.option.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("narrows to Home meals when the kind segment is 'home'", () => {
    expect(filterTonightRows(all, "home", {}).map((r) => r.option.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("narrows to Restaurants when the kind segment is 'restaurant'", () => {
    expect(
      filterTonightRows(all, "restaurant", {}).map((r) => r.option.id),
    ).toEqual(["4", "5"]);
  });

  it("includes only rows carrying every include Tag", () => {
    const tagFilters: TagFilters = { pasta: "include" };
    expect(filterTonightRows(all, "all", tagFilters).map((r) => r.option.id))
      .toEqual(["1", "3"]);
  });

  it("ANDs multiple include Tags together — row must carry all of them", () => {
    const tagFilters: TagFilters = { pasta: "include", fish: "include" };
    expect(filterTonightRows(all, "all", tagFilters).map((r) => r.option.id))
      .toEqual(["3"]);
  });

  it("excludes rows carrying any exclude Tag", () => {
    const tagFilters: TagFilters = { fish: "exclude" };
    expect(filterTonightRows(all, "all", tagFilters).map((r) => r.option.id))
      .toEqual(["1", "5"]);
  });

  it("treats an 'off' chip as inert", () => {
    const tagFilters: TagFilters = { pasta: "off" };
    expect(filterTonightRows(all, "all", tagFilters).map((r) => r.option.id))
      .toEqual(["1", "2", "3", "4", "5"]);
  });

  it("ANDs the kind segment and the tag filters together", () => {
    // Home meals carrying pasta, without fish — only Carbonara survives.
    const tagFilters: TagFilters = { pasta: "include", fish: "exclude" };
    expect(filterTonightRows(all, "home", tagFilters).map((r) => r.option.id))
      .toEqual(["1"]);
  });

  it("yields an empty list when the kind segment and tag filters disagree", () => {
    // A Home-only kind segment with an exclude on every Home Option.
    const tagFilters: TagFilters = { pasta: "exclude", fish: "exclude" };
    expect(filterTonightRows(all, "home", tagFilters)).toEqual([]);
  });
});

describe("distinctTags", () => {
  it("collects the Tag vocabulary from the ranked rows, localeCompare-sorted", () => {
    const rows = [
      row(opt({ id: "1", tags: ["pasta", "fish"] })),
      row(opt({ id: "2", tags: ["fish", "japanese"] })),
      row(opt({ id: "3", tags: [] })),
    ];
    expect(distinctTags(rows)).toEqual(["fish", "japanese", "pasta"]);
  });

  it("returns an empty array when no row carries any Tag", () => {
    expect(distinctTags([row(opt({ id: "1", tags: [] }))])).toEqual([]);
  });
});

describe("filterHint", () => {
  it("reads 'Showing all Options' when no filter is active", () => {
    expect(filterHint("all", {})).toBe("Showing all Options");
  });

  it("names the kind segment", () => {
    expect(filterHint("home", {})).toBe("Showing Home meals");
    expect(filterHint("restaurant", {})).toBe("Showing Restaurants");
  });

  it("lists include Tags with 'with' and exclude Tags with 'without'", () => {
    expect(
      filterHint("home", { pasta: "include", fish: "exclude" }),
    ).toBe("Showing Home meals with pasta, without fish");
  });

  it("sorts the Tag lists by localeCompare for stability", () => {
    expect(
      filterHint("all", { zebra: "include", apple: "include" }),
    ).toBe("Showing all Options with apple, zebra");
  });

  it("ignores chips in the 'off' state", () => {
    expect(filterHint("all", { pasta: "off" })).toBe("Showing all Options");
  });
});
