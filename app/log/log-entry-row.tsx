"use client";

import { useState, useTransition } from "react";

import type { LogEntry, SelectableOption } from "@/db/queries";
import { kindBarClass } from "@/app/kind-bar";

import { deleteLogEntry, updateLogEntry } from "./actions";

type Props = {
  entry: LogEntry;
  options: SelectableOption[];
};

type Mode = "idle" | "editing" | "confirm-delete";

/**
 * One Log entry row. Renders the Option name as plain text (no
 * `/catalog/[id]` link — that's a later phase). Inline edit reuses an
 * `<select>` of every Option (Active and Archived), the date picker, and
 * a free-text note. Delete uses the §17 inline-confirm pattern.
 */
export function LogEntryRow({ entry, options }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [optionId, setOptionId] = useState(entry.option.id);
  const [eatenOn, setEatenOn] = useState(entry.eatenOn);
  const [note, setNote] = useState(entry.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setOptionId(entry.option.id);
    setEatenOn(entry.eatenOn);
    setNote(entry.note ?? "");
    setError(null);
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateLogEntry(entry.id, {
        optionId,
        eatenOn,
        note: note === "" ? null : note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("idle");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      const result = await deleteLogEntry(entry.id);
      if (!result.ok) {
        setError(result.error);
        setMode("idle");
      }
    });
  };

  const selectedKind =
    options.find((o) => o.id === optionId)?.kind ?? entry.option.kind;

  if (mode === "editing") {
    return (
      <li
        className={`flex flex-col gap-sm border-b border-line py-md pl-md ${kindBarClass(
          selectedKind,
        )}`}
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
            type="button"
            onClick={onSave}
            disabled={pending}
            className="min-h-[44px] rounded-control bg-action px-lg text-body text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setMode("idle");
            }}
            disabled={pending}
            className="min-h-[44px] rounded-control border border-line bg-surface px-lg text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex flex-col gap-2xs border-b border-line py-md pl-md ${kindBarClass(
        entry.option.kind,
      )}`}
    >
      <div className="flex flex-row items-center justify-between gap-md">
        <span className="font-display text-name text-ink">
          {entry.option.name}
          {entry.option.active ? "" : " (archived)"}
        </span>
        {mode === "idle" ? (
          <div className="flex flex-row gap-sm">
            {savedFlash ? (
              <span
                role="status"
                aria-live="polite"
                className="self-center text-meta text-success"
              >
                Saved
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setMode("editing")}
              className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("confirm-delete")}
              className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Delete
            </button>
          </div>
        ) : null}
        {mode === "confirm-delete" ? (
          <div className="flex flex-row gap-sm">
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
            >
              Delete
            </button>
            <span aria-hidden className="self-center text-muted">
              ·
            </span>
            <button
              type="button"
              onClick={() => setMode("idle")}
              disabled={pending}
              className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
      {entry.note ? (
        <p className="text-meta text-muted">{entry.note}</p>
      ) : null}
      {error ? <p className="text-meta text-danger">{error}</p> : null}
    </li>
  );
}
