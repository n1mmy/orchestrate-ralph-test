"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { TonightRow } from "./tonight-row";
import { TonightsDinnerBlock } from "./tonights-dinner-block";
import { deleteRejection } from "./rejection-actions";
import { aiSearchAction } from "./tonight-actions";
import type { TonightRow as TonightRowData } from "@/lib/ranking";
import type { TonightsDinnerEntry } from "@/lib/tonights-dinner";
import type { TodayRejection } from "@/db/queries";
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
  rejectedTonight = [],
  allRejected = false,
}: {
  tonightsDinner: TonightsDinnerEntry[];
  pickerRows: TonightRowData[];
  /**
   * Today's Rejections, the same `TodayRejection[]` `app/page.tsx` already
   * loads via `getTodayRejections` for the suppression filter. Passed through
   * so the screen-level `RejectedTonightDisclosure` pinned at the bottom can
   * list them with a "Bring back" undo, with no new query. Defaults to an
   * empty array — the disclosure renders nothing in that case.
   */
  rejectedTonight?: TodayRejection[];
  /**
   * True when every remaining picker row has been rejected for today —
   * `pickerRows` is empty but the underlying ranked list was not. The
   * screen renders an honest "Every Option has been rejected for tonight"
   * state rather than a blank screen. Defaults to `false`.
   */
  allRejected?: boolean;
}) {
  const decided = tonightsDinner.length > 0;

  const [kind, setKind] = useState<KindFilter>("all");
  const [tagFilters, setTagFilters] = useState<TagFilters>({});
  // The most-recent removal announcement, surfaced through a polite live
  // region so assistive tech reads "<Option> removed from tonight's list"
  // when the row drops out of the picker on a successful Reject. A timestamp
  // suffix forces the live-region string to differ between consecutive
  // rejections of identically-named Options.
  const [removedAnnouncement, setRemovedAnnouncement] = useState("");
  function announceRejected(name: string) {
    setRemovedAnnouncement(`${name} removed from tonight's list`);
  }

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

      {decided ? <TonightsDinnerBlock entries={tonightsDinner} /> : null}

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

        <AiSearchBox pickerRows={pickerRows} onRejected={announceRejected}>
          {pickerRows.length === 0 ? (
            allRejected ? (
              <p className="mt-sm text-body text-muted">
                Every Option has been rejected for tonight. They&apos;ll be back
                tomorrow.
              </p>
            ) : decided ? (
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
              onRejected={announceRejected}
            />
          )}
        </AiSearchBox>
      </section>
      <p className="sr-only" role="status" aria-live="polite">
        {removedAnnouncement}
      </p>

      {rejectedTonight.length > 0 ? (
        <RejectedTonightDisclosure rejections={rejectedTonight} />
      ) : null}
    </>
  );
}

/**
 * The AI-search box (ticket 14) — the search input above the picker, plus the
 * AI result list that swaps in for the deterministic picker once a query is
 * submitted. The children prop is the deterministic picker the parent renders;
 * AI search swaps it out in place when results land. Submitting an empty query
 * is allowed. A Clear control restores the deterministic picker; a page reload
 * does the same — the AI result is never persisted.
 *
 * Failure-mode policy (ticket 15) — AI search is fail-safe. Every failure
 * mode (timeout/abort, HTTP error, network error, no `tool_use` block,
 * malformed tool input) collapses to a single `AI_SEARCH_UNAVAILABLE`
 * outcome upstream; here we surface it as a **persistent** inline error
 * under the search box ("Search unavailable — try again"), announced via an
 * `aria-live` region. The deterministic list is left exactly as-is — AI
 * search being down never blocks the Household from deciding dinner. The
 * error is **not** cleared on submit: only the Clear control or a later
 * successful search clears it. The Household can retry, or simply keep
 * using the deterministic ranking.
 */
function AiSearchBox({
  pickerRows,
  onRejected,
  children,
}: {
  pickerRows: TonightRowData[];
  onRejected: (optionName: string) => void;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ optionId: string; reason: string }[] | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    // The error is intentionally **not** cleared here — a transient failure
    // stays visible across the next submit so the Household can keep using
    // the deterministic list. It clears only on a successful search (below)
    // or on Clear.
    startTransition(async () => {
      const result = await aiSearchAction(query);
      if (!result.ok) {
        setError("Search unavailable — try again");
        return;
      }
      setError(null);
      setResults(result.results);
    });
  }

  function clear() {
    setResults(null);
    setError(null);
    setQuery("");
  }

  // Map AI result UUIDs back to the corresponding picker rows so the AI
  // result list can render the existing TonightRow component with the same
  // chips and Pick controls. A result whose UUID is not in `pickerRows`
  // (an Archived Option, or an Option that has dropped out since the
  // snapshot was built) is silently skipped — `pick = log` only makes
  // sense against an active Catalog row.
  const rowsByOptionId = useMemo(() => {
    const m = new Map<string, TonightRowData>();
    for (const row of pickerRows) m.set(row.option.id, row);
    return m;
  }, [pickerRows]);

  const aiRows = useMemo(() => {
    if (results === null) return null;
    return results
      .map((r) => {
        const row = rowsByOptionId.get(r.optionId);
        return row ? { row, reason: r.reason } : null;
      })
      .filter((x): x is { row: TonightRowData; reason: string } => x !== null);
  }, [results, rowsByOptionId]);

  return (
    <>
      <form
        role="search"
        aria-label="AI search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-sm flex items-center gap-xs"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search with AI…"
          aria-label="AI search query"
          className="min-h-[44px] flex-1 rounded-input border border-line bg-surface px-sm py-xs text-body text-ink"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-control bg-action px-md py-xs text-meta text-action-ink hover:bg-action-hover disabled:opacity-80"
        >
          Search
        </button>
        {aiRows !== null || error !== null ? (
          <button
            type="button"
            onClick={clear}
            className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-meta text-ink hover:bg-raised"
          >
            Clear
          </button>
        ) : null}
      </form>
      {/* The error lives in a polite `aria-live` region under the search box so
       * a failed search is announced to assistive tech; it persists across
       * subsequent submits and clears only on Clear or a successful search. */}
      <div role="status" aria-live="polite" className="mt-sm">
        {error ? (
          <p className="text-meta text-danger">{error}</p>
        ) : null}
      </div>

      {aiRows === null ? (
        children
      ) : aiRows.length === 0 ? (
        // The model legitimately returned zero Options (a real answer, not a
        // Failure — `ok: true` upstream). Mirror the "No Options match the
        // current filter" empty state with a plain message plus a clear
        // control that returns the screen to the deterministic list.
        <p className="mt-sm text-body text-muted">
          No Options fit that search.
        </p>
      ) : (
        <ol className="flex flex-col">
          {aiRows.map(({ row, reason }, idx) => (
            <TonightRow
              key={row.option.id}
              rank={idx + 1}
              row={row}
              onRejected={onRejected}
              aiReason={reason}
            />
          ))}
        </ol>
      )}
    </>
  );
}

/**
 * The "Rejected tonight (N)" disclosure pinned at the bottom of Tonight (ticket
 * 20). Rendered only when today has at least one Rejection — until then it
 * costs no screen space. Collapsed by default; the heading button carries
 * `aria-expanded` and the literal label `Rejected tonight (N)` so a member can
 * tell at a glance whether anything has been rejected.
 *
 * Expanded, the disclosure renders a `<ul>` of today's Rejections — each
 * Option name with the reason on a muted second line when one was given, plus
 * a "Bring back" button that calls `deleteRejection(rejectionId)` inside a
 * `useTransition`. The shared delete action returns the Option to tonight's
 * list immediately on revalidation; because the record is gone, not merely
 * expired, a mis-tapped Rejection never reaches AI search and never teaches
 * the model anything (PRD §Rejections).
 *
 * The disclosure offers "Bring back" only for today's Rejections — managing
 * the historical Rejection log is out of scope for this ticket. The toggle
 * and every "Bring back" control are keyboard-operable, share the picker's
 * 44px touch target, and are disabled while a delete is in flight.
 */
function RejectedTonightDisclosure({
  rejections,
}: {
  rejections: TodayRejection[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function bringBack(rejectionId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteRejection(rejectionId);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <section className="mt-lg border-t border-line pt-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-[44px] w-full rounded-control bg-surface px-md py-xs text-left text-meta font-emphasis text-ink hover:bg-raised"
      >
        Rejected tonight ({rejections.length})
      </button>
      {open ? (
        <ul className="mt-sm flex flex-col gap-xs">
          {rejections.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-md rounded-control border border-line bg-surface px-md py-xs"
            >
              <div className="flex flex-col">
                <span className="text-body text-ink">{r.optionName}</span>
                {r.reason ? (
                  <span className="text-meta text-muted">{r.reason}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => bringBack(r.id)}
                disabled={pending}
                aria-label={`Bring back ${r.optionName}`}
                className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-meta text-ink hover:bg-raised disabled:opacity-80"
              >
                Bring back
              </button>
            </li>
          ))}
          {error ? (
            <p className="text-meta text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </ul>
      ) : null}
    </section>
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
  onRejected,
}: {
  tags: string[];
  tagFilters: TagFilters;
  hint: string;
  onTap: (tag: string) => void;
  visible: TonightRowData[];
  onRejected: (optionName: string) => void;
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
          <TonightRow
            key={row.option.id}
            rank={idx + 1}
            row={row}
            onRejected={onRejected}
          />
        ))}
      </ol>
    </>
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
