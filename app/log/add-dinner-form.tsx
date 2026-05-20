"use client";

import { useState, useTransition } from "react";
import { logForDate } from "./actions";
import type { LogOptionChoice } from "@/db/queries";

/**
 * The "+ Add a dinner" inline form. The Log screen renders it twice — once
 * from `TopAddControls` at the top with `defaultDate` set to today, and again
 * inside each `DayGroup` with the date pre-filled to that group's date so the
 * Household never re-types a date it is already looking at. Backed by
 * `logForDate(optionId, eatenOn, note?)` — a past date backfills a forgotten
 * Dinner, a future date is a Planned dinner. A `(option_id, eaten_on)`
 * collision surfaces the inline "Already logged for that date" with the form
 * inputs preserved (per §17).
 *
 * The caller owns whether the form is shown — this component is the form
 * body itself, with its own `Cancel` button wired to `onCancel` and a
 * `onSaved` callback the caller uses to close it on success.
 */
export function AddDinnerForm({
  optionChoices,
  defaultDate,
  onCancel,
  onSaved,
}: {
  optionChoices: LogOptionChoice[];
  defaultDate: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [optionId, setOptionId] = useState(optionChoices[0]?.id ?? "");
  const [eatenOn, setEatenOn] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (optionChoices.length === 0) {
    return (
      <p className="text-meta text-muted">
        Add an Option to the Catalog first → /catalog
      </p>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await logForDate(
        optionId,
        eatenOn,
        note.trim() === "" ? undefined : note,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-sm">
      <label className="flex flex-col gap-2xs text-meta">
        Option
        <select
          value={optionId}
          onChange={(e) => setOptionId(e.target.value)}
          className="rounded-input border border-line bg-raised px-sm py-xs text-body"
        >
          {optionChoices.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
              {opt.active ? "" : " (archived)"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2xs text-meta">
        Date
        <input
          type="date"
          value={eatenOn}
          onChange={(e) => setEatenOn(e.target.value)}
          className="rounded-input border border-line bg-raised px-sm py-xs text-body"
        />
        {error ? (
          <span className="text-meta text-danger" role="alert">
            {error}
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-2xs text-meta">
        Note (optional)
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-input border border-line bg-raised px-sm py-xs text-body"
        />
      </label>
      <div className="flex gap-xs">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-control bg-action px-md py-xs text-meta text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="min-h-11 rounded-control border border-line bg-surface px-md py-xs text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
