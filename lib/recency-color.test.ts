import { describe, expect, it } from "vitest";

import {
  recencyChipBg,
  recencyChipBgStrong,
  recencyColor,
  recencyFraction,
  recencyMix,
} from "./recency-color";

const CAP = 60;

describe("recency-color", () => {
  describe("recencyFraction", () => {
    it("0d → 0 (red end), CAP → 1 (green end)", () => {
      expect(recencyFraction(0, CAP)).toBe(0);
      expect(recencyFraction(CAP, CAP)).toBe(1);
    });
    it("midpoint at CAP/2", () => {
      expect(recencyFraction(CAP / 2, CAP)).toBe(0.5);
    });
    it("clamps below 0 and above CAP", () => {
      expect(recencyFraction(-5, CAP)).toBe(0);
      expect(recencyFraction(CAP * 2, CAP)).toBe(1);
    });
  });

  describe("recencyMix", () => {
    it("interpolates between RECENT and MID below the midpoint", () => {
      const result = recencyMix(0, CAP);
      expect(result).toContain("var(--color-recency-recent)");
      expect(result).toContain("100%");
      expect(result).toContain("var(--color-recency-mid)");
      expect(result).toContain("0%");
    });
    it("interpolates between MID and OVERDUE above the midpoint", () => {
      const result = recencyMix(CAP, CAP);
      expect(result).toContain("var(--color-recency-overdue)");
      expect(result).toContain("100%");
      expect(result).toContain("var(--color-recency-mid)");
    });
    it("crosses the midpoint at exactly tan", () => {
      const mid = recencyMix(CAP / 2, CAP);
      // At fraction = 0.5 the first branch returns mid 100%, recent 0%.
      expect(mid).toContain("var(--color-recency-mid)");
      expect(mid).toContain("100%");
    });
  });

  describe("chip backgrounds", () => {
    it("`recencyChipBgStrong` is louder than `recencyChipBg`", () => {
      const faint = recencyChipBg(30, CAP);
      const strong = recencyChipBgStrong(30, CAP);
      expect(faint).toContain("transparent");
      expect(strong).toContain("transparent");
      // The outer `color-mix` wraps the heatmap color with a transparent
      // overlay; the percentage just before `, transparent)` is the chip's
      // own weight. Pull that one, not the inner heatmap percentages.
      const outer = /(\d+)%, transparent\)$/;
      const faintPct = Number(outer.exec(faint)?.[1] ?? -1);
      const strongPct = Number(outer.exec(strong)?.[1] ?? -1);
      expect(strongPct).toBeGreaterThan(faintPct);
    });
  });

  describe("recencyColor", () => {
    it("returns the fraction, heatmap, and both chip backgrounds", () => {
      const out = recencyColor(20, CAP);
      expect(out.fraction).toBeCloseTo(20 / CAP, 5);
      expect(out.color).toContain("color-mix");
      expect(out.chipBg).toContain("transparent");
      expect(out.chipBgStrong).toContain("transparent");
    });
  });
});
