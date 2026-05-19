"use client";

import { useId, useState, useTransition } from "react";
import { rejectOption } from "./rejection-actions";

/**
 * The Reject control on a Tonight row — secondary and low-emphasis,
 * visually subordinate to the primary `PickButton` (the one-tap
 * `pick = log` action stays the obvious primary). Tapping Reject toggles a
 * local `rejecting` state that inline-expands a reason **form** on the row
 * — not a modal. The two-step (Reject → Submit) is itself the mis-tap
 * guard; there is no separate post-submit undo on the row (the
 * disclosure's "Bring back" covers mistakes — ticket 20).
 *
 * The Reject button carries `aria-expanded` / `aria-controls` tied to the
 * form's id. Submit calls `rejectOption(option.id, reason)` inside a
 * `useTransition`; on `{ ok: true }` it invokes the optional `onRejected`
 * callback (which drives the list's live-region "removed" announcement)
 * and the row drops out on revalidation. Cancel collapses the box and
 * clears the reason with nothing recorded. A write that returns
 * `{ ok: false }` surfaces the error inline on the row rather than
 * silently dropping it.
 */
export function RejectControl({
  optionId,
  optionName,
  onRejected,
}: {
  optionId: string;
  optionName: string;
  onRejected?: () => void;
}) {
  const formId = useId();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    setError(null);
    setRejecting(true);
  }

  function cancel() {
    // Cancel collapses the box and clears the reason with nothing recorded.
    setRejecting(false);
    setReason("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await rejectOption(optionId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRejecting(false);
      setReason("");
      onRejected?.();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2xs">
      <button
        type="button"
        onClick={rejecting ? cancel : openForm}
        aria-expanded={rejecting}
        aria-controls={formId}
        aria-label={`Reject ${optionName}`}
        className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-meta text-muted hover:bg-raised"
      >
        Reject
      </button>
      {rejecting ? (
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col items-end gap-xs pt-xs"
        >
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            aria-label="Reason (optional)"
            autoFocus
            className="min-h-[44px] w-full rounded-input border border-line bg-surface px-sm py-xs text-meta text-ink"
          />
          <div className="flex items-center gap-xs">
            <button
              type="button"
              onClick={cancel}
              className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-meta text-ink hover:bg-raised"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="min-h-[44px] rounded-control bg-action px-md py-xs text-meta text-action-ink hover:bg-action-hover disabled:opacity-80"
            >
              Submit
            </button>
          </div>
          {error ? (
            <p className="text-meta text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
