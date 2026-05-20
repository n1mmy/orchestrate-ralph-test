"use client";

import type { KindFilter } from "@/lib/tonight-filter";

type Props = {
  value: KindFilter;
  onChange: (next: KindFilter) => void;
};

const SEGMENTS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "home", label: "Home" },
  { value: "restaurant", label: "Restaurant" },
];

/**
 * All / Home / Restaurant segmented control. Sits in the Tonight header
 * beside the title. Each button is `aria-pressed` so a screen reader gets
 * the selection without relying on color.
 */
export function KindSegment({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Filter by meal kind"
      className="flex flex-row gap-xs"
    >
      {SEGMENTS.map((segment) => {
        const pressed = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(segment.value)}
            className={`min-h-[44px] min-w-[44px] rounded-control border border-line px-md text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
              pressed
                ? "bg-action text-action-ink"
                : "bg-surface text-ink"
            }`}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
