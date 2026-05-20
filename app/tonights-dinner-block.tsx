import Link from "next/link";

import { decidedActions, type TonightsDinnerEntry } from "@/lib/tonights-dinner";

import { kindBarClass } from "./kind-bar";
import { RemoveControl } from "./remove-control";
import { RowChips } from "./tonight-row";

type Props = {
  entries: TonightsDinnerEntry[];
};

/**
 * The "Tonight's dinner" decided block — a `<ul>` of `DecidedRow`s, one
 * per Picked Option, in Pick order (oldest first). Wrapped in a
 * `<section aria-label="Tonight's dinner">` with a quiet uppercase `<h2>`
 * sub-label; the page's `<h1>` "Tonight" heading sits above.
 */
export function TonightsDinnerBlock({ entries }: Props) {
  return (
    <section aria-label="Tonight's dinner" className="flex flex-col gap-sm py-md">
      <h2 className="text-meta font-semibold uppercase tracking-wider text-muted">
        Tonight&apos;s dinner
      </h2>
      <ul className="flex flex-col gap-sm">
        {entries.map((entry) => (
          <DecidedRow key={entry.entryId} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function washClass(kind: "home" | "restaurant"): string {
  return kind === "home" ? "bg-kind-home-wash" : "bg-kind-restaurant-wash";
}

/**
 * One row in the decided block. Carries the 3px meal-kind left bar plus
 * a light kind-tinted wash background, so the decided area reads as a
 * distinct, settled panel above the picker. The Option name links to
 * `/catalog/[id]` (the detail page ships in ticket 13; the link is wired
 * now so it activates on its own).
 */
function DecidedRow({ entry }: { entry: TonightsDinnerEntry }) {
  const { row } = entry;
  const actions = decidedActions(row.option);

  return (
    <li
      className={`flex flex-col gap-xs rounded-control py-md pl-md pr-sm ${kindBarClass(
        row.option.kind,
      )} ${washClass(row.option.kind)}`}
    >
      <div className="flex flex-row items-start justify-between gap-md">
        <Link
          href={`/catalog/${row.option.id}`}
          className="font-display text-name text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          {row.option.name}
        </Link>
        <RemoveControl entryId={entry.entryId} optionName={row.option.name} />
      </div>
      <RowChips row={row} />
      {actions.length > 0 ? (
        <div className="flex flex-row flex-wrap items-center gap-sm pt-2xs">
          {actions.map((action) => {
            // `tel:` links open in place; web links open in a new tab.
            const isTel = action.href.startsWith("tel:");
            const target = isTel ? undefined : "_blank";
            const rel = isTel ? undefined : "noopener noreferrer";
            return (
              <a
                key={action.label}
                href={action.href}
                target={target}
                rel={rel}
                className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                {action.label}
              </a>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}
