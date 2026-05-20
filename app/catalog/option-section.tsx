"use client";

import { useState } from "react";

import type { OptionKind } from "./actions";
import { OptionForm } from "./option-form";
import { OptionRow } from "./option-row";
import type { CatalogRow } from "@/db/queries";

type Props = {
  title: string;
  kind: OptionKind;
  rows: CatalogRow[];
  addLabel: string;
  tagSuggestions: string[];
};

/**
 * One Catalog section — "Home meals" or "Restaurants". Renders its rows in
 * name order and exposes a per-section "+ Add a meal" / "+ Add a restaurant"
 * button that expands the OptionForm inline in place.
 */
export function OptionSection({
  title,
  kind,
  rows,
  addLabel,
  tagSuggestions,
}: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="flex flex-col gap-sm py-lg">
      <h2 className="font-display text-name text-ink">{title}</h2>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <OptionRow
            key={row.id}
            row={row}
            tagSuggestions={tagSuggestions}
          />
        ))}
      </ul>
      {adding ? (
        <OptionForm
          kind={kind}
          onDone={() => setAdding(false)}
          tagSuggestions={tagSuggestions}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="min-h-[44px] self-start rounded-control border border-line bg-surface px-md text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          {addLabel}
        </button>
      )}
    </section>
  );
}
