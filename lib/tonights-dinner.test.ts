import { describe, expect, it } from "vitest";

import type { RankOption, TonightRow } from "./ranking";
import {
  type TodayLogEntry,
  decidedActions,
  splitTonight,
} from "./tonights-dinner";

function mkOption(
  id: string,
  name: string,
  kind: "home" | "restaurant" = "home",
  url: string | null = null,
  phone: string | null = null,
): RankOption {
  return { id, name, kind, tags: [], url, phone };
}

function mkRow(option: RankOption, recencyDays = 0): TonightRow {
  return {
    option,
    score: 0,
    tags: [],
    recencyDays,
    neverEaten: recencyDays === 0,
  };
}

function mkTodayEntry(
  id: string,
  optionId: string,
  createdAt: Date,
): TodayLogEntry {
  return { id, optionId, createdAt };
}

describe("splitTonight", () => {
  it("no Picks → empty dinner and full picker", () => {
    const rows = [mkRow(mkOption("a", "Apple")), mkRow(mkOption("b", "Bread"))];
    const result = splitTonight(rows, [], rows);
    expect(result.tonightsDinner).toEqual([]);
    expect(result.picker.map((r) => r.option.id)).toEqual(["a", "b"]);
  });

  it("one Pick → that Option leaves the picker and enters the dinner", () => {
    const rows = [mkRow(mkOption("a", "Apple")), mkRow(mkOption("b", "Bread"))];
    const result = splitTonight(
      rows,
      [mkTodayEntry("e1", "a", new Date("2026-05-20T18:00:00Z"))],
      rows,
    );
    expect(result.tonightsDinner).toHaveLength(1);
    expect(result.tonightsDinner[0]?.entryId).toBe("e1");
    expect(result.tonightsDinner[0]?.row.option.id).toBe("a");
    expect(result.picker.map((r) => r.option.id)).toEqual(["b"]);
  });

  it("orders Picks oldest createdAt first, regardless of input order", () => {
    const a = mkOption("a", "Apple");
    const b = mkOption("b", "Bread");
    const c = mkOption("c", "Carrot");
    const rows = [mkRow(a), mkRow(b), mkRow(c)];
    const entries: TodayLogEntry[] = [
      // Newest first in the input — splitTonight must still order oldest first.
      mkTodayEntry("e3", "c", new Date("2026-05-20T20:00:00Z")),
      mkTodayEntry("e1", "a", new Date("2026-05-20T18:00:00Z")),
      mkTodayEntry("e2", "b", new Date("2026-05-20T19:00:00Z")),
    ];
    const result = splitTonight(rows, entries, rows);
    expect(result.tonightsDinner.map((e) => e.entryId)).toEqual([
      "e1",
      "e2",
      "e3",
    ]);
  });

  it("pick order is stable for ties on createdAt (sort is stable)", () => {
    const a = mkOption("a", "Apple");
    const b = mkOption("b", "Bread");
    const rows = [mkRow(a), mkRow(b)];
    const same = new Date("2026-05-20T18:00:00Z");
    const entries: TodayLogEntry[] = [
      mkTodayEntry("e1", "a", same),
      mkTodayEntry("e2", "b", same),
    ];
    const result = splitTonight(rows, entries, rows);
    expect(result.tonightsDinner.map((e) => e.entryId)).toEqual(["e1", "e2"]);
  });

  it("every Option Picked → picker is empty", () => {
    const a = mkOption("a", "Apple");
    const b = mkOption("b", "Bread");
    const rows = [mkRow(a), mkRow(b)];
    const result = splitTonight(
      rows,
      [
        mkTodayEntry("e1", "a", new Date("2026-05-20T18:00:00Z")),
        mkTodayEntry("e2", "b", new Date("2026-05-20T19:00:00Z")),
      ],
      rows,
    );
    expect(result.picker).toEqual([]);
    expect(result.tonightsDinner).toHaveLength(2);
  });

  it("a today entry whose Option is absent from decidedRows is skipped", () => {
    // Option "x" was Archived after being Picked: it's not in the ranked
    // live Catalog and not in decidedRows either. The entry is dropped.
    const a = mkOption("a", "Apple");
    const rows = [mkRow(a)];
    const result = splitTonight(
      rows,
      [
        mkTodayEntry("e1", "x", new Date("2026-05-20T18:00:00Z")),
        mkTodayEntry("e2", "a", new Date("2026-05-20T19:00:00Z")),
      ],
      rows,
    );
    expect(result.tonightsDinner.map((e) => e.entryId)).toEqual(["e2"]);
  });

  it("uses decidedRows (pre-today recency) for the decided row, not rankedRows", () => {
    const a = mkOption("a", "Apple");
    // The live ranking has antiRepeat=0 — Apple was Picked tonight.
    const live = [mkRow(a, 0)];
    // The pre-today ranking has antiRepeat=5 — Apple was last eaten 5 days ago.
    const decided = [mkRow(a, 5)];
    const result = splitTonight(
      live,
      [mkTodayEntry("e1", "a", new Date("2026-05-20T18:00:00Z"))],
      decided,
    );
    expect(result.tonightsDinner[0]?.row.recencyDays).toBe(5);
  });

  it("empty ranked set → both sides empty", () => {
    const result = splitTonight([], [], []);
    expect(result.tonightsDinner).toEqual([]);
    expect(result.picker).toEqual([]);
  });
});

describe("decidedActions", () => {
  it("Restaurant with both url and phone → Menu and Call", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: "https://example.com",
      phone: "+15555550100",
    });
    expect(actions).toEqual([
      { label: "Menu", href: "https://example.com" },
      { label: "Call", href: "tel:+15555550100" },
    ]);
  });

  it("Restaurant with only url → Menu only", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: "https://example.com",
      phone: null,
    });
    expect(actions).toEqual([{ label: "Menu", href: "https://example.com" }]);
  });

  it("Restaurant with only phone → Call only", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: null,
      phone: "+15555550100",
    });
    expect(actions).toEqual([{ label: "Call", href: "tel:+15555550100" }]);
  });

  it("Restaurant with neither → no buttons", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: null,
      phone: null,
    });
    expect(actions).toEqual([]);
  });

  it("Home meal with url → Recipe only", () => {
    const actions = decidedActions({
      kind: "home",
      url: "https://example.com/recipe",
      phone: null,
    });
    expect(actions).toEqual([
      { label: "Recipe", href: "https://example.com/recipe" },
    ]);
  });

  it("Home meal without url → no buttons", () => {
    const actions = decidedActions({ kind: "home", url: null, phone: null });
    expect(actions).toEqual([]);
  });

  it("Home meal never shows Menu or Call, even with a stray phone", () => {
    const actions = decidedActions({
      kind: "home",
      url: "https://example.com/recipe",
      phone: "+15555550100",
    });
    expect(actions).toEqual([
      { label: "Recipe", href: "https://example.com/recipe" },
    ]);
  });

  it("unsafe javascript: url on Restaurant → no Menu button", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: "javascript:alert(1)",
      phone: null,
    });
    expect(actions).toEqual([]);
  });

  it("unsafe data: url on Home meal → no Recipe button", () => {
    const actions = decidedActions({
      kind: "home",
      url: "data:text/html,hi",
      phone: null,
    });
    expect(actions).toEqual([]);
  });

  it("unsafe url on Restaurant still yields Call when phone is set", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: "javascript:alert(1)",
      phone: "+15555550100",
    });
    expect(actions).toEqual([{ label: "Call", href: "tel:+15555550100" }]);
  });

  it("http url is accepted (not just https)", () => {
    const actions = decidedActions({
      kind: "restaurant",
      url: "http://example.com",
      phone: null,
    });
    expect(actions).toEqual([{ label: "Menu", href: "http://example.com" }]);
  });

  it("empty / whitespace url → no Menu/Recipe", () => {
    expect(
      decidedActions({ kind: "restaurant", url: "   ", phone: null }),
    ).toEqual([]);
    expect(decidedActions({ kind: "home", url: "", phone: null })).toEqual([]);
  });

  it("empty / whitespace phone → no Call", () => {
    expect(
      decidedActions({ kind: "restaurant", url: null, phone: "   " }),
    ).toEqual([]);
  });
});
