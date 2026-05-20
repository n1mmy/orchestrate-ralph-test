"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

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
import { aiSearchAction } from "./tonight-actions";

type Props = {
  /** The picker rows — rows from the live ranking that are not yet Picked. */
  pickerRows: TonightRowData[];
  /** The decided block — today's Picks in oldest-first order. */
  tonightsDinner: TonightsDinnerEntry[];
  /**
   * True when `ANTHROPIC_API_KEY` is set on the server. When false the AI
   * search box is hidden entirely — the screen is exactly v1.
   */
  searchEnabled: boolean;
};

/** A single AI-search result hit — UUID + AI rationale. */
type AiSearchHitDto = { optionId: string; reason: string };

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
 * AI search adds a third overlay — when the Household submits a query
 * the deterministic list is swapped for the AI result in place. The
 * mode is client-only state and any reload restores the deterministic
 * list; the AI result is never persisted.
 */
export function TonightScreen({
  pickerRows,
  tonightsDinner,
  searchEnabled,
}: Props) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [tagFilters, setTagFilters] = useState<TagFilters>({});

  // AI search state — all client-only.
  const [aiHits, setAiHits] = useState<AiSearchHitDto[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState<string>("");
  const [submittedQuery, setSubmittedQuery] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const decided = tonightsDinner.length > 0;
  const aiActive = aiHits !== null;

  const allTags = useMemo(() => distinctTags(pickerRows), [pickerRows]);
  const filtered = useMemo(
    () => filterTonightRows(pickerRows, kind, tagFilters),
    [pickerRows, kind, tagFilters],
  );
  const hint = filterHint(kind, tagFilters);

  // Build the row-by-id map once per render so the AI result can pull rows
  // from the live picker set without losing each Option's Recency/Tag chips.
  const rowsById = useMemo(() => {
    const map = new Map<string, TonightRowData>();
    for (const row of pickerRows) map.set(row.option.id, row);
    return map;
  }, [pickerRows]);

  const aiRows = useMemo(() => {
    if (aiHits === null) return [];
    return aiHits
      .map((hit) => {
        const row = rowsById.get(hit.optionId);
        if (!row) return null;
        return { row, reason: hit.reason };
      })
      .filter((x): x is { row: TonightRowData; reason: string } => x !== null);
  }, [aiHits, rowsById]);

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

  function runSearch(query: string) {
    setSubmittedQuery(query);
    startTransition(async () => {
      const result = await aiSearchAction(query);
      if (result.ok) {
        setAiHits(result.hits);
        setAiError(null);
      } else {
        // Failure — leave the deterministic list intact and show the
        // persistent inline error. `aiHits` stays untouched.
        setAiError("Search unavailable — try again");
      }
    });
  }

  function clearSearch() {
    setAiHits(null);
    setAiError(null);
    setAiQuery("");
    setSubmittedQuery("");
  }

  const screenStatus = decided
    ? "Tonight's dinner is decided."
    : "Choosing tonight's dinner.";

  const liveAnnouncement = pending
    ? "Searching…"
    : aiActive
      ? aiRows.length === 0
        ? "No Options fit that search."
        : "Showing AI search result."
      : aiError !== null
        ? aiError
        : "Showing the deterministic ranking.";

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
      <span role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </span>
      <header className="flex flex-row items-center justify-between gap-md py-lg">
        <h1 className="font-display text-h1 text-ink">Tonight</h1>
        {pickerRows.length > 0 && !aiActive ? (
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
            onTagFilters={setTagFilters}
            allPickedMessage="Every Option is already on tonight's dinner."
            aiActive={aiActive}
            aiPending={pending}
            aiQuery={aiQuery}
            aiError={aiError}
            aiRows={aiRows}
            searchEnabled={searchEnabled}
            submittedQuery={submittedQuery}
            onAiQuery={setAiQuery}
            onSubmitSearch={runSearch}
            onClearSearch={clearSearch}
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
          onTagFilters={setTagFilters}
          allPickedMessage={null}
          aiActive={aiActive}
          aiPending={pending}
          aiQuery={aiQuery}
          aiError={aiError}
          aiRows={aiRows}
          searchEnabled={searchEnabled}
          submittedQuery={submittedQuery}
          onAiQuery={setAiQuery}
          onSubmitSearch={runSearch}
          onClearSearch={clearSearch}
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
  onTagFilters: (filters: TagFilters) => void;
  /**
   * What to render when the picker has no rows (every Option Picked).
   * `null` falls back to the base-screen "empty Catalog" prompt — only
   * possible in picker mode, where the page already special-cases above.
   */
  allPickedMessage: string | null;
  aiActive: boolean;
  aiPending: boolean;
  aiQuery: string;
  aiError: string | null;
  aiRows: Array<{ row: TonightRowData; reason: string }>;
  searchEnabled: boolean;
  submittedQuery: string;
  onAiQuery: (q: string) => void;
  onSubmitSearch: (q: string) => void;
  onClearSearch: () => void;
};

function Picker({
  rows,
  allTags,
  kind: _kind,
  tagFilters,
  filtered,
  hint,
  onTagFilters,
  allPickedMessage,
  aiActive,
  aiPending,
  aiQuery,
  aiError,
  aiRows,
  searchEnabled,
  submittedQuery,
  onAiQuery,
  onSubmitSearch,
  onClearSearch,
}: PickerProps) {
  void _kind;

  if (rows.length === 0 && allPickedMessage !== null) {
    return <p className="text-body text-muted">{allPickedMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-sm">
      {searchEnabled && rows.length > 0 ? (
        <form
          className="flex flex-col gap-xs"
          onSubmit={(event) => {
            event.preventDefault();
            if (aiPending) return;
            onSubmitSearch(aiQuery);
          }}
        >
          <div className="flex flex-row gap-xs">
            <input
              type="search"
              aria-label="Search Options"
              placeholder="Search Options…"
              value={aiQuery}
              disabled={aiPending}
              onChange={(event) => onAiQuery(event.target.value)}
              className="min-h-[44px] flex-1 rounded-md border border-line bg-surface px-sm text-body text-ink"
            />
            <button
              type="submit"
              disabled={aiPending}
              className="min-h-[44px] min-w-[44px] rounded-md border border-line bg-raised px-sm text-body text-ink disabled:opacity-50"
            >
              {aiPending ? "Searching…" : "Search"}
            </button>
            {aiActive || submittedQuery !== "" || aiError !== null ? (
              <button
                type="button"
                onClick={onClearSearch}
                className="min-h-[44px] min-w-[44px] rounded-md border border-line bg-surface px-sm text-body text-ink"
              >
                Clear
              </button>
            ) : null}
          </div>
          {aiError !== null ? (
            <p className="text-meta text-danger" role="alert">
              {aiError}
            </p>
          ) : null}
        </form>
      ) : null}

      {aiActive ? (
        aiRows.length === 0 ? (
          <p className="text-body text-muted">
            No Options fit that search.{" "}
            <button
              type="button"
              className="underline text-ink"
              onClick={onClearSearch}
            >
              Clear
            </button>
          </p>
        ) : (
          <ol className="flex flex-col">
            {aiRows.map(({ row, reason }, index) => (
              <TonightRow
                key={row.option.id}
                row={row}
                rank={index + 1}
                aiReason={reason}
              />
            ))}
          </ol>
        )
      ) : (
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
      )}
    </div>
  );
}
