import { describe, expect, it } from "vitest";
import {
  recencyChipBg,
  recencyChipBgStrong,
  recencyColor,
} from "./recency-color";
import { CAP } from "./ranking.config";

const MID = CAP / 2;

describe("recencyColor", () => {
  it("at 0 days, mixes 100% of the 'recent' anchor (just eaten = red)", () => {
    const result = recencyColor(0);
    expect(result).toContain("var(--color-recency-recent) 100%");
    expect(result).toContain("var(--color-recency-mid) 0%");
  });

  it("at the midpoint, mixes 100% of the 'mid' anchor", () => {
    const result = recencyColor(MID);
    expect(result).toContain("var(--color-recency-recent) 0%");
    expect(result).toContain("var(--color-recency-mid) 100%");
  });

  it("at CAP, mixes 100% of the 'overdue' anchor (long overdue = green)", () => {
    const result = recencyColor(CAP);
    expect(result).toContain("var(--color-recency-mid) 0%");
    expect(result).toContain("var(--color-recency-overdue) 100%");
  });

  it("below the midpoint interpolates recent → mid", () => {
    // Quarter-way: 50% mid, 50% recent.
    const result = recencyColor(MID / 2);
    expect(result).toContain("var(--color-recency-recent) 50%");
    expect(result).toContain("var(--color-recency-mid) 50%");
    expect(result).not.toContain("var(--color-recency-overdue)");
  });

  it("above the midpoint interpolates mid → overdue", () => {
    // Three-quarters: 50% mid, 50% overdue.
    const result = recencyColor(MID + MID / 2);
    expect(result).toContain("var(--color-recency-mid) 50%");
    expect(result).toContain("var(--color-recency-overdue) 50%");
    expect(result).not.toContain("var(--color-recency-recent)");
  });

  it("clamps a negative day count to the recent end", () => {
    expect(recencyColor(-10)).toBe(recencyColor(0));
  });

  it("clamps a day count beyond CAP to the overdue end", () => {
    expect(recencyColor(CAP + 100)).toBe(recencyColor(CAP));
  });
});

describe("recencyChipBg / recencyChipBgStrong", () => {
  it("the faint fill mixes the heatmap at 14% over 86% transparent", () => {
    const bg = recencyChipBg(0);
    expect(bg).toContain("14%");
    expect(bg).toContain("transparent 86%");
    // Carries the inner recency colour expression.
    expect(bg).toContain("var(--color-recency-recent)");
  });

  it("the strong fill mixes the heatmap at 38% over 62% transparent", () => {
    const bg = recencyChipBgStrong(CAP);
    expect(bg).toContain("38%");
    expect(bg).toContain("transparent 62%");
    expect(bg).toContain("var(--color-recency-overdue)");
  });

  it("the two strengths produce different CSS expressions for the same day count", () => {
    expect(recencyChipBg(20)).not.toEqual(recencyChipBgStrong(20));
  });
});
