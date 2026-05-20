"use client";

import { useId, useRef, useState, useTransition } from "react";

import { rejectOption } from "./rejection-actions";

type Props = {
  /** The Option to reject — passed straight to `rejectOption`. */
  optionId: string;
};

/**
 * The Tonight row's "Reject" affordance. Subordinate to the primary Pick
 * button: stacked below it, neutral surface, "Reject" wording — the
 * Household reads "Pick or Reject" with Pick clearly dominant.
 *
 * Tapping Reject inline-expands an optional-reason form (autofocused
 * text input + Submit + Cancel). Cancel records nothing. Submit calls
 * `rejectOption` inside a `useTransition`; on `{ ok: true }` the Tonight
 * page revalidates and the row drops out on its own — no client-side
 * `onRejected` callback is needed because the rejected row will not be
 * in the next render. A failure shows the inline `text-danger` message
 * without collapsing the form so the Household can retry or Cancel.
 *
 * Accessibility: the Reject button carries `aria-expanded` /
 * `aria-controls` against the form's id. The form's status updates
 * announce via the inline error's `role="alert"`.
 */
export function RejectControl({ optionId }: Props) {
  const formId = useId();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function openForm() {
    setError(null);
    setReason("");
    setRejecting(true);
  }

  function cancel() {
    setRejecting(false);
    setReason("");
    setError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectOption(optionId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Revalidation will drop the row from the next render. Reset local
      // state so a re-render that *does* keep the row (e.g. the row was
      // rejected and brought back in the same session) starts fresh.
      setRejecting(false);
      setReason("");
    });
  }

  if (!rejecting) {
    return (
      <button
        type="button"
        onClick={openForm}
        aria-expanded={false}
        aria-controls={formId}
        className="min-h-[36px] rounded-control px-sm text-meta text-muted underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        Reject
      </button>
    );
  }

  return (
    <form
      id={formId}
      onSubmit={submit}
      aria-label="Reject option"
      className="flex flex-col items-stretch gap-xs"
    >
      <input
        ref={inputRef}
        type="text"
        autoFocus
        value={reason}
        disabled={pending}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (optional)"
        aria-label="Reason (optional)"
        className="min-h-[36px] min-w-[12ch] rounded-md border border-line bg-surface px-xs text-meta text-ink"
      />
      <div className="flex flex-row gap-xs">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[36px] flex-1 rounded-control bg-action px-sm text-meta text-action-ink hover:bg-action-hover disabled:opacity-50"
        >
          {pending ? "Submitting…" : "Submit"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="min-h-[36px] flex-1 rounded-control border border-line bg-surface px-sm text-meta text-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <span role="alert" className="text-meta text-danger">
          {error}
        </span>
      ) : null}
    </form>
  );
}
