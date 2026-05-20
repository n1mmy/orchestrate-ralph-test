import Link from "next/link";

import { CAP } from "@/lib/ranking.config";
import type { TonightRow as TonightRowData } from "@/lib/ranking";
import {
  recencyChipBg,
  recencyChipBgStrong,
} from "@/lib/recency-color";

import { kindBarClass } from "./kind-bar";
import { PickButton } from "./pick-button";

type Props = {
  row: TonightRowData;
  rank: number;
  /** When true (Log screen) the Recency chip + Pick button are hidden. */
  variant?: "tonight" | "log";
};

function recencyLabel(row: TonightRowData): string {
  if (row.neverEaten) return "new";
  if (row.recencyDays >= CAP) return `${CAP}d+`;
  return `${row.recencyDays}d`;
}

function tagRecencyLabel(days: number, neverEaten: boolean): string {
  if (neverEaten) return "new";
  if (days >= CAP) return `${CAP}d+`;
  return `${days}d`;
}

/**
 * The shared chip row: the Recency chip followed by one Tag chip per
 * Tag, with the heatmap tint from `lib/recency-color.ts`. Extracted so
 * the decided block (`TonightsDinnerBlock`) and the picker rows render
 * the same chips with no duplication.
 */
export function RowChips({ row }: { row: TonightRowData }) {
  const recencyBg = recencyChipBgStrong(row.recencyDays, CAP);
  return (
    <div className="flex flex-row flex-wrap items-center gap-xs">
      <span
        className="rounded-badge px-xs font-mono text-meta text-ink tabular"
        style={{ backgroundColor: recencyBg }}
        aria-label={`recency ${recencyLabel(row)}`}
      >
        {recencyLabel(row)}
      </span>
      {row.tags.map((tag) => {
        const bg = recencyChipBg(tag.days, CAP);
        const tagText = tagRecencyLabel(tag.days, tag.neverEaten);
        return (
          <span
            key={tag.name}
            className={`rounded-badge px-xs text-meta text-ink ${
              tag.overdue ? "font-semibold" : ""
            }`}
            style={{ backgroundColor: bg }}
            aria-label={`${tag.name} ${tagText}${
              tag.overdue ? " (overdue)" : ""
            }`}
          >
            {tag.name}{" "}
            <span className="font-mono tabular">{tagText}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * One row in the flat uniform Tonight `<ol>`. DESIGN.md §18: every row the
 * same shape, separated by a 1px `line` rule, no per-row background tint,
 * no lead-option prominence.
 */
export function TonightRow({ row, rank, variant = "tonight" }: Props) {
  return (
    <li
      className={`flex items-start gap-md py-md ${kindBarClass(
        row.option.kind,
      )} border-b border-line pl-md`}
    >
      <span className="min-w-[2ch] pt-2xs font-mono text-meta text-muted tabular">
        {rank}
      </span>
      <div className="flex flex-1 flex-col gap-xs">
        <Link
          href={`/catalog/${row.option.id}`}
          className="font-display text-name text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          {row.option.name}
        </Link>
        <RowChips row={row} />
      </div>
      {variant === "tonight" ? <PickButton optionId={row.option.id} /> : null}
    </li>
  );
}
