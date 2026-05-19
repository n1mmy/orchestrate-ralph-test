import type { PlaceDetails, SearchResult } from "@/lib/places";

/**
 * Pure logic for `PlacesSearchBox` — kept out of the component so the
 * state-folding (`boxStateFromSearch`) and the autofill mapping
 * (`autofillFromPlace`) can be exercised by a unit test without React.
 *
 * The component is a thin shell around these functions; React only owns the
 * pending-state plumbing and the click handlers.
 */

export const PLACES_UNAVAILABLE_NOTICE =
  "Google search unavailable — enter details manually";

/**
 * The three states the box renders. `idle` is the initial state (no search
 * has been run yet) and after a successful empty-query reset; `results`
 * carries a hit list (possibly empty — "No matches"); `unavailable` is the
 * one fallback path the Places funnel collapses every failure mode into.
 */
export type PlacesBoxState =
  | { kind: "idle" }
  | { kind: "results"; hits: SearchHit[] }
  | { kind: "unavailable" };

/** A search hit as the box renders it — what `boxStateFromSearch` produces. */
export type SearchHit = {
  placeId: string;
  name: string;
  address: string;
};

/**
 * Fold a Places search result into the box state. `PLACES_UNAVAILABLE` flips
 * the whole box to the inline-notice variant; a success carries the hit list
 * (even when empty — the box renders "No matches" in that case).
 */
export function boxStateFromSearch(result: SearchResult): PlacesBoxState {
  if (!result.ok) return { kind: "unavailable" };
  return {
    kind: "results",
    hits: result.hits.map((h) => ({
      placeId: h.placeId,
      name: h.name,
      address: h.address,
    })),
  };
}

/** The eight form-field strings a selected Place autofills. */
export type AutofillFields = {
  name: string;
  address: string;
  phone: string;
  lat: string;
  lng: string;
  url: string;
  mapsUrl: string;
  googlePlaceId: string;
};

/**
 * Map a `PlaceDetails` to the eight form-field strings the parent
 * `OptionForm` consumes. `lat`/`lng` render as decimal text; a missing
 * coordinate becomes an empty string so the parent's controlled input clears
 * cleanly. Everything else is passed through verbatim.
 *
 * The `url` field is included here — the parent's `applyAutofill` is the one
 * that decides to keep an already-filled `url` rather than overwriting it
 * (the `urlKept` notice). Keeping that decision at the call site keeps this
 * function purely a renderer.
 */
export function autofillFromPlace(details: PlaceDetails): AutofillFields {
  return {
    name: details.name,
    address: details.address,
    phone: details.phone,
    lat: details.lat === null ? "" : String(details.lat),
    lng: details.lng === null ? "" : String(details.lng),
    url: details.url,
    mapsUrl: details.mapsUrl,
    googlePlaceId: details.googlePlaceId,
  };
}
