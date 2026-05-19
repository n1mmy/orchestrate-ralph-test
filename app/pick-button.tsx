"use client";

import { useState, useTransition } from "react";
import { pickTonight } from "./log/actions";

/**
 * The one-tap "Pick" button rendered on every Tonight row. Calls
 * `pickTonight(optionId)`; on success the page revalidates and Tonight
 * transitions into **decided mode** — the row lands in the "Tonight's dinner"
 * panel above the picker. That transition is the confirmation of a
 * successful Pick (replacing the prior 1.6-second "Logged ✓" flash on this
 * button). A failed write still surfaces `result.error` inline as
 * `text-danger` next to the button so the Household sees the failure.
 *
 * The button itself is the charcoal `action` fill per DESIGN.md so it never
 * collides with the green end of the recency heatmap.
 */
export function PickButton({ optionId }: { optionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await pickTonight(optionId);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2xs">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label="Pick"
        className="rounded-control bg-action px-md py-xs text-meta text-action-ink hover:bg-action-hover disabled:opacity-80"
      >
        Pick
      </button>
      {error ? (
        <p className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
