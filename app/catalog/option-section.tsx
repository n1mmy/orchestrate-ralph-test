"use client";

import { useState } from "react";
import { OptionForm } from "./option-form";
import { OptionRow } from "./option-row";
import type { CatalogOption } from "@/db/queries";

/**
 * A Catalog section — "Home meals" or "Restaurants". Renders its rows and an
 * inline-expand "+ Add" button. The add form expands in place below the
 * header; identical on phone and desktop.
 */
type Props = {
  title: string;
  kind: "home" | "restaurant";
  options: CatalogOption[];
  addLabel: string;
};

export function OptionSection({ title, kind, options, addLabel }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="flex flex-col gap-sm py-md">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-name font-semibold">{title}</h2>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            {addLabel}
          </button>
        ) : null}
      </header>
      {adding ? (
        <OptionForm kind={kind} onDone={() => setAdding(false)} />
      ) : null}
      <ul className="flex flex-col">
        {options.map((option) => (
          <OptionRow key={option.id} option={option} />
        ))}
      </ul>
    </section>
  );
}
