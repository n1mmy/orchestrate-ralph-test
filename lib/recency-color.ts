/**
 * The recency heatmap — a pure CSS-string helper that interpolates a colour
 * from `--color-recency-recent` (red, just eaten) through
 * `--color-recency-mid` (muted tan, midway) to `--color-recency-overdue`
 * (green, long overdue), parameterised by a recency in days.
 *
 * Interpolation is delegated to native `color-mix(in srgb, …)` so the actual
 * mixing happens in the browser, against whichever theme is currently active
 * (light or dark) — the CSS variables are the single source of truth for the
 * three anchor stops. This module only computes the *mix percentage*.
 *
 * Two strengths are exported so the Tonight row can pair a louder Recency
 * chip with fainter Tag chips on the same scale; both are wrappers around
 * `recencyColor` at different alphas.
 *
 * Pure — no DOM, no React. Returns the literal CSS string.
 */

import { CAP } from "./ranking.config";

/** The midpoint of the heatmap, in days. Below = redder, above = greener. */
const MID = CAP / 2;

/**
 * The interpolated heatmap colour at `days`. The mid point of the scale is
 * `CAP / 2`: below it the result mixes `recent → mid`, above it `mid →
 * overdue`. The percentage runs 0 → 100 across the half-scale on each side.
 * Out-of-range values are clamped at the endpoints.
 *
 * The output is a CSS `color-mix(...)` expression — embed it directly in a
 * `style` attribute or compose it with another `color-mix` (the `*ChipBg`
 * helpers do exactly that to apply alpha).
 */
export function recencyColor(days: number): string {
  const clamped = Math.max(0, Math.min(CAP, days));
  if (clamped <= MID) {
    const pct = Math.round((clamped / MID) * 100);
    return `color-mix(in srgb, var(--color-recency-recent) ${
      100 - pct
    }%, var(--color-recency-mid) ${pct}%)`;
  }
  const pct = Math.round(((clamped - MID) / MID) * 100);
  return `color-mix(in srgb, var(--color-recency-mid) ${
    100 - pct
  }%, var(--color-recency-overdue) ${pct}%)`;
}

/**
 * The fainter chip-background fill: the heatmap colour at 14% strength
 * (`transparent 86%`). Used for the per-Tag chips.
 */
export function recencyChipBg(days: number): string {
  return `color-mix(in srgb, ${recencyColor(days)} 14%, transparent 86%)`;
}

/**
 * The louder chip-background fill: the heatmap colour at 38% strength
 * (`transparent 62%`). Used for the per-Option Recency chip — the Score's
 * anti-repeat signal carries the louder fill.
 */
export function recencyChipBgStrong(days: number): string {
  return `color-mix(in srgb, ${recencyColor(days)} 38%, transparent 62%)`;
}
