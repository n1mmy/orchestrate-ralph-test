"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { deleteLogEntry, updateLogEntry } from "./actions";
import type { LogEntry, LogOptionChoice } from "@/db/queries";

/**
 * One Log entry row, with inline edit and inline-confirm delete (§17). The
 * Option name links to `/catalog/[id]` (ticket 27); the row's actions are
 * Edit and inline-confirm Delete. The per-row PickButton is a later phase
 * (per the ticket's "v1 Log rows show only the Option name and note with
 * Edit / Delete" note).
 *
 * Editing expands the row in place into a form that lets the Household
 * change the Option (a `<select>` of every Option — Active and Archived, so
 * a row already logged against an Archived Option stays selectable), the
 * date (including moving the entry between past history and Upcoming), and
 * the note. A `(option_id, eaten_on)` collision shows the inline "Already
 * logged for that date" error under the date field with input preserved.
 *
 * On a successful edit the row collapses with a quiet "Saved" in `--success`
 * (§17), held briefly so the Household sees the confirmation.
 */
const SAVED_FLASH_MS = 1400;
type Confirm = "none" | "delete";

export function LogEntryRow({
  entry,
  optionChoices,
}: {
  entry: LogEntry;
  optionChoices: LogOptionChoice[];
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>("none");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Edit-form state.
  const [optionId, setOptionId] = useState(entry.optionId);
  const [eatenOn, setEatenOn] = useState(entry.eatenOn);
  const [note, setNote] = useState(entry.note ?? "");

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
    return () => clearTimeout(t);
  }, [savedFlash]);

  function startEdit() {
    setOptionId(entry.optionId);
    setEatenOn(entry.eatenOn);
    setNote(entry.note ?? "");
    setError(null);
    setEditing(true);
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateLogEntry(entry.id, {
        optionId,
        eatenOn,
        note: note.trim() === "" ? undefined : note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      setSavedFlash(true);
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteLogEntry(entry.id);
      if (!result.ok) {
        setError(result.error);
        setConfirm("none");
      }
    });
  }

  if (editing) {
    return (
      <li className="border-b border-line py-sm">
        <form onSubmit={onSave} className="flex flex-col gap-sm">
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
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={pending}
              className="rounded-control border border-line bg-surface px-md py-xs text-meta"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2xs">
      <div className="flex items-center justify-between gap-sm">
        <div className="flex flex-col">
          <Link
            href={`/catalog/${entry.optionId}`}
            className="font-display text-name underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            {entry.option.name}
          </Link>
          {entry.note ? (
            <span className="text-meta text-muted">{entry.note}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-xs">
          {savedFlash ? (
            <span className="text-meta text-success" role="status">
              Saved
            </span>
          ) : null}
          {confirm === "none" ? (
            <>
              <RowButton onClick={startEdit}>Edit</RowButton>
              <RowButton onClick={() => setConfirm("delete")}>
                Delete
              </RowButton>
            </>
          ) : (
            <>
              <RowButton onClick={onDelete} disabled={pending} danger>
                Delete
              </RowButton>
              <RowButton
                onClick={() => setConfirm("none")}
                disabled={pending}
              >
                Cancel
              </RowButton>
            </>
          )}
        </div>
      </div>
      {error ? (
        <p className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function RowButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-sm py-xs text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50 ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      {children}
    </button>
  );
}
