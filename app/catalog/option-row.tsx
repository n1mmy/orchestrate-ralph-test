"use client";

import { useState, useTransition } from "react";
import { OptionForm } from "./option-form";
import { archiveOption, deleteOption } from "./actions";
import type { CatalogOption } from "@/db/queries";

/**
 * One row in an `OptionSection`. v1 shows only the Option name and the three
 * actions — Edit, Archive, Delete — wired through the §17 inline-confirm
 * pattern: tapping Archive or Delete swaps the action cluster for an in-place
 * "Archive · Cancel" / "Delete · Cancel" confirm step (no modal, no
 * undo-toast). A failed delete (the `ON DELETE RESTRICT` translation) surfaces
 * `result.error` as an inline `text-danger` line on the row.
 *
 * Edit expands the same `OptionForm` over the row — adding and editing share
 * one component so the layout is identical.
 */
type Confirm = "none" | "archive" | "delete";

export function OptionRow({
  option,
  tagSuggestions,
}: {
  option: CatalogOption;
  tagSuggestions: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>("none");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <li className="border-b border-line py-sm">
        <OptionForm
          kind={option.kind}
          initial={option}
          tagSuggestions={tagSuggestions}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  function onArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveOption(option.id);
      if (!result.ok) setError(result.error);
      else setConfirm("none");
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteOption(option.id);
      if (!result.ok) {
        setError(result.error);
        setConfirm("none");
      }
    });
  }

  return (
    <li className="flex flex-col gap-2xs border-b border-line py-sm">
      <div className="flex items-center justify-between gap-sm">
        <span className="font-display text-name">{option.name}</span>
        <div className="flex gap-xs">
          {confirm === "none" ? (
            <>
              <RowButton onClick={() => setEditing(true)}>Edit</RowButton>
              <RowButton onClick={() => setConfirm("archive")}>
                Archive
              </RowButton>
              <RowButton onClick={() => setConfirm("delete")}>
                Delete
              </RowButton>
            </>
          ) : confirm === "archive" ? (
            <>
              <RowButton onClick={onArchive} disabled={pending} danger>
                Archive
              </RowButton>
              <RowButton onClick={() => setConfirm("none")} disabled={pending}>
                Cancel
              </RowButton>
            </>
          ) : (
            <>
              <RowButton onClick={onDelete} disabled={pending} danger>
                Delete
              </RowButton>
              <RowButton onClick={() => setConfirm("none")} disabled={pending}>
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
