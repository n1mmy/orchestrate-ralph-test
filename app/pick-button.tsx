"use client";

import { useState, useTransition } from "react";
import { pickTonight } from "./log/actions";

/**
 * The one-tap "Pick" button rendered on every Tonight row. Calls
 * `pickTonight(optionId)` and on success briefly flips to "Logged ✓" in
 * `--success` (held ~1600ms) while the action's `revalidatePath("/")` re-sorts
 * the list under it. A failed write surfaces `result.error` inline as
 * `text-danger` next to the button — the button is never falsely flashed.
 *
 * The button itself is the charcoal `action` fill per DESIGN.md so it never
 * collides with the green end of the recency heatmap.
 */
const SUCCESS_FLASH_MS = 1600;

export function PickButton({ optionId }: { optionId: string }) {
  const [pending, startTransition] = useTransition();
  const [justLogged, setJustLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await pickTonight(optionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJustLogged(true);
      setTimeout(() => setJustLogged(false), SUCCESS_FLASH_MS);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2xs">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || justLogged}
        aria-label="Pick"
        className={`rounded-control px-md py-xs text-meta disabled:opacity-80 ${
          justLogged
            ? "bg-success text-action-ink"
            : "bg-action text-action-ink hover:bg-action-hover"
        }`}
      >
        {justLogged ? "Logged ✓" : "Pick"}
      </button>
      {error ? (
        <p className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
