"use client";

/**
 * Option detail page — Actions toolbar.
 *
 * Carries every control that makes sense for an Option (ADR-0007) so the
 * Household can act on it from the full view, not only from the screen
 * that happens to surface each control elsewhere. Each control reuses an
 * existing server action — `pickTonight` (via `PickButton`),
 * `rejectOption`, `updateOption` (via the reused `OptionForm`),
 * `archiveOption` / `unarchiveOption`, and `deleteOption`.
 *
 * Destructive flows (Archive, Delete) take the §17 inline-confirm step;
 * Un-archive is benign and runs in one tap. Edit swaps the whole
 * component for the reused `OptionForm` inline; a save revalidates
 * `/catalog/[id]` so the page refreshes in place.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveOption,
  deleteOption,
  unarchiveOption,
} from "@/app/catalog/actions";
import { OptionForm } from "@/app/catalog/option-form";
import { PickButton } from "@/app/pick-button";
import { rejectOption } from "@/app/rejection-actions";
import type { OptionDetail } from "@/db/queries";

type Mode =
  | "idle"
  | "editing"
  | "rejecting"
  | "confirm-archive"
  | "confirm-delete";

type Props = {
  option: OptionDetail;
  tagSuggestions: string[];
  placesEnabled: boolean;
  /**
   * Whether the Hard-delete rule (ADR-0001) permits deleting this Option.
   * `page.tsx` passes `optionLog.length === 0` — the control is hidden
   * rather than rendered to fail. `runDelete` still keeps an inline-error
   * guard against a Log entry being added between page load and click.
   */
  canDelete: boolean;
};

export function OptionControls({
  option,
  tagSuggestions,
  placesEnabled,
  canDelete,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pending, startTransition] = useTransition();

  if (mode === "editing") {
    return (
      <OptionForm
        kind={option.kind}
        initial={{
          id: option.id,
          name: option.name,
          url: option.url,
          notes: option.notes,
          address: option.address,
          phone: option.phone,
          mapsUrl: option.mapsUrl,
          lat: option.lat,
          lng: option.lng,
          googlePlaceId: option.googlePlaceId,
          tags: option.tags,
        }}
        onDone={() => setMode("idle")}
        tagSuggestions={tagSuggestions}
        placesEnabled={placesEnabled}
      />
    );
  }

  const runArchive = () => {
    setError(null);
    startTransition(async () => {
      const result = await archiveOption(option.id);
      if (!result.ok) {
        setError(result.error);
      }
      setMode("idle");
    });
  };

  const runUnarchive = () => {
    setError(null);
    startTransition(async () => {
      const result = await unarchiveOption(option.id);
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  const runDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteOption(option.id);
      if (!result.ok) {
        setError(result.error);
        setMode("idle");
        return;
      }
      router.push("/catalog");
    });
  };

  const runReject = () => {
    setError(null);
    startTransition(async () => {
      const result = await rejectOption(option.id, rejectReason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRejectReason("");
      setMode("idle");
    });
  };

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex flex-row flex-wrap items-center gap-sm">
        {mode === "idle" ? (
          <>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("editing");
              }}
              className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Edit
            </button>
            {option.active ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("confirm-archive");
                }}
                className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                Archive
              </button>
            ) : (
              <button
                type="button"
                onClick={runUnarchive}
                disabled={pending}
                className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
              >
                Un-archive
              </button>
            )}
            {canDelete ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("confirm-delete");
                }}
                className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setRejectReason("");
                setMode("rejecting");
              }}
              className="min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Reject
            </button>
            <div className="ml-auto">
              <PickButton optionId={option.id} />
            </div>
          </>
        ) : null}
        {mode === "confirm-archive" ? (
          <>
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
          </>
        ) : null}
        {mode === "confirm-delete" ? (
          <>
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
          </>
        ) : null}
      </div>
      {mode === "rejecting" ? (
        <form
          className="flex flex-col gap-sm py-sm"
          onSubmit={(event) => {
            event.preventDefault();
            runReject();
          }}
        >
          <label className="flex flex-col gap-2xs text-meta text-muted">
            Reason (optional)
            <input
              type="text"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              autoFocus
              className="min-h-[44px] rounded-control border border-line bg-surface px-md text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            />
          </label>
          <div className="flex flex-row gap-sm">
            <button
              type="submit"
              disabled={pending}
              className="min-h-[44px] rounded-control bg-action px-lg text-body text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
            >
              Submit
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              disabled={pending}
              className="min-h-[44px] rounded-control border border-line bg-surface px-lg text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {error ? <p className="text-meta text-danger">{error}</p> : null}
    </div>
  );
}
