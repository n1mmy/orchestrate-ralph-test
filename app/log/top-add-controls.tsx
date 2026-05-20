"use client";

import { useState } from "react";
import { AddDinnerForm } from "./add-dinner-form";
import { AddRejectionForm } from "./rejection-row";
import type { LogOptionChoice, OptionChoice } from "@/db/queries";

/**
 * Two separate top-of-Log add controls — "+ Add a dinner" and
 * "+ Add a rejection" — each one direct action with no mode toggle. Each
 * opens its inline form below the buttons; the form's Cancel closes it.
 * Both default their date to `todaySql`.
 *
 * The Log screen also offers the same pair per-`DayGroup` with the date
 * pre-filled to that group's date — see `LogScreen` — so the Household never
 * re-types a date it is already looking at.
 */
type Open = "none" | "dinner" | "rejection";

export function TopAddControls({
  optionChoices,
  rejectionOptionChoices,
  todaySql,
}: {
  optionChoices: LogOptionChoice[];
  rejectionOptionChoices: OptionChoice[];
  todaySql: string;
}) {
  const [open, setOpen] = useState<Open>("none");

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex gap-xs">
        <button
          type="button"
          onClick={() => setOpen(open === "dinner" ? "none" : "dinner")}
          aria-expanded={open === "dinner"}
          className="min-h-11 rounded-control border border-line bg-surface px-md py-xs text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          + Add a dinner
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === "rejection" ? "none" : "rejection")}
          aria-expanded={open === "rejection"}
          className="min-h-11 rounded-control border border-line bg-surface px-md py-xs text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          + Add a rejection
        </button>
      </div>
      {open === "dinner" ? (
        <AddDinnerForm
          optionChoices={optionChoices}
          defaultDate={todaySql}
          onCancel={() => setOpen("none")}
          onSaved={() => setOpen("none")}
        />
      ) : null}
      {open === "rejection" ? (
        <AddRejectionForm
          optionChoices={rejectionOptionChoices}
          defaultDate={todaySql}
          onCancel={() => setOpen("none")}
          onSaved={() => setOpen("none")}
        />
      ) : null}
    </div>
  );
}
