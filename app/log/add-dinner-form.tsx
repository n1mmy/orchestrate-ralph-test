"use client";

import { useState, useTransition } from "react";
import { logForDate } from "./actions";
import type { LogOptionChoice } from "@/db/queries";

/**
 * The "+ Add a dinner" form on the Log screen. Backed by
 * `logForDate(optionId, eatenOn, note?)` — a past date backfills a forgotten
 * Dinner, a future date is a Planned dinner. A `(option_id, eaten_on)`
 * collision surfaces the inline "Already logged for that date" with the form
 * inputs preserved (per §17).
 *
 * The form starts collapsed as a single "+ Add a dinner" toggle so it does
 * not eat real estate when the Household is just reading the Log. Tapping it
 * expands the form in place with the Option, date, and note fields.
 */
export function AddDinnerForm({
  optionChoices,
  todaySql,
}: {
  optionChoices: LogOptionChoice[];
  todaySql: string;
}) {
  const [open, setOpen] = useState(false);
  const [optionId, setOptionId] = useState(optionChoices[0]?.id ?? "");
  const [eatenOn, setEatenOn] = useState(todaySql);
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-meta text-muted underline"
      >
        + Add a dinner
      </button>
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
      // Reset and collapse.
      setOptionId(optionChoices[0]?.id ?? "");
      setEatenOn(todaySql);
      setNote("");
      setOpen(false);
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
          className="rounded-control bg-action px-md py-xs text-meta text-action-ink disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-control border border-line bg-surface px-md py-xs text-meta"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
