"use client";

import { useMemo, useState } from "react";
import { TonightRow } from "./tonight-row";
import {
  type ChipState,
  type KindFilter,
  type TagFilters,
  chipStateLabel,
  cycleChipState,
  distinctTags,
  filterHint,
  filterTonightRows,
} from "@/lib/tonight-filter";
import type { TonightRow as TonightRowData } from "@/lib/ranking";

/**
 * The Tonight filter zone — kind segment in the page header beside "Tonight",
 * then the sticky tag-filter chip row with its live-region hint line, then
 * the ranked `<ol>` itself. A client component because the chip states and
 * the kind segment are local UI state; the ranked rows are still computed
 * server-side in `app/page.tsx` and handed in as a prop.
 *
 * The pure logic — the cycle, the predicate, the hint string — lives in
 * `lib/tonight-filter.ts` so the unit tests can drive it without React.
 */
export function TonightFilters({ rows }: { rows: TonightRowData[] }) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [tagFilters, setTagFilters] = useState<TagFilters>({});

  const tags = useMemo(() => distinctTags(rows), [rows]);
  const visible = useMemo(
    () => filterTonightRows(rows, kind, tagFilters),
    [rows, kind, tagFilters],
  );
  const hint = filterHint(kind, tagFilters);

  const tap = (tag: string) =>
    setTagFilters((prev) => {
      const next: TagFilters = { ...prev };
      const advanced = cycleChipState(prev[tag] ?? "off");
      if (advanced === "off") delete next[tag];
      else next[tag] = advanced;
      return next;
    });

  return (
    <>
      <header className="flex items-center justify-between gap-md py-sm">
        <h1 className="font-display text-h1 font-semibold">Tonight</h1>
        <KindSegment value={kind} onChange={setKind} />
      </header>

      {tags.length > 0 && (
        <div className="sticky top-0 z-10 -mx-lg flex flex-col gap-xs bg-bg px-lg pb-sm pt-xs">
          <div className="flex flex-wrap gap-xs" role="group" aria-label="Tag filters">
            {tags.map((tag) => (
              <TagFilterChip
                key={tag}
                tag={tag}
                state={tagFilters[tag] ?? "off"}
                onTap={() => tap(tag)}
              />
            ))}
          </div>
          <p
            role="status"
            aria-live="polite"
            className="text-meta text-muted"
          >
            {hint}
          </p>
        </div>
      )}

      <ol className="flex flex-col">
        {visible.map((row, idx) => (
          <TonightRow key={row.option.id} rank={idx + 1} row={row} />
        ))}
      </ol>
    </>
  );
}

/**
 * The All / Home / Restaurant segmented control in the page header. Uses
 * `aria-pressed` on each button so a screen reader announces which segment
 * is active. Each button is ≥ 44×44px per the issue's accessibility note —
 * the kind segment is the one place the Tonight filter zone holds the touch
 * target, since the tag chips below are deliberately compact.
 */
function KindSegment({
  value,
  onChange,
}: {
  value: KindFilter;
  onChange: (k: KindFilter) => void;
}) {
  const options: { key: KindFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "home", label: "Home" },
    { key: "restaurant", label: "Restaurant" },
  ];
  return (
    <div
      className="flex items-stretch overflow-hidden rounded-control border border-line"
      role="group"
      aria-label="Filter by kind"
    >
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.key)}
            className={`min-h-[44px] min-w-[44px] px-md text-meta ${
              active
                ? "bg-action text-action-ink"
                : "bg-surface text-ink hover:bg-raised"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One tag filter chip — tri-state, cycles off → include → exclude → off on
 * tap via `cycleChipState`. State is encoded in three legible channels so it
 * stays parseable in grayscale (DESIGN.md / PRD §18):
 *
 *   - background fill: `raised` off, `action` include, `exclude` exclude
 *   - text decoration: underline include, line-through exclude
 *   - accessible name: `${tag}, ${chipStateLabel(state)}`
 *
 * A persistent border in every state keeps the chip's box the same size so
 * toggling never reflows the wrapped row of chips.
 */
function TagFilterChip({
  tag,
  state,
  onTap,
}: {
  tag: string;
  state: ChipState;
  onTap: () => void;
}) {
  const fill =
    state === "include"
      ? "bg-action text-action-ink"
      : state === "exclude"
        ? "bg-exclude text-action-ink"
        : "bg-raised text-ink";
  const decoration =
    state === "include"
      ? "underline"
      : state === "exclude"
        ? "line-through"
        : "no-underline";
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${tag}, ${chipStateLabel(state)}`}
      aria-pressed={state !== "off"}
      className={`rounded-badge border border-line px-xs py-2xs text-chip ${fill} ${decoration}`}
    >
      {tag}
    </button>
  );
}
