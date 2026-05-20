"use client";

import { useState, useTransition } from "react";

import { pickTonight } from "./log/actions";

type Props = {
  optionId: string;
};

/**
 * The Tonight row's Pick button. Calls `pickTonight(optionId)` and briefly
 * flips to "Logged ✓" in `--success` for ~1600ms while revalidation
 * re-sorts the list. A second tap inside that window is a no-op because
 * `pickTonight` uses `.onConflictDoNothing()` on `(option_id, eaten_on)`.
 * A write failure surfaces inline as `text-danger` rather than a false
 * "Logged ✓".
 */
export function PickButton({ optionId }: Props) {
  const [pending, startTransition] = useTransition();
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await pickTonight(optionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLogged(true);
      setTimeout(() => setLogged(false), 1600);
    });
  };

  return (
    <div className="flex flex-col items-end gap-2xs">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-live="polite"
        className={`min-h-[44px] min-w-[64px] rounded-control px-md text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50 ${
          logged
            ? "bg-success text-action-ink"
            : "bg-action text-action-ink hover:bg-action-hover"
        }`}
      >
        {logged ? "Logged ✓" : "Pick"}
      </button>
      {error ? <span className="text-meta text-danger">{error}</span> : null}
    </div>
  );
}
