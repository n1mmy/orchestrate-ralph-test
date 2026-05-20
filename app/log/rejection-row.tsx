"use client";

/**
 * Shared Rejection-row UI — the inline add form and the per-row display +
 * edit + delete affordance the Log screen and the Option detail page both
 * render. One file so a Rejection is added, edited, and deleted identically
 * wherever it appears (ADR-0007 — every sensible control wherever it makes
 * sense).
 *
 * Three exports:
 *
 *   - `RejectionForm` — the shared internal form body (Option select, date,
 *     optional reason, configurable submit label, Cancel).
 *
 *   - `AddRejectionForm` — the top-of-Log + per-DayGroup add form. Calls
 *     `createRejection`; `onSaved` only on `result.ok`.
 *
 *   - `RejectionRow` — one Rejection row: linked Option name + reason,
 *     Edit (expands inline into `RejectionForm` → `updateRejection`),
 *     Delete (§17 inline-confirm → `deleteRejection`). Every Rejection is
 *     editable and deletable regardless of age.
 */
import Link from "next/link";
import { useState, useTransition } from "react";

import { kindBarClass } from "@/app/kind-bar";
import {
  createRejection,
  deleteRejection,
  updateRejection,
} from "@/app/rejection-actions";
import type { LogRejectionRow, OptionChoice } from "@/db/queries";

type RejectionFormProps = {
  optionChoices: OptionChoice[];
  initialOptionId: string;
  initialDate: string;
  initialReason: string;
  submitLabel: string;
  onSubmit: (values: {
    optionId: string;
    rejectedOn: string;
    reason: string | null;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
  onSaved: () => void;
};

const INVALID_DATE_MESSAGE = "Pick a valid date";

/**
 * Internal form body shared by add + edit. Splits the Option `<select>`
 * into "Home meals" / "Restaurants" optgroups so the Household always
 * sees the kind they're picking from.
 */
function RejectionForm({
  optionChoices,
  initialOptionId,
  initialDate,
  initialReason,
  submitLabel,
  onSubmit,
  onCancel,
  onSaved,
}: RejectionFormProps) {
  const [optionId, setOptionId] = useState(initialOptionId);
  const [rejectedOn, setRejectedOn] = useState(initialDate);
  const [reason, setReason] = useState(initialReason);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const home = optionChoices.filter((o) => o.kind === "home");
  const restaurants = optionChoices.filter((o) => o.kind === "restaurant");

  const submit = () => {
    setError(null);
    if (rejectedOn === "") {
      setError(INVALID_DATE_MESSAGE);
      return;
    }
    startTransition(async () => {
      const result = await onSubmit({
        optionId,
        rejectedOn,
        reason: reason === "" ? null : reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  };

  return (
    <form
      className="flex flex-col gap-sm py-md"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-2xs text-meta text-muted">
        Option
        <select
          value={optionId}
          onChange={(event) => setOptionId(event.target.value)}
          className="min-h-[44px] rounded-input border border-line bg-surface px-sm text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          {home.length > 0 ? (
            <optgroup label="Home meals">
              {home.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {restaurants.length > 0 ? (
            <optgroup label="Restaurants">
              {restaurants.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>
      <label className="flex flex-col gap-2xs text-meta text-muted">
        Date
        <input
          type="date"
          value={rejectedOn}
          onChange={(event) => setRejectedOn(event.target.value)}
          className="min-h-[44px] rounded-input border border-line bg-surface px-sm text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        />
      </label>
      <label className="flex flex-col gap-2xs text-meta text-muted">
        Reason (optional)
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-[44px] rounded-input border border-line bg-surface px-sm text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        />
      </label>
      {error ? (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-row gap-sm">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-control bg-action px-lg text-body text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="min-h-[44px] rounded-control border border-line bg-surface px-lg text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

type AddRejectionFormProps = {
  optionChoices: OptionChoice[];
  defaultDate: string;
  onCancel: () => void;
  onSaved: () => void;
};

/**
 * Top-of-Log + per-DayGroup add form. Calls `createRejection`; `onSaved`
 * fires only on `result.ok`. Defaults its Option to the first choice and
 * its date to `defaultDate` (today on the top control; the group's date
 * on a per-DayGroup control).
 */
export function AddRejectionForm({
  optionChoices,
  defaultDate,
  onCancel,
  onSaved,
}: AddRejectionFormProps) {
  return (
    <RejectionForm
      optionChoices={optionChoices}
      initialOptionId={optionChoices[0]?.id ?? ""}
      initialDate={defaultDate}
      initialReason=""
      submitLabel="Add"
      onCancel={onCancel}
      onSaved={onSaved}
      onSubmit={async ({ optionId, rejectedOn, reason }) =>
        createRejection(optionId, rejectedOn, reason)
      }
    />
  );
}

type RejectionRowProps = {
  rejection: LogRejectionRow;
  optionChoices: OptionChoice[];
};

type Mode = "idle" | "editing" | "confirm-delete";

/**
 * One Rejection row. Shows the "Rejected" meta label, the Option name
 * linked to `/catalog/[optionId]`, and the optional reason. Edit expands
 * the row into the shared `RejectionForm` (Option, date, reason →
 * `updateRejection`); Delete uses the §17 inline-confirm and calls
 * `deleteRejection`. A saved edit collapses with a brief "Saved"
 * `aria-live` note; a failed delete shows an inline error.
 *
 * Every Rejection is editable and deletable regardless of age — past,
 * today, or future.
 */
export function RejectionRow({ rejection, optionChoices }: RejectionRowProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pending, startTransition] = useTransition();

  const onDelete = () => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteRejection(rejection.id);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Couldn't delete — try again",
        );
        setMode("idle");
      }
    });
  };

  if (mode === "editing") {
    return (
      <li
        className={`flex flex-col border-b border-line pl-md ${kindBarClass(
          rejection.kind,
        )}`}
      >
        <RejectionForm
          optionChoices={optionChoices}
          initialOptionId={rejection.optionId}
          initialDate={rejection.rejectedOn}
          initialReason={rejection.reason ?? ""}
          submitLabel="Save"
          onCancel={() => {
            setError(null);
            setMode("idle");
          }}
          onSaved={() => {
            setMode("idle");
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1600);
          }}
          onSubmit={async ({ optionId, rejectedOn, reason }) =>
            updateRejection(rejection.id, {
              optionId,
              rejectedOn,
              reason,
            })
          }
        />
      </li>
    );
  }

  return (
    <li
      className={`flex flex-col gap-2xs border-b border-line py-md pl-md ${kindBarClass(
        rejection.kind,
      )}`}
    >
      <div className="flex flex-row items-center justify-between gap-md">
        <div className="flex flex-col gap-2xs">
          <span className="text-meta uppercase tracking-wider text-muted">
            Rejected
          </span>
          <Link
            href={`/catalog/${rejection.optionId}`}
            className="font-display text-name text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            {rejection.optionName}
          </Link>
        </div>
        {mode === "idle" ? (
          <div className="flex flex-row gap-sm">
            {savedFlash ? (
              <span
                role="status"
                aria-live="polite"
                className="self-center text-meta text-success"
              >
                Saved
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("editing");
              }}
              className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("confirm-delete");
              }}
              className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Delete
            </button>
          </div>
        ) : null}
        {mode === "confirm-delete" ? (
          <div className="flex flex-row gap-sm">
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
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
              className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
      {rejection.reason ? (
        <p className="text-meta text-muted">{rejection.reason}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}
