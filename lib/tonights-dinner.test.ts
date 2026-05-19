/**
 * Unit tests for `splitTonight` — the pure split of the Tonight ranking into
 * Tonight's dinner (the decided panel) and the picker. Table-style: every
 * case constructs a tiny ranked set and a tiny set of today entries and
 * asserts the two slices.
 */

import { describe, expect, it } from "vitest";
import {
  type TodayLogEntry,
  decidedActions,
  safeHttpUrl,
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

describe("safeHttpUrl", () => {
  it("admits an http:// URL unchanged", () => {
    expect(safeHttpUrl("http://example.com/menu")).toBe(
      "http://example.com/menu",
    );
  });

  it("admits an https:// URL unchanged", () => {
    expect(safeHttpUrl("https://example.com/recipe")).toBe(
      "https://example.com/recipe",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(safeHttpUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("rejects a javascript: URL", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects a data: URL", () => {
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(safeHttpUrl("")).toBeNull();
  });

  it("rejects a whitespace-only string", () => {
    expect(safeHttpUrl("   ")).toBeNull();
  });

  it("rejects a non-URL string", () => {
    expect(safeHttpUrl("not a url at all")).toBeNull();
  });

  it("rejects null", () => {
    expect(safeHttpUrl(null)).toBeNull();
  });

  it("rejects mailto:", () => {
    expect(safeHttpUrl("mailto:hello@example.com")).toBeNull();
  });

  it("rejects ftp:", () => {
    expect(safeHttpUrl("ftp://example.com/file")).toBeNull();
  });
});

describe("decidedActions", () => {
  it("Restaurant with both url and phone yields Menu then Call", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: "https://aji-ichi.example.com",
      phone: "+44 20 1234 5678",
    });
    expect(actions).toEqual([
      { label: "Menu", href: "https://aji-ichi.example.com" },
      { label: "Call", href: "tel:+44 20 1234 5678" },
    ]);
  });

  it("Restaurant with only url yields just the Menu button", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: "https://aji-ichi.example.com",
      phone: null,
    });
    expect(actions).toEqual([
      { label: "Menu", href: "https://aji-ichi.example.com" },
    ]);
  });

  it("Restaurant with only phone yields just the Call button", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: null,
      phone: "+44 20 1234 5678",
    });
    expect(actions).toEqual([
      { label: "Call", href: "tel:+44 20 1234 5678" },
    ]);
  });

  it("Restaurant with neither field yields no action buttons", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: null,
      phone: null,
    });
    expect(actions).toEqual([]);
  });

  it("Home meal with url yields a Recipe button", () => {
    const actions = decidedActions({
      kind: "home",
      url: "https://recipes.example.com/carbonara",
      phone: null,
    });
    expect(actions).toEqual([
      { label: "Recipe", href: "https://recipes.example.com/carbonara" },
    ]);
  });

  it("Home meal without a url yields no action buttons", () => {
    const actions = decidedActions({
      kind: "home",
      url: null,
      phone: null,
    });
    expect(actions).toEqual([]);
  });

  it("Home meal never shows Menu or Call, even with a stray phone", () => {
    const actions = decidedActions({
      kind: "home",
      url: null,
      phone: "+44 20 9999 9999",
    });
    expect(actions).toEqual([]);
  });

  it("Home meal with a url ignores a stray phone — only Recipe", () => {
    const actions = decidedActions({
      kind: "home",
      url: "https://recipes.example.com/carbonara",
      phone: "+44 20 9999 9999",
    });
    expect(actions).toEqual([
      { label: "Recipe", href: "https://recipes.example.com/carbonara" },
    ]);
  });

  it("Restaurant with a javascript: url and no phone yields no buttons", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: "javascript:alert(1)",
      phone: null,
    });
    expect(actions).toEqual([]);
  });

  it("Restaurant with an unsafe url but a phone still yields the Call button", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: "javascript:alert(1)",
      phone: "+44 20 1234 5678",
    });
    expect(actions).toEqual([
      { label: "Call", href: "tel:+44 20 1234 5678" },
    ]);
  });

  it("Home meal with a data: url yields no Recipe button", () => {
    const actions = decidedActions({
      kind: "home",
      url: "data:text/html,<script>alert(1)</script>",
      phone: null,
    });
    expect(actions).toEqual([]);
  });

  it("Restaurant with a whitespace-only phone yields no Call button", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: null,
      phone: "   ",
    });
    expect(actions).toEqual([]);
  });

  it("Restaurant phone is trimmed in the tel: href", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: null,
      phone: "  555-1234  ",
    });
    expect(actions).toEqual([{ label: "Call", href: "tel:555-1234" }]);
  });
});
