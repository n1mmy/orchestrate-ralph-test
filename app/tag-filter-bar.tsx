"use client";

import {
  type ChipState,
  type TagFilters,
  chipStateLabel,
  cycleChipState,
} from "@/lib/tonight-filter";

type Props = {
  tags: readonly string[];
  filters: TagFilters;
  onChange: (next: TagFilters) => void;
};

function chipClasses(state: ChipState): string {
  if (state === "include") {
    return "bg-action text-action-ink border-action underline";
  }
  if (state === "exclude") {
    return "bg-exclude text-ink border-exclude line-through";
  }
  return "bg-surface text-ink border-line";
}

/**
 * Sticky Tag-filter chip row. Each chip cycles off → include → exclude →
 * off, with its visual state carried by both fill *and* a text decoration
 * (underline / strikethrough) so the state is legible in grayscale.
 * Every chip's `aria-label` voices its state via `chipStateLabel`.
 *
 * The border is present in every state so toggling does not reflow.
 */
export function TagFilterBar({ tags, filters, onChange }: Props) {
  if (tags.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Filter Tonight by Tag"
      className="sticky top-0 z-10 flex flex-row flex-wrap gap-xs bg-bg py-sm"
    >
      {tags.map((tag) => {
        const state = filters[tag] ?? "off";
        return (
          <button
            key={tag}
            type="button"
            aria-label={`${tag} — ${chipStateLabel(state)}`}
            onClick={() =>
              onChange({ ...filters, [tag]: cycleChipState(state) })
            }
            className={`rounded-badge border px-sm py-2xs text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${chipClasses(
              state,
            )}`}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
