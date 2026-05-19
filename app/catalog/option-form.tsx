"use client";

import { useState, useTransition } from "react";
import { TextField } from "./text-field";
import { createOption, updateOption, type OptionFormValues } from "./actions";
import type { CatalogOption } from "@/db/queries";

/**
 * The inline add/edit form. Adding expands a blank form below the section
 * header; editing expands the same form over the row. Identical layout on
 * phone and desktop — a single `.column` stack, ≥ 44px controls, visible
 * focus rings, every input with a label (§18). Blank name surfaces an inline
 * field error from the server action (§17 — "Loading / empty / blank-name
 * error / saved-in-place"). On success the server `revalidatePath("/catalog")`
 * refreshes the screen and the form's `onDone` collapses it back in place.
 */
type Props = {
  kind: "home" | "restaurant";
  initial?: CatalogOption;
  onDone: () => void;
};

export function OptionForm({ kind, initial, onDone }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values: OptionFormValues = {
      name: String(formData.get("name") ?? ""),
      url: optional(formData.get("url")),
      notes: optional(formData.get("notes")),
      address: optional(formData.get("address")),
      phone: optional(formData.get("phone")),
      mapsUrl: optional(formData.get("mapsUrl")),
      lat: optional(formData.get("lat")),
      lng: optional(formData.get("lng")),
      googlePlaceId: optional(formData.get("googlePlaceId")),
    };
    startTransition(async () => {
      const result = initial
        ? await updateOption(initial.id, kind, values)
        : await createOption(kind, values);
      if (result.ok) {
        setError(null);
        onDone();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-sm border border-line bg-surface p-md"
    >
      <TextField
        label="Name"
        name="name"
        defaultValue={initial?.name}
        required
        autoFocus
        error={error ?? undefined}
      />
      <TextField
        label={kind === "home" ? "Recipe link (optional)" : "Website or menu link"}
        name="url"
        type="url"
        inputMode="url"
        defaultValue={initial?.url ?? undefined}
      />
      {kind === "home" ? (
        <TextField
          label="Notes"
          name="notes"
          defaultValue={initial?.notes ?? undefined}
          multiline
        />
      ) : (
        <>
          <TextField
            label="Address"
            name="address"
            defaultValue={initial?.address ?? undefined}
          />
          <TextField
            label="Phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={initial?.phone ?? undefined}
          />
          <TextField
            label="Maps link"
            name="mapsUrl"
            type="url"
            inputMode="url"
            defaultValue={initial?.mapsUrl ?? undefined}
          />
          <TextField
            label="Latitude"
            name="lat"
            inputMode="decimal"
            defaultValue={initial?.lat?.toString() ?? undefined}
          />
          <TextField
            label="Longitude"
            name="lng"
            inputMode="decimal"
            defaultValue={initial?.lng?.toString() ?? undefined}
          />
          <TextField
            label="Google Place ID"
            name="googlePlaceId"
            defaultValue={initial?.googlePlaceId ?? undefined}
          />
        </>
      )}
      <div className="flex gap-sm">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-control bg-action px-md py-xs text-body font-semibold text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50"
        >
          {initial ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function optional(value: FormDataEntryValue | null): string | undefined {
  if (value === null) return undefined;
  return typeof value === "string" ? value : undefined;
}
