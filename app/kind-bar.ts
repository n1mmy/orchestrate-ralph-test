/**
 * The 3px meal-kind left bar (teal / plum) — DESIGN.md's first color
 * channel. Centralised here so every place that renders a kind-tagged row
 * (Tonight, the Log, the Option detail page) picks up the same tokens.
 */
export type OptionKind = "home" | "restaurant";

/**
 * Tailwind class string for the 3px solid left bar.
 * `kind-home` teal for home-cooked Options; `kind-restaurant` plum for
 * Restaurants.
 */
export function kindBarClass(kind: OptionKind): string {
  if (kind === "home") {
    return "border-l-[3px] border-kind-home";
  }
  return "border-l-[3px] border-kind-restaurant";
}
