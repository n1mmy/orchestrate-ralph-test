"use client";

import { useEffect, useMemo, useState } from "react";
import { kindBarClass } from "./kind-bar";
import { recencyChipBg, recencyChipBgStrong } from "@/lib/recency-color";
import { TonightRow } from "./tonight-row";
import { CAP } from "@/lib/ranking.config";
import type { TonightRow as TonightRowData } from "@/lib/ranking";
import type { TonightsDinnerEntry } from "@/lib/tonights-dinner";
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

/**
 * The Tonight screen — the home screen. Has two modes, decided by the
 * Household's Log:
 *
 * 1. **Picker mode** (no Log entry dated today) — the v1 ranked picker: kind
 *    segment, Tag filter chips, ranked `<ol>`.
 * 2. **Decided mode** (today has at least one Log entry) — a "Tonight's
 *    dinner" panel surfaces the Picked Options under a quiet `<h2>` sub-label;
 *    the picker stays open below in an "Add another option" section so a
 *    second Pick adds (rather than replaces) a Dinner. PRD amendment
 *    2026-05-17.
 *
 * The mode is **server-decided** — `app/page.tsx` calls `splitTonight` and
 * passes the two slices in; the screen derives `const decided =
 * tonightsDinner.length > 0`. Mode is never client state. The screen heading
 * stays `<h1>Tonight</h1>` in both modes; the decided sub-label is a quiet
 * uppercase `<h2>` ("Tonight's dinner") inside a `<section aria-label="Tonight's dinner">`.
 *
 * Tag filtering and the kind segment are inherited from the prior
 * `TonightFilters` component: the pure logic lives in `lib/tonight-filter.ts`
 * so the chip cycle, the predicate, and the hint string are unit-tested
 * without React. The chip states and kind segment are local UI state because
 * they are pure view filters over server-handed rows.
 */
export function TonightScreen({
  tonightsDinner,
  pickerRows,
}: {
  tonightsDinner: TonightsDinnerEntry[];
  pickerRows: TonightRowData[];
}) {
  const decided = tonightsDinner.length > 0;

  const [kind, setKind] = useState<KindFilter>("all");
  const [tagFilters, setTagFilters] = useState<TagFilters>({});

  const tags = useMemo(() => distinctTags(pickerRows), [pickerRows]);
  const visiblePicker = useMemo(
    () => filterTonightRows(pickerRows, kind, tagFilters),
    [pickerRows, kind, tagFilters],
  );
  const hint = filterHint(kind, tagFilters);

  // Smooth-scroll to the top when Tonight's dinner grows by a Pick the
  // Household just made — so the new Option lands visibly in the decided
  // block. The previous count is held in `sessionStorage` so the effect only
  // fires on a real *growth*, not on a first-render hydration of an
  // already-decided Tonight. `prefers-reduced-motion` short-circuits to an
  // instant jump rather than a smooth scroll.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "tonights-dinner-count";
    const prev = Number(window.sessionStorage.getItem(KEY) ?? "0");
    const next = tonightsDinner.length;
    window.sessionStorage.setItem(KEY, String(next));
    if (next <= prev) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [tonightsDinner.length]);

  const tap = (tag: string) =>
    setTagFilters((prev) => {
      const next: TagFilters = { ...prev };
      const advanced = cycleChipState(prev[tag] ?? "off");
      if (advanced === "off") delete next[tag];
      else next[tag] = advanced;
      return next;
    });

  const showKindSegment = pickerRows.length > 0;

  return (
    <>
      <header className="flex items-center justify-between gap-md py-sm">
        <h1 className="font-display text-h1 font-semibold">Tonight</h1>
        {showKindSegment ? (
          <KindSegment value={kind} onChange={setKind} />
        ) : null}
      </header>

      {/* The mode change is announced to assistive tech via a visually-hidden
       * polite live region. The string changes between modes, prompting a
       * fresh announcement. */}
      <p className="sr-only" role="status" aria-live="polite">
        {decided
          ? "Tonight's dinner is decided."
          : "Choosing tonight's dinner."}
      </p>

      {decided ? (
        <section aria-label="Tonight's dinner" className="pt-sm">
          <h2 className="text-meta font-emphasis uppercase tracking-wide text-muted">
            Tonight&apos;s dinner
          </h2>
          <ul className="mt-xs flex flex-col gap-xs">
            {tonightsDinner.map((d) => (
              <DecidedRow key={d.entryId} entry={d} />
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-label={decided ? "Add another option" : "Pick tonight's dinner"}
        className={decided ? "mt-lg border-t border-line pt-md" : ""}
      >
        {decided ? (
          <>
            <h2 className="text-meta font-emphasis uppercase tracking-wide text-muted">
              Add another option
            </h2>
            <p className="mt-2xs text-meta text-muted">
              Picking from this list adds a second Option to tonight&apos;s
              dinner — it does not replace what&apos;s above.
            </p>
          </>
        ) : null}

        {pickerRows.length === 0 ? (
          decided ? (
            <p className="mt-sm text-body text-muted">
              Every Option is already on tonight&apos;s dinner.
            </p>
          ) : null
        ) : (
          <PickerFilters
            tags={tags}
            tagFilters={tagFilters}
            hint={hint}
            onTap={tap}
            visible={visiblePicker}
          />
        )}
      </section>
    </>
  );
}

/**
 * The Tag-filter chip row + ranked `<ol>` — the picker's body. Held together
 * so picker mode and the "Add another option" section render the exact same
 * markup. The sticky chip bar / `<ol>` shape is unchanged from the prior
 * `TonightFilters`.
 */
function PickerFilters({
  tags,
  tagFilters,
  hint,
  onTap,
  visible,
}: {
  tags: string[];
  tagFilters: TagFilters;
  hint: string;
  onTap: (tag: string) => void;
  visible: TonightRowData[];
}) {
  return (
    <>
      {tags.length > 0 && (
        <div className="sticky top-0 z-10 -mx-lg flex flex-col gap-xs bg-bg px-lg pb-sm pt-xs">
          <div
            className="flex flex-wrap gap-xs"
            role="group"
            aria-label="Tag filters"
          >
            {tags.map((tag) => (
              <TagFilterChip
                key={tag}
                tag={tag}
                state={tagFilters[tag] ?? "off"}
                onTap={() => onTap(tag)}
              />
            ))}
          </div>
          <p role="status" aria-live="polite" className="text-meta text-muted">
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
 * One row inside the **Tonight's dinner** panel. Unlike the flat picker
 * ledger above, each decided row carries a much-lighter wash of its
 * meal-kind hue (`kind-home-wash` / `kind-restaurant-wash`) as its
 * background, so the decided area reads as a distinct settled panel —
 * DESIGN.md "Decided block". The row still carries the 3px meal-kind left
 * bar, the Option name, and the chips taken from `decidedRows` (recency as
 * it stood **before** tonight's Pick).
 *
 * Per-row action buttons ("Remove", etc.) land in later tickets (12, 13);
 * this is the canvas they hang on.
 */
function DecidedRow({ entry }: { entry: TonightsDinnerEntry }) {
  const { row } = entry;
  const { option, recencyDays, neverEaten, tags } = row;
  const wash =
    option.kind === "home" ? "bg-kind-home-wash" : "bg-kind-restaurant-wash";
  return (
    <li
      className={`flex items-center gap-md rounded-input py-md pl-sm pr-md ${wash} ${kindBarClass(
        option.kind,
      )}`}
    >
      <div className="flex flex-1 flex-col gap-2xs">
        <span className="font-display text-name">{option.name}</span>
        <div className="flex flex-wrap items-center gap-xs">
          <RecencyChip recencyDays={recencyDays} neverEaten={neverEaten} />
          {tags.map((t) => (
            <TagChip key={t.tag} tag={t.tag} days={t.days} />
          ))}
        </div>
      </div>
    </li>
  );
}

function RecencyChip({
  recencyDays,
  neverEaten,
}: {
  recencyDays: number;
  neverEaten: boolean;
}) {
  const label = neverEaten
    ? "new"
    : recencyDays >= CAP
      ? "60d+"
      : `${recencyDays}d`;
  return (
    <span
      className="rounded-badge px-xs py-2xs font-mono text-chip tabular-nums"
      style={{ background: recencyChipBgStrong(recencyDays) }}
    >
      {label}
    </span>
  );
}

function TagChip({ tag, days }: { tag: string; days: number }) {
  const label = days >= CAP ? "60d+" : `${days}d`;
  return (
    <span
      className="rounded-badge px-xs py-2xs text-chip"
      style={{ background: recencyChipBg(days) }}
    >
      <span>{tag} </span>
      <span className="font-mono tabular-nums">{label}</span>
    </span>
  );
}

/**
 * The All / Home / Restaurant segmented control in the page header. Lifted
 * unchanged from the prior `TonightFilters` — `aria-pressed` on each button
 * so a screen reader announces which segment is active, ≥ 44×44px touch
 * targets per the issue's accessibility note.
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
 * tap via `cycleChipState`. Lifted unchanged from the prior `TonightFilters`;
 * the three state channels (background fill, text decoration, accessible
 * name) keep the chip parseable in grayscale (DESIGN.md / PRD §18).
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
