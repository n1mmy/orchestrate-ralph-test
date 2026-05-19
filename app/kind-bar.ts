/**
 * The 3px solid meal-kind left bar — DESIGN.md's first colour channel.
 *
 * Every Tonight row carries one of two left-edge bars: teal for a Home meal,
 * plum for a Restaurant. This helper is the single home of that mapping so
 * every place that renders an Option row — Tonight today, and later phases
 * (the Log screen, the Option detail page) — stays in sync.
 *
 * Returns a Tailwind class string that sets the bar via a left border on a
 * positioned pseudo-row. The colour tokens are the `kind-home` / `kind-restaurant`
 * theme colours mirrored from `--color-kind-*`.
 */
export function kindBarClass(kind: "home" | "restaurant"): string {
  return kind === "home"
    ? "border-l-[3px] border-kind-home"
    : "border-l-[3px] border-kind-restaurant";
}
