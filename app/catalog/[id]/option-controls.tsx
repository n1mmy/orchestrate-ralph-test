"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { OptionForm } from "../option-form";
import { archiveOption, deleteOption, unarchiveOption } from "../actions";
import { rejectOption } from "../../rejection-actions";
import { PickButton } from "../../pick-button";
import type { OptionDetail } from "@/db/queries";

/**
 * The "Actions" toolbar on the Option detail page (ADR-0007). Every control
 * that makes sense for an Option is gathered here — Edit, Archive, a
 * conditional Delete, Reject, and the shared `PickButton` — so the Household
 * can act on the Option from its full view, not only from the row that
 * happens to carry each control. Each control reuses an existing server
 * action: `pickTonight` (via `PickButton`), `rejectOption`, `updateOption`
 * (via the reused `OptionForm`), `archiveOption`, and `deleteOption`.
 *
 * **Edit** swaps the whole component for the reused `OptionForm` inline; a
 * save revalidates `/catalog/[id]` and the page's fields and Recency refresh
 * in place.
 *
 * **Reject** toggles an inline reason form on the row (an autofocused
 * optional-reason text input with Submit and Cancel); Submit calls
 * `rejectOption(option.id, reason)` and, on the typed `{ ok: false }`
 * collision result of a same-day Rejection already existing for this Option,
 * surfaces the error inline.
 *
 * **Archive** and **Delete** each take a §17 inline-confirm step
 * ("Archive · Cancel" / "Delete · Cancel"), matching the Catalog row. On an
 * Archived Option the Archive control becomes **Un-archive** — a one-tap
 * action that calls `unarchiveOption` directly, since restoring an Option is
 * benign enough to skip the confirm step. The Household stays on the page;
 * `revalidateCatalog()` refreshes `/catalog/[id]` so the toggle flips back to
 * **Archive** on the next render.
 *
 * **Delete** renders only when `canDelete` — `page.tsx` passes
 * `optionLog.length === 0`, since the Hard-delete rule (ADR-0001) blocks
 * deleting an Option with Log entries. `runDelete` still keeps an inline-error
 * path: between page load and the click a Log entry could be added, in which
 * case `pgErrorMessage` translates the `ON DELETE RESTRICT` violation into
 * the inline copy. A successful Delete routes back to `/catalog` since the
 * Option no longer exists; a blocked Delete shows the inline error and keeps
 * the page.
 */
type Mode = "default" | "editing" | "rejecting" | "archive" | "delete";

export function OptionControls({
  option,
  tagSuggestions,
  placesEnabled,
  canDelete,
}: {
  option: OptionDetail;
  /** Every Tag name in the Catalog — drives the `TagInput` autocomplete. */
  tagSuggestions: string[];
  /** Whether to render the `PlacesSearchBox` on a Restaurant edit form. */
  placesEnabled?: boolean;
  /**
   * `true` iff the Option has zero Log entries — the Hard-delete rule
   * (ADR-0001) blocks deleting an Option with Log entries, so the control is
   * hidden rather than shown to fail.
   */
  canDelete: boolean;
}) {
  const router = useRouter();
  const rejectFormId = useId();
  const [mode, setMode] = useState<Mode>("default");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (mode === "editing") {
    return (
      <OptionForm
        kind={option.kind}
        initial={option}
        tagSuggestions={tagSuggestions}
        placesEnabled={placesEnabled}
        onDone={() => setMode("default")}
      />
    );
  }

  function clearError() {
    setError(null);
  }

  function openReject() {
    clearError();
    setReason("");
    setMode("rejecting");
  }

  function cancelReject() {
    setReason("");
    clearError();
    setMode("default");
  }

  function submitReject() {
    clearError();
    startTransition(async () => {
      const result = await rejectOption(option.id, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReason("");
      setMode("default");
    });
  }

  function runArchive() {
    clearError();
    startTransition(async () => {
      const result = await archiveOption(option.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("default");
    });
  }

  function runUnarchive() {
    clearError();
    startTransition(async () => {
      const result = await unarchiveOption(option.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Stay on the page — `revalidateCatalog()` re-renders this view with
      // `option.active = true` and the toggle flips back to "Archive".
    });
  }

  function runDelete() {
    clearError();
    startTransition(async () => {
      const result = await deleteOption(option.id);
      if (!result.ok) {
        // A Log entry was added between page load and this click — the
        // `ON DELETE RESTRICT` violation surfaces inline; the page stays
        // on the still-existing Option.
        setError(result.error);
        setMode("default");
        return;
      }
      // The Option is gone — route back to the Catalog rather than keep the
      // page (this page would now `notFound()`).
      router.push("/catalog");
    });
  }

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-xs">
        {mode === "default" ? (
          <>
            <ToolbarButton onClick={() => setMode("editing")}>
              Edit
            </ToolbarButton>
            {option.active ? (
              <ToolbarButton onClick={() => setMode("archive")}>
                Archive
              </ToolbarButton>
            ) : (
              <ToolbarButton onClick={runUnarchive} disabled={pending}>
                Un-archive
              </ToolbarButton>
            )}
            {canDelete ? (
              <ToolbarButton onClick={() => setMode("delete")}>
                Delete
              </ToolbarButton>
            ) : null}
            <div className="ml-auto flex items-center gap-xs">
              <button
                type="button"
                onClick={openReject}
                aria-expanded={false}
                aria-controls={rejectFormId}
                aria-label={`Reject ${option.name}`}
                className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-meta text-muted hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                Reject
              </button>
              <PickButton optionId={option.id} />
            </div>
          </>
        ) : mode === "rejecting" ? (
          <>
            <ToolbarButton onClick={() => setMode("editing")} disabled>
              Edit
            </ToolbarButton>
            {option.active ? (
              <ToolbarButton onClick={() => setMode("archive")} disabled>
                Archive
              </ToolbarButton>
            ) : (
              <ToolbarButton onClick={runUnarchive} disabled>
                Un-archive
              </ToolbarButton>
            )}
            {canDelete ? (
              <ToolbarButton onClick={() => setMode("delete")} disabled>
                Delete
              </ToolbarButton>
            ) : null}
            <div className="ml-auto flex items-center gap-xs">
              <button
                type="button"
                onClick={cancelReject}
                aria-expanded={true}
                aria-controls={rejectFormId}
                aria-label={`Reject ${option.name}`}
                className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-meta text-muted hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                Reject
              </button>
              <PickButton optionId={option.id} />
            </div>
          </>
        ) : mode === "archive" ? (
          <>
            <ToolbarButton onClick={runArchive} disabled={pending} danger>
              Archive
            </ToolbarButton>
            <ToolbarButton
              onClick={() => setMode("default")}
              disabled={pending}
            >
              Cancel
            </ToolbarButton>
          </>
        ) : (
          <>
            <ToolbarButton onClick={runDelete} disabled={pending} danger>
              Delete
            </ToolbarButton>
            <ToolbarButton
              onClick={() => setMode("default")}
              disabled={pending}
            >
              Cancel
            </ToolbarButton>
          </>
        )}
      </div>
      {mode === "rejecting" ? (
        <form
          id={rejectFormId}
          onSubmit={(e) => {
            e.preventDefault();
            submitReject();
          }}
          className="flex flex-col gap-xs"
        >
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            aria-label="Reason (optional)"
            autoFocus
            className="min-h-[44px] w-full rounded-input border border-line bg-surface px-sm py-xs text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          />
          <div className="flex items-center gap-xs">
            <button
              type="submit"
              disabled={pending}
              className="min-h-[44px] rounded-control bg-action px-md py-xs text-meta text-action-ink hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-80"
            >
              Submit
            </button>
            <button
              type="button"
              onClick={cancelReject}
              disabled={pending}
              className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-meta text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[44px] min-w-[44px] rounded-control border border-line bg-surface px-sm py-xs text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50 ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      {children}
    </button>
  );
}
