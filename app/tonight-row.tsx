import { kindBarClass } from "./kind-bar";
import { PickButton } from "./pick-button";
import { recencyChipBg, recencyChipBgStrong } from "@/lib/recency-color";
import { CAP } from "@/lib/ranking.config";
import type { TonightRow as TonightRowData } from "@/lib/ranking";

/**
 * One row in the Tonight ranked list. Renders the rank number (Geist Mono),
 * the 3px meal-kind left bar, the Option name as plain text (not yet a link
 * to `/catalog/[id]` — that comes in a later phase), the Recency chip, the
 * per-Tag chips, and the real "Pick" button (`PickButton`), which calls
 * `pickTonight(optionId)`; on success Tonight switches into decided mode
 * (the Option lands in the "Tonight's dinner" panel above the picker) —
 * that transition is the confirmation of a successful Pick.
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
}: {
  rank: number;
  row: TonightRowData;
}) {
  const { option, recencyDays, neverEaten, tags } = row;
  return (
    <li
      className={`flex items-center gap-md border-b border-line py-md pl-sm ${kindBarClass(
        option.kind,
      )}`}
    >
      <span className="font-mono text-meta text-muted tabular-nums w-[2ch] text-right">
        {rank}
      </span>
      <div className="flex flex-1 flex-col gap-2xs">
        <span className="font-display text-name">{option.name}</span>
        <div className="flex flex-wrap items-center gap-xs">
          <RecencyChip recencyDays={recencyDays} neverEaten={neverEaten} />
          {tags.map((t) => (
            <TagChip key={t.tag} tag={t.tag} days={t.days} />
          ))}
        </div>
      </div>
      <PickButton optionId={option.id} />
    </li>
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
