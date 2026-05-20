"use client";

import Link from "next/link";
import { useState } from "react";
import type { ArchivedOption } from "@/db/queries";

/**
 * The Catalog's collapsed **"Archived (N)" disclosure** — pinned at the
 * bottom of the screen after Home meals and Restaurants. Mirrors Tonight's
 * "Rejected tonight" pattern: collapsed by default, a heading button with
 * `aria-expanded` and the literal label `Archived (N)`, and an expanded
 * `<ul>` of links into each Option's `/catalog/[id]` detail page.
 *
 * Rendered only when something is Archived (`archived.length > 0`) — until
 * then the disclosure costs no screen space and the active Catalog reads
 * exactly as before. Restoring an Archived Option happens on its detail page
 * (the **Un-archive** toggle in `OptionControls`); this disclosure is just
 * the way back in.
 */
export function ArchivedDisclosure({
  archived,
}: {
  archived: ArchivedOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-lg border-t border-line pt-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-[44px] w-full rounded-control bg-surface px-md py-xs text-left text-meta font-emphasis text-ink hover:bg-raised"
      >
        Archived ({archived.length})
      </button>
      {open ? (
        <ul className="mt-sm flex flex-col gap-xs">
          {archived.map((o) => (
            <li
              key={o.id}
              className="flex items-start justify-between gap-md rounded-control border border-line bg-surface px-md py-xs"
            >
              <Link
                href={`/catalog/${o.id}`}
                className="min-h-[44px] flex-1 text-body text-ink underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
