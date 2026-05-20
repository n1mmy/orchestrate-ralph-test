"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { TonightRow as TonightRowData } from "@/lib/ranking";
import {
  type KindFilter,
  type TagFilters,
  distinctTags,
  filterHint,
  filterTonightRows,
} from "@/lib/tonight-filter";

import { KindSegment } from "./kind-segment";
import { TagFilterBar } from "./tag-filter-bar";
import { TonightRow } from "./tonight-row";

type Props = {
  rows: TonightRowData[];
};

/**
 * Tonight screen — the home screen. A flat uniform `<ol>` ranked by Score
 * (computed upstream by `lib/ranking.ts`), with the All/Home/Restaurant
 * `KindSegment` in the header and a sticky tri-state Tag filter zone
 * above the list. Empty Catalog prompts the Household to add a meal.
 *
 * Decided-mode (Tonight's dinner) and the action buttons / Remove control
 * are ticket 08 — this screen is the picker base.
 */
export function TonightScreen({ rows }: Props) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [tagFilters, setTagFilters] = useState<TagFilters>({});

  const allTags = useMemo(() => distinctTags(rows), [rows]);
  const filtered = useMemo(
    () => filterTonightRows(rows, kind, tagFilters),
    [rows, kind, tagFilters],
  );
  const hint = filterHint(kind, tagFilters);

  if (rows.length === 0) {
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
      <header className="flex flex-row items-center justify-between gap-md py-lg">
        <h1 className="font-display text-h1 text-ink">Tonight</h1>
        <KindSegment value={kind} onChange={setKind} />
      </header>
      <TagFilterBar tags={allTags} filters={tagFilters} onChange={setTagFilters} />
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
    </main>
  );
}
