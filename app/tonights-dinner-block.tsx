import Link from "next/link";
import { kindBarClass } from "./kind-bar";
import { RemoveControl } from "./remove-control";
import { RowChips } from "./tonight-row";
import {
  type DecidedAction,
  type TonightsDinnerEntry,
  decidedActions,
} from "@/lib/tonights-dinner";

/**
 * The "Tonight's dinner" decided block — the calm, action-oriented panel
 * that replaces the picker once the Household has Picked at least one
 * Option. Renders the `<section aria-label="Tonight's dinner">` from
 * ticket 11 as a `<ul>` of decided rows, one per `TonightsDinnerEntry`,
 * keyed by `entryId`.
 *
 * Each row is a `DecidedRow`:
 *
 * - Option name as a `<Link>` to its detail page (`/catalog/[id]`);
 * - a `RemoveControl` on the row's right edge beside the Option name —
 *   the §17 inline-confirm that deletes today's Log entry for the Option
 *   via the existing `deleteLogEntry` server action (ticket 13);
 * - the shared `RowChips` from `tonight-row.tsx` (Recency chip + Tag chips,
 *   no Explanation chip — none exists in the shipped app);
 * - the 3px meal-kind left bar (`kindBarClass`) plus a light kind-tinted
 *   wash background (`bg-kind-home-wash` / `bg-kind-restaurant-wash`) so
 *   the decided area reads as a distinct settled panel above the picker;
 * - the action buttons returned by `decidedActions(option)` — "Menu" /
 *   "Call" on a Restaurant, "Recipe" on a Home meal.
 */
export function TonightsDinnerBlock({
  entries,
}: {
  entries: TonightsDinnerEntry[];
}) {
  return (
    <section aria-label="Tonight's dinner" className="pt-sm">
      <h2 className="text-meta font-emphasis uppercase tracking-wide text-muted">
        Tonight&apos;s dinner
      </h2>
      <ul className="mt-xs flex flex-col gap-xs">
        {entries.map((entry) => (
          <DecidedRow key={entry.entryId} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

/**
 * One row inside the **Tonight's dinner** panel. Unlike the flat picker
 * ledger, each decided row carries a light wash of its meal-kind hue
 * (`kind-home-wash` / `kind-restaurant-wash`) as its background, so the
 * decided area reads as a distinct settled panel — DESIGN.md "Decided
 * block". The row also carries the 3px meal-kind left bar, the Option name
 * as a `<Link>` to `/catalog/[id]`, and the chips taken from `decidedRows`
 * (recency as it stood **before** tonight's Pick).
 *
 * Below the chip row sits the action row — `decidedActions(option)`
 * collapses the kind / `url` / `phone` decision into a `DecidedAction[]`,
 * and `DecidedActionButton` renders each one as a `<Link>` with a focus
 * ring and a `min-h-11` touch target so the buttons are keyboard-operable
 * and meet the 44×44px touch-target minimum.
 */
function DecidedRow({ entry }: { entry: TonightsDinnerEntry }) {
  const { row, entryId } = entry;
  const { option, recencyDays, neverEaten, tags } = row;
  const wash =
    option.kind === "home" ? "bg-kind-home-wash" : "bg-kind-restaurant-wash";
  const actions = decidedActions(option);
  return (
    <li
      className={`flex flex-col gap-sm rounded-input py-md pl-sm pr-md ${wash} ${kindBarClass(
        option.kind,
      )}`}
    >
      <div className="flex flex-col gap-2xs">
        <div className="flex items-start justify-between gap-sm">
          <Link
            href={`/catalog/${option.id}`}
            className="font-display text-name underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            {option.name}
          </Link>
          <RemoveControl entryId={entryId} optionName={option.name} />
        </div>
        <RowChips
          recencyDays={recencyDays}
          neverEaten={neverEaten}
          tags={tags}
        />
      </div>
      {actions.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-xs"
          role="group"
          aria-label={`Actions for ${option.name}`}
        >
          {actions.map((action) => (
            <DecidedActionButton key={action.label} action={action} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

/**
 * One action button on a decided row. "Menu" and "Recipe" open the Option's
 * `url` in a new tab with `rel="noopener noreferrer"` so the destination
 * cannot reach back into our window; "Call" is a `tel:` link and opens in
 * place (no `target="_blank"` — the OS handles the dial intent). Plain
 * `<a>` semantics so the keyboard works out of the box: `Tab` reaches it,
 * `Enter` activates it, and the explicit `focus-visible` ring keeps the
 * focus visible against the kind wash behind it. `min-h-11` plus the
 * horizontal padding meets the 44×44px touch-target minimum on a phone.
 */
function DecidedActionButton({ action }: { action: DecidedAction }) {
  const isCall = action.label === "Call";
  const external = !isCall;
  return (
    <a
      href={action.href}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-surface px-md text-body text-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      {action.label}
    </a>
  );
}
