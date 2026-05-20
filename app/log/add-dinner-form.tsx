"use client";

import { useState, useTransition } from "react";

import type { SelectableOption } from "@/db/queries";

import { logForDate } from "./actions";

type Props = {
  options: SelectableOption[];
  today: string;
};

/**
 * "+ Add a dinner" inline form on the Log screen. Backs `logForDate` for
 * a deliberately chosen date — past backfill or future Planned dinner.
 * A `(option, date)` collision is a real typed mistake, so the unique-
 * conflict ("Already logged for that date") surfaces inline with the
 * user's input preserved.
 */
export function AddDinnerForm({ options, today }: Props) {
  const [open, setOpen] = useState(false);
  const [optionId, setOptionId] = useState(options[0]?.id ?? "");
  const [eatenOn, setEatenOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setOptionId(options[0]?.id ?? "");
    setEatenOn(today);
    setNote("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await logForDate(optionId, eatenOn, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] self-start rounded-control border border-line bg-surface px-lg text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        + Add a dinner
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-sm border-b border-line py-md"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-2xs text-meta text-muted">
        Option
        <select
          value={optionId}
          onChange={(event) => setOptionId(event.target.value)}
          className="min-h-[44px] rounded-input border border-line bg-surface px-sm text-body text-ink"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.active ? "" : " (archived)"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2xs text-meta text-muted">
        Date
        <input
          type="date"
          value={eatenOn}
          onChange={(event) => setEatenOn(event.target.value)}
          className="min-h-[44px] rounded-input border border-line bg-surface px-sm text-body text-ink"
        />
      </label>
      <label className="flex flex-col gap-2xs text-meta text-muted">
        Note
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="min-h-[44px] rounded-input border border-line bg-surface px-sm text-body text-ink"
        />
      </label>
      {error ? <p className="text-meta text-danger">{error}</p> : null}
      <div className="flex flex-row gap-sm">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-control bg-action px-lg text-body text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
          className="min-h-[44px] rounded-control border border-line bg-surface px-lg text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
