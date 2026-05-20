/**
 * Pure rendering helpers for the Catalog `PlacesSearchBox`.
 *
 * Keeping these out of the component file lets a plain unit test exercise
 * the state fold and the autofill mapping without spinning up jsdom.
 *
 * - `boxStateFromSearch` folds a `searchGoogle` result into the three
 *   user-visible states: `idle` (no hits, no failure), `results` (hits
 *   to render), `unavailable` (the one fallback path).
 * - `autofillFromPlace` maps `PlaceDetails` to the eight form-field
 *   strings the parent `OptionForm` consumes via `onAutofill`. `lat` /
 *   `lng` are rendered as decimal text; a missing coordinate becomes an
 *   empty field so the input does not show "null".
 * - `PLACES_UNAVAILABLE_NOTICE` is the inline message swapped in when
 *   the box is in the `unavailable` state.
 */
import type { PlaceDetails, PlacesSearchResult } from "@/lib/places";

export const PLACES_UNAVAILABLE_NOTICE =
  "Google search unavailable — enter details manually";

export type PlacesBoxState =
  | { kind: "idle" }
  | {
      kind: "results";
      hits: ReadonlyArray<{ placeId: string; name: string; address: string }>;
    }
  | { kind: "unavailable" };

/**
 * Fold a search result into the three user-visible states. The empty
 * query case is the caller's job — if the result is `{ ok: true, hits: [] }`
 * we stay in `idle` so the box does not flash "no results".
 */
export function boxStateFromSearch(result: PlacesSearchResult): PlacesBoxState {
  if (!result.ok) return { kind: "unavailable" };
  if (result.hits.length === 0) return { kind: "idle" };
  return { kind: "results", hits: result.hits };
}

/**
 * The eight form-field strings produced from a `PlaceDetails` payload.
 * `lat`/`lng` are decimal text; a missing coordinate becomes an empty
 * string so the form's input does not show "null".
 */
export type Autofill = {
  name: string;
  address: string;
  phone: string;
  url: string;
  mapsUrl: string;
  lat: string;
  lng: string;
  googlePlaceId: string;
};

function coord(value: number | null): string {
  return value == null ? "" : String(value);
}

export function autofillFromPlace(details: PlaceDetails): Autofill {
  return {
    name: details.name,
    address: details.address,
    phone: details.phone,
    url: details.url,
    mapsUrl: details.mapsUrl,
    lat: coord(details.lat),
    lng: coord(details.lng),
    googlePlaceId: details.googlePlaceId,
  };
}
