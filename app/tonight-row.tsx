import Link from "next/link";
import { kindBarClass } from "./kind-bar";
import { PickButton } from "./pick-button";
import { RejectControl } from "./reject-control";
import { recencyChipBg, recencyChipBgStrong } from "@/lib/recency-color";
import { CAP } from "@/lib/ranking.config";
import type { TagRecency, TonightRow as TonightRowData } from "@/lib/ranking";

/**
 * One row in the Tonight ranked list. Renders the rank number (Geist Mono),
 * the 3px meal-kind left bar, the Option name as a `next/link` to
 * `/catalog/[id]` (ticket 27), the Recency chip, the per-Tag chips, and the
 * real "Pick" button (`PickButton`), which calls
 * `pickTonight(optionId)`; on success Tonight switches into decided mode
 * (the Option lands in the "Tonight's dinner" panel above the picker) —
 * that transition is the confirmation of a successful Pick.
 *
 * The row's right edge stacks the primary `PickButton` above a secondary,
 * low-emphasis `RejectControl` (ticket 19). The two-step Reject → Submit
 * on `RejectControl` keeps Pick the obvious primary action and the
 * mis-tap guard built-in. `onRejected` is the row's hook for the live
 * region "removed" announcement on the parent list.
 *
 * The Tonight ledger is a **flat, uniform list** (DESIGN.md / PRD §18): every
 * row the same shape, separated by a 1px `line` rule. No lead-option
 * prominence, no collapsed long tail, no per-row background tint. The single
 * concession to colour is the two channels — the meal-kind left bar and the
 * recency-heatmap chip fills — both held in their own modules
 * (`lib/recency-color.ts`, `app/kind-bar.ts`).
 */
export function TonightRow({
  rank,
  row,
  onRejected,
  aiReason,
}: {
  rank: number;
  row: TonightRowData;
  onRejected?: (optionName: string) => void;
  /**
   * The AI rationale on an AI-search result row (ticket 14). When set to a
   * non-empty string, the row renders the rationale on a neutral `raised`
   * surface beneath the chip row — the chip row itself stays for continuity.
   * `undefined` (the default) is the deterministic-list path. An
   * **empty-string** `aiReason` (ticket 16) is the pithy-tail signal — the
   * model judged this an obviously bad pick and deliberately returned no
   * rationale; the row must render with no rationale line at all, reading
   * exactly like a deterministic row.
   */
  aiReason?: string;
}) {
  const { option, recencyDays, neverEaten, tags } = row;
  return (
    <li
      className={`flex items-start gap-md border-b border-line py-md pl-sm ${kindBarClass(
        option.kind,
      )}`}
    >
      <span className="font-mono text-meta text-muted tabular-nums w-[2ch] text-right pt-xs">
        {rank}
      </span>
      <div className="flex flex-1 flex-col gap-2xs">
        <Link
          href={`/catalog/${option.id}`}
          className="font-display text-name underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          {option.name}
        </Link>
        <RowChips
          recencyDays={recencyDays}
          neverEaten={neverEaten}
          tags={tags}
        />
        {typeof aiReason === "string" && aiReason.length > 0 ? (
          <p className="mt-xs rounded-control bg-raised px-sm py-xs text-meta text-ink">
            {aiReason}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-xs">
        <PickButton optionId={option.id} />
        <RejectControl
          optionId={option.id}
          optionName={option.name}
          onRejected={() => onRejected?.(option.name)}
        />
      </div>
    </li>
  );
}

/**
 * The shared chip row — the Recency chip followed by one Tag chip per Tag —
 * rendered identically on a picker row (`TonightRow`) and on a decided row
 * (`DecidedRow` in `tonights-dinner-block.tsx`). DESIGN.md has no
 * Explanation chip; the Recency chip and Tag chips together carry the
 * numbers behind the Score. Exported so the decided block reuses this exact
 * markup rather than diverging into a parallel chip row.
 */
export function RowChips({
  recencyDays,
  neverEaten,
  tags,
}: {
  recencyDays: number;
  neverEaten: boolean;
  tags: TagRecency[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-xs">
      <RecencyChip recencyDays={recencyDays} neverEaten={neverEaten} />
      {tags.map((t) => (
        <TagChip key={t.tag} tag={t.tag} days={t.days} />
      ))}
    </div>
  );
}

/**
 * The Recency chip — the Option's own per-Option recency. Reads `Nd` (`5d`),
 * `60d+` at the CAP ceiling, or the literal `new` when the Option has never
 * been eaten. Background uses the **strong** chip-bg fill so the anti-repeat
 * signal sits louder on the row than the variety Tag chips around it.
 */
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

/**
 * A per-Tag chip — the Tag name plus its own per-Tag recency. Renders only
 * when the Option carries Tags. Uses the **fainter** chip-bg fill so the row
 * reads "Recency first, Tags as supporting detail". An overdue Tag (days
 * past `OVERDUE_THRESHOLD`) lands at the green end of the heatmap and reads
 * "this kind of meal is overdue".
 */
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
