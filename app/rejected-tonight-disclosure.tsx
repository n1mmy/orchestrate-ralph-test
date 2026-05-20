"use client";

import { useId, useState, useTransition } from "react";

import type { TodayRejection } from "@/db/queries";

import { deleteRejection } from "./rejection-actions";

type Props = {
  /**
   * Today's Rejections — the `TodayRejection[]` `app/page.tsx` already
   * loads via `getTodayRejections` and passes through to the Tonight
   * screen. Empty list renders nothing.
   */
  rejectedTonight: TodayRejection[];
};

/**
 * "Rejected tonight (N)" disclosure pinned at the bottom of the Tonight
 * page — the quick-undo for a same-day Rejection.
 *
 * Collapsed by default; the heading button toggles a local `open`
 * state. Expanded, each row carries a "Bring back" button that calls
 * the shared `deleteRejection` server action (no separate
 * `bringBackRejection` — "Bring back" *is* "delete this Rejection").
 * On success Tonight revalidates and the Option returns to the picker
 * on its own.
 *
 * Only today's Rejections appear (the disclosure is the same-day
 * quick-undo, not a history manager — that surface is the Log screen
 * and the Option detail page).
 */
export function RejectedTonightDisclosure({ rejectedTonight }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (rejectedTonight.length === 0) return null;

  function bringBack(rejectionId: string) {
    setPendingId(rejectionId);
    startTransition(async () => {
      try {
        await deleteRejection(rejectionId);
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <section className="flex flex-col gap-sm border-t border-line pt-md">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        className="min-h-[44px] self-start rounded-control px-sm text-meta text-muted underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        Rejected tonight ({rejectedTonight.length})
      </button>
      {open ? (
        <ul id={listId} className="flex flex-col">
          {rejectedTonight.map((rejection) => {
            const isPending = pendingId === rejection.id;
            return (
              <li
                key={rejection.id}
                className="flex items-start justify-between gap-md border-b border-line py-sm"
              >
                <div className="flex flex-1 flex-col gap-2xs">
                  <span className="text-body text-ink">
                    {rejection.optionName}
                  </span>
                  {rejection.reason ? (
                    <span className="text-meta text-muted">
                      {rejection.reason}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => bringBack(rejection.id)}
                  className="min-h-[44px] rounded-control border border-line bg-surface px-sm text-meta text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
                >
                  {isPending ? "Bringing back…" : "Bring back"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
