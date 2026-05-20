"use client";

import { useState, useTransition } from "react";
import { deleteLogEntry } from "./log/actions";

/**
 * The inline "Remove" control on a Picked Option in the **Tonight's dinner**
 * decided block. One tap arms it; once armed it shows a danger-styled
 * confirming "Remove" plus a "Cancel" (separated by a quiet `·`), the §17
 * inline-confirm pattern the Log screen's Delete already uses — no modal, no
 * undo toast.
 *
 * Confirming "Remove" calls the existing `deleteLogEntry` server action with
 * the today Log entry id (`entry.entryId` on the row's `TonightsDinnerEntry`).
 * `deleteLogEntry` revalidates Tonight, so on the next render the server
 * recomputes `splitTonight` from the remaining Log entries: the removed
 * Option drops out of the decided block and reappears in the picker. There is
 * no post-delete cleanup here — `RemoveControl` simply unmounts with its row.
 *
 * Removing the last Option in Tonight's dinner leaves `tonightsDinner` empty,
 * so `TonightScreen` renders picker mode again on its own — the same
 * server-side mode logic from ticket 11, with no special-casing.
 *
 * Buttons are keyboard-operable (a real `<button>` so Tab/Enter/Space work
 * out of the box), carry a visible `focus-visible` ring against the kind
 * wash, and meet the 44×44px touch-target minimum via `min-h-11`/`min-w-11`.
 */
export function RemoveControl({
  entryId,
  optionName,
}: {
  entryId: string;
  optionName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function onRemove() {
    startTransition(async () => {
      await deleteLogEntry(entryId);
      // No post-delete cleanup: revalidatePath("/") on the server drops this
      // row from the decided block and unmounts the component with it.
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${optionName} from Tonight's dinner`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line bg-surface px-sm py-xs text-meta text-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        Remove
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-xs">
      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        aria-label={`Confirm remove ${optionName} from Tonight's dinner`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line bg-surface px-sm py-xs text-meta text-danger hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-50"
      >
        Remove
      </button>
      <span aria-hidden="true" className="text-meta text-muted">
        ·
      </span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line bg-surface px-sm py-xs text-meta text-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  );
}
