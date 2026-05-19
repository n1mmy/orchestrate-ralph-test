"use client";

import { useRef, useState, useTransition } from "react";
import { TagInput } from "./tag-input";
import { TextField } from "./text-field";
import { createOption, updateOption, type OptionFormValues } from "./actions";
import { PlacesSearchBox } from "./places-search-box";
import type { AutofillFields } from "./places-box";
import type { CatalogOption } from "@/db/queries";

/**
 * The inline add/edit form. Adding expands a blank form below the section
 * header; editing expands the same form over the row. Identical layout on
 * phone and desktop — a single `.column` stack, ≥ 44px controls, visible
 * focus rings, every input with a label (§18). Blank name surfaces an inline
 * field error from the server action (§17 — "Loading / empty / blank-name
 * error / saved-in-place"). On success the server `revalidatePath("/catalog")`
 * refreshes the screen and the form's `onDone` collapses it back in place.
 *
 * The `TagInput` autocomplete token input lives between the kind-specific
 * fields and the form's submit row — there is no separate Tags-management
 * screen, so this is the only place a Household creates or changes a Tag.
 * Tag tokens flow into the form's state and are submitted alongside the
 * Option's columns; the server action re-normalizes before any DB write.
 *
 * On a Restaurant form, the optional `PlacesSearchBox` sits above the
 * kind-specific fields. The parent (`page.tsx`) decides whether to render
 * the box by reading `placesEnabled()` server-side and passing the boolean
 * through `OptionSection`. When `GOOGLE_PLACES_API_KEY` is unset the box is
 * not rendered at all and the form degrades cleanly to plain manual entry.
 *
 * Selecting a Place autofills the eight Restaurant fields via
 * `applyAutofill`. **One nuance: an already-filled `url` is kept** — a
 * hand-picked menu link beats the Place's generic website, so the form flags
 * a `urlKept` notice instead of clobbering it. Every autofilled field stays
 * editable.
 */
type Props = {
  kind: "home" | "restaurant";
  initial?: CatalogOption;
  /** Every Tag name in the Catalog — drives the `TagInput` autocomplete. */
  tagSuggestions: string[];
  /** Whether to render the `PlacesSearchBox` on a Restaurant form. */
  placesEnabled?: boolean;
  onDone: () => void;
};

export function OptionForm({
  kind,
  initial,
  tagSuggestions,
  placesEnabled = false,
  onDone,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tagValue, setTagValue] = useState<string[]>(initial?.tags ?? []);

  // Controlled state for the seven autofillable Restaurant fields plus the
  // shared `name` / `url`. Editing is direct; autofill overwrites by setting
  // these states. The `key` trick (`fieldKey`) forces the underlying
  // uncontrolled `TextField` inputs to re-mount with the new `defaultValue`
  // when an autofill arrives — keeps the `TextField` primitive simple.
  const [autofill, setAutofill] = useState<AutofillFields | null>(null);
  const [urlKept, setUrlKept] = useState(false);

  function applyAutofill(fields: AutofillFields) {
    // An already-filled `url` is kept — a hand-picked menu link beats the
    // Place's generic website. Read the live form value at apply-time so a
    // user-typed url between mounting and autofill still wins.
    const form = currentForm.current;
    const liveUrl =
      form === null
        ? ""
        : String(
            (new FormData(form).get("url") as FormDataEntryValue | null) ?? "",
          ).trim();
    const keepUrl = liveUrl !== "";
    setAutofill({
      ...fields,
      url: keepUrl ? liveUrl : fields.url,
    });
    setUrlKept(keepUrl && fields.url !== "" && fields.url !== liveUrl);
  }

  // A ref to the live `<form>` element, so `applyAutofill` can read the
  // current `url` field value at the moment the user picks a Place.
  const currentForm = useFormRef();

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
      tags: tagValue,
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

  // The autofill defaults override the `initial` defaults when an autofill
  // has happened; otherwise the original `initial?.*` values flow through.
  const nameDefault = autofill?.name ?? initial?.name;
  const urlDefault = autofill?.url ?? initial?.url ?? undefined;
  const addressDefault = autofill?.address ?? initial?.address ?? undefined;
  const phoneDefault = autofill?.phone ?? initial?.phone ?? undefined;
  const mapsUrlDefault = autofill?.mapsUrl ?? initial?.mapsUrl ?? undefined;
  const latDefault =
    autofill?.lat ?? (initial?.lat?.toString() ?? undefined);
  const lngDefault =
    autofill?.lng ?? (initial?.lng?.toString() ?? undefined);
  const googlePlaceIdDefault =
    autofill?.googlePlaceId ?? initial?.googlePlaceId ?? undefined;

  // Bump the field-key whenever an autofill happens so the uncontrolled
  // `TextField` inputs remount with the new `defaultValue`. Using the
  // autofill object identity as the key is enough — every `applyAutofill`
  // produces a fresh object.
  const fieldKey = autofill ? "autofilled" : "initial";

  return (
    <form
      ref={currentForm}
      onSubmit={handleSubmit}
      className="flex flex-col gap-sm border border-line bg-surface p-md"
    >
      {kind === "restaurant" && placesEnabled ? (
        <PlacesSearchBox onAutofill={applyAutofill} />
      ) : null}
      {urlKept ? (
        <p role="status" className="text-meta text-muted">
          Kept your existing link
        </p>
      ) : null}
      <TextField
        key={`name-${fieldKey}`}
        label="Name"
        name="name"
        defaultValue={nameDefault}
        required
        autoFocus
        error={error ?? undefined}
      />
      <TextField
        key={`url-${fieldKey}`}
        label={kind === "home" ? "Recipe link (optional)" : "Website or menu link"}
        name="url"
        type="url"
        inputMode="url"
        defaultValue={urlDefault}
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
            key={`address-${fieldKey}`}
            label="Address"
            name="address"
            defaultValue={addressDefault}
          />
          <TextField
            key={`phone-${fieldKey}`}
            label="Phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={phoneDefault}
          />
          <TextField
            key={`mapsUrl-${fieldKey}`}
            label="Maps link"
            name="mapsUrl"
            type="url"
            inputMode="url"
            defaultValue={mapsUrlDefault}
          />
          <TextField
            key={`lat-${fieldKey}`}
            label="Latitude"
            name="lat"
            inputMode="decimal"
            defaultValue={latDefault}
          />
          <TextField
            key={`lng-${fieldKey}`}
            label="Longitude"
            name="lng"
            inputMode="decimal"
            defaultValue={lngDefault}
          />
          <TextField
            key={`googlePlaceId-${fieldKey}`}
            label="Google Place ID"
            name="googlePlaceId"
            defaultValue={googlePlaceIdDefault}
          />
        </>
      )}
      <TagInput
        value={tagValue}
        suggestions={tagSuggestions}
        onChange={setTagValue}
      />
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

function useFormRef() {
  return useRef<HTMLFormElement | null>(null);
}
