/**
 * Recency heatmap — a continuous red→green scale anchored on three CSS
 * variables: `--color-recency-recent`, `--color-recency-mid`,
 * `--color-recency-overdue` (see DESIGN.md). Pure helpers that emit
 * `color-mix(in oklab, …)` expressions so the theme tokens stay the single
 * source of truth (light + dark themes flow through automatically).
 *
 * `recencyFraction(days, cap)` linearly interpolates a fraction `0..1`,
 * where `0` is "just ate" (red end) and `1` is "long overdue" (green end).
 * `recencyMix(days, cap)` returns the `color-mix(…)` expression that
 * resolves to the row's heatmap color at that fraction. The chip
 * background helpers (`recencyChipBg`, `recencyChipBgStrong`) wrap the
 * heatmap color in a faint / louder transparent overlay — the chip text
 * stays legible while the background tints the row.
 */
const RECENT = "var(--color-recency-recent)";
const MID = "var(--color-recency-mid)";
const OVERDUE = "var(--color-recency-overdue)";

/**
 * Map `days` to a `0..1` fraction across the heatmap. `0` is the red end
 * (eaten today); `1` is the green end (at or beyond `cap`).
 */
export function recencyFraction(days: number, cap: number): number {
  if (cap <= 0) return 0;
  const clamped = Math.max(0, Math.min(cap, days));
  return clamped / cap;
}

/**
 * `color-mix(…)` expression resolving to the row's heatmap color. Splits
 * the scale at the midpoint: red → tan for the first half, tan → green
 * for the second.
 */
export function recencyMix(days: number, cap: number): string {
  const fraction = recencyFraction(days, cap);
  if (fraction <= 0.5) {
    const pct = Math.round(fraction * 2 * 100);
    return `color-mix(in oklab, ${RECENT} ${100 - pct}%, ${MID} ${pct}%)`;
  }
  const pct = Math.round((fraction - 0.5) * 2 * 100);
  return `color-mix(in oklab, ${MID} ${100 - pct}%, ${OVERDUE} ${pct}%)`;
}

/**
 * Faint chip background — for the Tag chips, where the chip's own text
 * carries the Tag name in `ink` and the background only tints behind it.
 */
export function recencyChipBg(days: number, cap: number): string {
  const heat = recencyMix(days, cap);
  return `color-mix(in oklab, ${heat} 14%, transparent)`;
}

/**
 * Louder chip background — for the per-Option Recency chip, the row's
 * primary heatmap surface.
 */
export function recencyChipBgStrong(days: number, cap: number): string {
  const heat = recencyMix(days, cap);
  return `color-mix(in oklab, ${heat} 38%, transparent)`;
}

/**
 * Convenience that returns both backgrounds plus the raw `color-mix`,
 * useful when a caller wants both the chip background and the text tint
 * from one place. Kept separate from the individual helpers above so the
 * tests can target each surface independently.
 */
export function recencyColor(days: number, cap: number) {
  return {
    fraction: recencyFraction(days, cap),
    color: recencyMix(days, cap),
    chipBg: recencyChipBg(days, cap),
    chipBgStrong: recencyChipBgStrong(days, cap),
  };
}
