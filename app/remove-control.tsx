"use client";

import { useState, useTransition } from "react";

import { deleteLogEntry } from "./log/actions";

type Props = {
  /** The Log entry id `deleteLogEntry` takes — `TonightsDinnerEntry.entryId`. */
  entryId: string;
  /**
   * The Option name, used only in the armed control's `aria-label` for the
   * screen-reader confirmation ("Confirm remove Pho").
   */
  optionName: string;
};

/**
 * Inline "Remove" control on a decided-block row. Reuses the existing
 * `deleteLogEntry` server action — no new mutation is introduced.
 *
 * §17 inline-confirm: first tap arms it, the armed state shows
 * "Remove · Cancel". Confirming "Remove" deletes today's Log entry for
 * that Option; `deleteLogEntry` already revalidates `/`, so the next
 * render rebuilds `splitTonight` from the remaining entries and the
 * Option reappears in the picker without further client state.
 */
export function RemoveControl({ entryId, optionName }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteLogEntry(entryId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      }
    });
  };

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2xs">
        <div className="flex flex-row items-center gap-xs">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-label={`Confirm remove ${optionName}`}
            className="min-h-11 rounded-control border border-line bg-surface px-md text-meta text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
          >
            Remove
          </button>
          <span aria-hidden className="text-muted">
            ·
          </span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="min-h-11 rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error ? <span className="text-meta text-danger">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2xs">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${optionName} from tonight's dinner`}
        className="min-h-11 rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        Remove
      </button>
      {error ? <span className="text-meta text-danger">{error}</span> : null}
    </div>
  );
}
