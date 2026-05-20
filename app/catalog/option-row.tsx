"use client";

import { useState, useTransition } from "react";

import { archiveOption, deleteOption } from "./actions";
import { OptionForm } from "./option-form";
import type { CatalogRow } from "@/db/queries";

type Mode = "idle" | "editing" | "confirm-archive" | "confirm-delete";

type Props = {
  row: CatalogRow;
  tagSuggestions: string[];
};

/**
 * One row in an OptionSection. Renders just the Option name in v1, plus the
 * Edit / Archive / Delete action cluster. Destructive actions follow the
 * §17 inline-confirm pattern — tapping "Archive" or "Delete" swaps the
 * cluster for an in-place "Archive · Cancel" / "Delete · Cancel" confirm
 * step. No modal, no undo-toast. A failed delete (Option has Log history)
 * surfaces the friendly inline message returned by the server action.
 */
export function OptionRow({ row, tagSuggestions }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (mode === "editing") {
    return (
      <li className="border-b border-line py-md">
        <OptionForm
          kind={row.kind}
          initial={{
            id: row.id,
            name: row.name,
            url: row.url,
            notes: row.notes,
            address: row.address,
            phone: row.phone,
            mapsUrl: row.mapsUrl,
            lat: row.lat,
            lng: row.lng,
            googlePlaceId: row.googlePlaceId,
            tags: row.tags,
          }}
          onDone={() => setMode("idle")}
          tagSuggestions={tagSuggestions}
        />
      </li>
    );
  }

  const runArchive = () => {
    setError(null);
    startTransition(async () => {
      const result = await archiveOption(row.id);
      if (!result.ok) {
        setError(result.error);
        setMode("idle");
      } else {
        setMode("idle");
      }
    });
  };

  const runDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteOption(row.id);
      if (!result.ok) {
        setError(result.error);
        setMode("idle");
      } else {
        setMode("idle");
      }
    });
  };

  return (
    <li className="flex flex-col gap-xs border-b border-line py-md">
      <div className="flex flex-row items-center justify-between gap-md">
        <span className="font-display text-name text-ink">{row.name}</span>
        {mode === "idle" ? (
          <div className="flex flex-row gap-sm">
            <button
              type="button"
              onClick={() => setMode("editing")}
              className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("confirm-archive")}
              className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => setMode("confirm-delete")}
              className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Delete
            </button>
          </div>
        ) : null}
        {mode === "confirm-archive" ? (
          <div className="flex flex-row gap-sm">
            <button
              type="button"
              onClick={runArchive}
              disabled={pending}
              className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
            >
              Archive
            </button>
            <span aria-hidden className="self-center text-muted">
              ·
            </span>
            <button
              type="button"
              onClick={() => setMode("idle")}
              disabled={pending}
              className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : null}
        {mode === "confirm-delete" ? (
          <div className="flex flex-row gap-sm">
            <button
              type="button"
              onClick={runDelete}
              disabled={pending}
              className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
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
              className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="text-meta text-danger">{error}</p> : null}
    </li>
  );
}
