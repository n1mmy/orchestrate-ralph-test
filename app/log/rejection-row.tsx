"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  createRejection,
  deleteRejection,
  updateRejection,
} from "../rejection-actions";
import type {
  LogOptionChoice,
  LogRejectionRow,
  OptionChoice,
} from "@/db/queries";

/**
 * The shape of an Option choice the `RejectionForm` body's `<select>` knows
 * how to render. The Rejection-edit path on `RejectionRow` passes
 * `LogOptionChoice` (carrying `active` so the form suffixes an Archived
 * Option's name with " (archived)"); the new `AddRejectionForm` accepts the
 * leaner `OptionChoice` the Log page loads (no `active` field, since the
 * add-form does not render an "Archived" badge today).
 */
type RejectionOptionChoice = LogOptionChoice | OptionChoice;

/**
 * One Rejection row, with inline edit and inline-confirm delete (§17). The
 * shared row component the Log screen (ticket 32) and the Option detail page
 * (this ticket, 24) both consume so a Rejection is added, edited, and deleted
 * identically wherever it appears.
 *
 * The row shows a quiet "Rejected" meta label, the Option name linked to its
 * detail page, and the optional reason as a quiet line below. A Rejection with
 * no reason renders cleanly without one. The row carries no date of its own —
 * both consumers group Rejections under a `formatDinnerDate` date header.
 *
 * Editing expands the row in place into the shared rejection form (Option,
 * date, reason → `updateRejection`); Delete uses the §17 inline-confirm and
 * calls `deleteRejection`. Because `updateRejection` and `deleteRejection`
 * revalidate `/catalog/[id]` (and `/`, `/log`) the page refreshes in place
 * after either write.
 *
 * A saved edit collapses with a brief "Saved" `aria-live` note; a failed write
 * surfaces inline under the date field with `role="alert"`, never flashed as
 * success.
 */
const SAVED_FLASH_MS = 1400;
type Confirm = "none" | "delete";

export function RejectionRow({
  rejection,
  optionChoices,
}: {
  rejection: LogRejectionRow;
  optionChoices: RejectionOptionChoice[];
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>("none");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
    return () => clearTimeout(t);
  }, [savedFlash]);

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRejection(rejection.id);
      if (!result.ok) {
        setError(result.error);
        setConfirm("none");
      }
    });
  }

  if (editing) {
    return (
      <li className="border-b border-line py-sm">
        <RejectionForm
          initialOptionId={rejection.optionId}
          initialRejectedOn={rejection.rejectedOn}
          initialReason={rejection.reason ?? ""}
          optionChoices={optionChoices}
          submitLabel="Save"
          pendingLabel="Saving…"
          onSubmit={async (values) => updateRejection(rejection.id, values)}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
          onSaved={() => {
            setEditing(false);
            setSavedFlash(true);
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2xs">
      <div className="flex items-center justify-between gap-sm">
        <div className="flex flex-col">
          <span className="text-meta uppercase tracking-wide text-muted">
            Rejected
          </span>
          <Link
            href={`/catalog/${rejection.optionId}`}
            className="font-display text-name underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action hover:underline"
          >
            {rejection.optionName}
          </Link>
          {rejection.reason ? (
            <span className="text-meta text-muted">{rejection.reason}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-xs">
          {savedFlash ? (
            <span className="text-meta text-success" role="status">
              Saved
            </span>
          ) : null}
          {confirm === "none" ? (
            <>
              <RowButton onClick={() => setEditing(true)}>Edit</RowButton>
              <RowButton onClick={() => setConfirm("delete")}>
                Delete
              </RowButton>
            </>
          ) : (
            <>
              <RowButton onClick={onDelete} disabled={pending} danger>
                Delete
              </RowButton>
              <RowButton
                onClick={() => setConfirm("none")}
                disabled={pending}
              >
                Cancel
              </RowButton>
            </>
          )}
        </div>
      </div>
      {error ? (
        <p className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * The shared rejection-form body. Backs both the inline edit form on
 * `RejectionRow` and (later, in ticket 32) the top-of-Log "+ Add a rejection"
 * form. An Option `<select>` (Active + Archived, so an Archived Option's
 * Rejection stays editable), a `type="date"` input, an optional reason text
 * field, and Submit / Cancel buttons. The caller passes the submit label, the
 * submit handler (an `updateRejection` / `createRejection` call), and a
 * post-success callback. A failed write shows the action's `error` inline
 * under the date with `role="alert"`; a saved write fires `onSaved` and the
 * caller closes the form.
 */
export function RejectionForm({
  initialOptionId,
  initialRejectedOn,
  initialReason,
  optionChoices,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
  onSaved,
}: {
  initialOptionId: string;
  initialRejectedOn: string;
  initialReason: string;
  optionChoices: RejectionOptionChoice[];
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (values: {
    optionId: string;
    rejectedOn: string;
    reason?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [optionId, setOptionId] = useState(initialOptionId);
  const [rejectedOn, setRejectedOn] = useState(initialRejectedOn);
  const [reason, setReason] = useState(initialReason);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({
        optionId,
        rejectedOn,
        reason: reason.trim() === "" ? undefined : reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-sm">
      <label className="flex flex-col gap-2xs text-meta">
        Option
        <select
          value={optionId}
          onChange={(e) => setOptionId(e.target.value)}
          className="rounded-input border border-line bg-raised px-sm py-xs text-body"
        >
          <optgroup label="Home meals">
            {optionChoices
              .filter((opt) => opt.kind === "home")
              .map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                  {"active" in opt && !opt.active ? " (archived)" : ""}
                </option>
              ))}
          </optgroup>
          <optgroup label="Restaurants">
            {optionChoices
              .filter((opt) => opt.kind === "restaurant")
              .map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                  {"active" in opt && !opt.active ? " (archived)" : ""}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      <label className="flex flex-col gap-2xs text-meta">
        Date
        <input
          type="date"
          value={rejectedOn}
          onChange={(e) => setRejectedOn(e.target.value)}
          className="rounded-input border border-line bg-raised px-sm py-xs text-body"
        />
        {error ? (
          <span className="text-meta text-danger" role="alert">
            {error}
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-2xs text-meta">
        Reason (optional)
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-input border border-line bg-raised px-sm py-xs text-body"
        />
      </label>
      <div className="flex gap-xs">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-action px-md py-xs text-meta text-action-ink disabled:opacity-60"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-control border border-line bg-surface px-md py-xs text-meta"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * The "+ Add a rejection" inline form. The Log screen renders it twice — once
 * from `TopAddControls` at the top with `defaultDate` set to today, and again
 * inside each `DayGroup` with the date pre-filled to that group's date so the
 * Household never re-types a date it is already looking at. Backed by
 * `createRejection`; `onSaved` fires only when the action returns `ok`, and
 * the caller closes the form. A duplicate `(option_id, rejected_on)` or a
 * stale Option surfaces as the action's inline `error` under the date field
 * (`role="alert"`) — never flashed as success.
 *
 * Suppression of an Option from Tonight when a Rejection's date is today
 * falls out of the date rule with no new client code: `createRejection`
 * revalidates `/`, so the Tonight list refreshes after the write.
 */
export function AddRejectionForm({
  optionChoices,
  defaultDate,
  onCancel,
  onSaved,
}: {
  optionChoices: OptionChoice[];
  defaultDate: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initialOptionId = optionChoices[0]?.id ?? "";
  if (initialOptionId === "") {
    return (
      <p className="text-meta text-muted">
        Add an Option to the Catalog first → /catalog
      </p>
    );
  }
  return (
    <RejectionForm
      initialOptionId={initialOptionId}
      initialRejectedOn={defaultDate}
      initialReason=""
      optionChoices={optionChoices}
      submitLabel="Add"
      pendingLabel="Saving…"
      onSubmit={async (values) =>
        createRejection(values.optionId, values.rejectedOn, values.reason)
      }
      onCancel={onCancel}
      onSaved={onSaved}
    />
  );
}

function RowButton({
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
