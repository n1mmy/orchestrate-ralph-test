"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { TonightRow as TonightRowData } from "@/lib/ranking";
import {
  type KindFilter,
  type TagFilters,
  distinctTags,
  filterHint,
  filterTonightRows,
} from "@/lib/tonight-filter";
import type { TonightsDinnerEntry } from "@/lib/tonights-dinner";

import { KindSegment } from "./kind-segment";
import { TagFilterBar } from "./tag-filter-bar";
import { TonightRow } from "./tonight-row";
import { TonightsDinnerBlock } from "./tonights-dinner-block";

type Props = {
  /** The picker rows — rows from the live ranking that are not yet Picked. */
  pickerRows: TonightRowData[];
  /** The decided block — today's Picks in oldest-first order. */
  tonightsDinner: TonightsDinnerEntry[];
};

/**
 * Tonight screen — the home screen. Two-mode picker driven server-side
 * by the Household's Log:
 *
 * - **Picker mode** (no Pick today): the ranked `<ol>` is the whole
 *   screen, with the All/Home/Restaurant `KindSegment` in the header
 *   and the sticky tri-state Tag filter zone above the list.
 * - **Decided mode** (at least one Pick today): the "Tonight's dinner"
 *   block sits under the `<h1>`, the picker stays open below inside an
 *   "Add another option" subsection so the Household can append a
 *   second dinner without leaving Tonight.
 *
 * The mode is never client state — it's derived from `tonightsDinner`,
 * which the server recomputes on every revalidation.
 */
export function TonightScreen({ pickerRows, tonightsDinner }: Props) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [tagFilters, setTagFilters] = useState<TagFilters>({});

  const decided = tonightsDinner.length > 0;

  const allTags = useMemo(() => distinctTags(pickerRows), [pickerRows]);
  const filtered = useMemo(
    () => filterTonightRows(pickerRows, kind, tagFilters),
    [pickerRows, kind, tagFilters],
  );
  const hint = filterHint(kind, tagFilters);

  // Smooth-scroll to the top when a Pick grows the decided block, so
  // the Household sees what they just Picked. `sessionStorage` is the
  // cross-render memo. `prefers-reduced-motion` is honored.
  useEffect(() => {
    const key = "pmad:tonightsDinnerCount";
    const prev = Number(window.sessionStorage.getItem(key) ?? "0");
    const next = tonightsDinner.length;
    if (next > prev) {
      const reduce = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }
    window.sessionStorage.setItem(key, String(next));
  }, [tonightsDinner.length]);

  const screenStatus = decided
    ? "Tonight's dinner is decided."
    : "Choosing tonight's dinner.";

  // Empty Catalog (no rows even before splitting) — the original prompt.
  if (!decided && pickerRows.length === 0) {
    return (
      <main className="column">
        <h1 className="py-lg font-display text-h1 text-ink">Tonight</h1>
        <p className="text-body text-muted">
          Your Catalog is empty.{" "}
          <Link href="/catalog" className="underline text-ink">
            Add your first meals →
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="column">
      <span role="status" aria-live="polite" className="sr-only">
        {screenStatus}
      </span>
      <header className="flex flex-row items-center justify-between gap-md py-lg">
        <h1 className="font-display text-h1 text-ink">Tonight</h1>
        {pickerRows.length > 0 ? (
          <KindSegment value={kind} onChange={setKind} />
        ) : null}
      </header>

      {decided ? <TonightsDinnerBlock entries={tonightsDinner} /> : null}

      {decided ? (
        <section
          aria-label="Add another option"
          className="flex flex-col gap-sm border-t border-line pt-md"
        >
          <h2 className="text-meta font-semibold uppercase tracking-wider text-muted">
            Add another option
          </h2>
          <p className="text-meta text-muted">
            Picking from this list adds a second dinner — it does not replace
            what&apos;s already on tonight&apos;s dinner.
          </p>
          <Picker
            rows={pickerRows}
            allTags={allTags}
            kind={kind}
            tagFilters={tagFilters}
            filtered={filtered}
            hint={hint}
            onKind={setKind}
            onTagFilters={setTagFilters}
            allPickedMessage="Every Option is already on tonight's dinner."
          />
        </section>
      ) : (
        <Picker
          rows={pickerRows}
          allTags={allTags}
          kind={kind}
          tagFilters={tagFilters}
          filtered={filtered}
          hint={hint}
          onKind={setKind}
          onTagFilters={setTagFilters}
          allPickedMessage={null}
        />
      )}
    </main>
  );
}

type PickerProps = {
  rows: TonightRowData[];
  allTags: string[];
  kind: KindFilter;
  tagFilters: TagFilters;
  filtered: TonightRowData[];
  hint: string;
  onKind: (kind: KindFilter) => void;
  onTagFilters: (filters: TagFilters) => void;
  /**
   * What to render when the picker has no rows (every Option Picked).
   * `null` falls back to the base-screen "empty Catalog" prompt — only
   * possible in picker mode, where the page already special-cases above.
   */
  allPickedMessage: string | null;
};

function Picker({
  rows,
  allTags,
  kind: _kind,
  tagFilters,
  filtered,
  hint,
  onKind: _onKind,
  onTagFilters,
  allPickedMessage,
}: PickerProps) {
  // The KindSegment lives in the page header (shown whenever the picker
  // has rows), so it isn't rendered here.
  void _kind;
  void _onKind;

  if (rows.length === 0 && allPickedMessage !== null) {
    return <p className="text-body text-muted">{allPickedMessage}</p>;
  }

  return (
    <>
      <TagFilterBar
        tags={allTags}
        filters={tagFilters}
        onChange={onTagFilters}
      />
      <p
        role="status"
        aria-live="polite"
        className="pb-sm text-meta text-muted"
      >
        {hint}
      </p>
      {filtered.length === 0 ? (
        <p className="text-body text-muted">No Options match this filter.</p>
      ) : (
        <ol className="flex flex-col">
          {filtered.map((row, index) => (
            <TonightRow key={row.option.id} row={row} rank={index + 1} />
          ))}
        </ol>
      )}
    </>
  );
}
