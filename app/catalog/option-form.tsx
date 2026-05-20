"use client";

import { useId, useState, useTransition } from "react";

import {
  type OptionFormValues,
  type OptionKind,
  createOption,
  updateOption,
} from "./actions";
import type { Autofill } from "./places-box";
import { PlacesSearchBox } from "./places-search-box";
import { TagInput } from "./tag-input";
import { TextArea, TextField } from "./text-field";

export type OptionFormInitial = {
  id?: string;
  name?: string;
  url?: string | null;
  notes?: string | null;
  address?: string | null;
  phone?: string | null;
  mapsUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  tags?: string[];
};

type Props = {
  kind: OptionKind;
  initial?: OptionFormInitial;
  onDone: () => void;
  tagSuggestions: string[];
  /**
   * Whether the server-side `GOOGLE_PLACES_API_KEY` is set. When false the
   * `PlacesSearchBox` is not rendered at all so the form degrades to plain
   * manual entry. Threaded down from the server-rendered page.
   */
  placesEnabled: boolean;
};

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Inline add/edit form for an Option. Used in two shapes:
 *   - per-section "+ Add a meal" / "+ Add a restaurant" expansion
 *   - "Edit" on an `OptionRow` expanding over the row
 *
 * Identical on phone and desktop — no responsive layout fork. Submits to the
 * server action; on `{ ok: false }` the inline field error is shown and the
 * form stays open. On `{ ok: true }` the form calls `onDone` so the parent
 * can collapse it back; `revalidatePath` then refreshes the list in place.
 */
export function OptionForm({
  kind,
  initial,
  onDone,
  tagSuggestions,
  placesEnabled,
}: Props) {
  const idBase = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [mapsUrl, setMapsUrl] = useState(initial?.mapsUrl ?? "");
  const [lat, setLat] = useState(
    initial?.lat == null ? "" : String(initial.lat),
  );
  const [lng, setLng] = useState(
    initial?.lng == null ? "" : String(initial.lng),
  );
  const [googlePlaceId, setGooglePlaceId] = useState(
    initial?.googlePlaceId ?? "",
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [urlKept, setUrlKept] = useState(false);
  const [pending, startTransition] = useTransition();

  const editing = Boolean(initial?.id);
  const isRestaurant = kind === "restaurant";

  /**
   * Apply an autofill payload from the Places search box.
   *
   * Sets every form field from the Place's details — every field stays
   * editable afterwards. **One nuance:** an already-filled `url` is kept,
   * not overwritten. A hand-picked menu link beats the Place's generic
   * website, so a match flags a `urlKept` notice instead of clobbering
   * what the user typed.
   */
  const applyAutofill = (filled: Autofill) => {
    setName(filled.name);
    setAddress(filled.address);
    setPhone(filled.phone);
    setMapsUrl(filled.mapsUrl);
    setLat(filled.lat);
    setLng(filled.lng);
    setGooglePlaceId(filled.googlePlaceId);
    if (url.trim() === "") {
      setUrl(filled.url);
      setUrlKept(false);
    } else {
      setUrlKept(true);
    }
  };

  const submit = () => {
    setError(null);
    const values: OptionFormValues = {
      name,
      url: url === "" ? null : url,
      notes: notes === "" ? null : notes,
      address: address === "" ? null : address,
      phone: phone === "" ? null : phone,
      mapsUrl: mapsUrl === "" ? null : mapsUrl,
      lat: parseNumber(lat),
      lng: parseNumber(lng),
      googlePlaceId: googlePlaceId === "" ? null : googlePlaceId,
      tags,
    };
    startTransition(async () => {
      const result =
        editing && initial?.id
          ? await updateOption(initial.id, kind, values)
          : await createOption(kind, values);
      if (result.ok) {
        onDone();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-md py-md"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <TextField
        id={`${idBase}-name`}
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        aria-invalid={error === "Enter a name"}
        aria-describedby={error ? `${idBase}-error` : undefined}
      />
      {isRestaurant ? (
        <>
          {placesEnabled ? (
            <PlacesSearchBox onAutofill={applyAutofill} />
          ) : null}
          <TextField
            id={`${idBase}-address`}
            label="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <TextField
            id={`${idBase}-phone`}
            label="Phone"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <TextField
            id={`${idBase}-url`}
            label="Website or menu link"
            inputMode="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setUrlKept(false);
            }}
            hint={
              urlKept
                ? "Kept your menu link — Google's website was not overwritten"
                : undefined
            }
          />
          <TextField
            id={`${idBase}-maps-url`}
            label="Maps URL"
            inputMode="url"
            value={mapsUrl}
            onChange={(event) => setMapsUrl(event.target.value)}
          />
          <TextField
            id={`${idBase}-lat`}
            label="Latitude"
            inputMode="decimal"
            value={lat}
            onChange={(event) => setLat(event.target.value)}
          />
          <TextField
            id={`${idBase}-lng`}
            label="Longitude"
            inputMode="decimal"
            value={lng}
            onChange={(event) => setLng(event.target.value)}
          />
          <TextField
            id={`${idBase}-google-place-id`}
            label="Google Place ID"
            value={googlePlaceId}
            onChange={(event) => setGooglePlaceId(event.target.value)}
          />
        </>
      ) : (
        <>
          <TextArea
            id={`${idBase}-notes`}
            label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <TextField
            id={`${idBase}-url`}
            label="Recipe link"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </>
      )}
      <TagInput
        id={`${idBase}-tags`}
        value={tags}
        onChange={setTags}
        suggestions={tagSuggestions}
      />
      {error ? (
        <p id={`${idBase}-error`} className="text-meta text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-row gap-sm">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-control bg-action px-lg text-body text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
        >
          {editing ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="min-h-[44px] rounded-control border border-line bg-surface px-lg text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
