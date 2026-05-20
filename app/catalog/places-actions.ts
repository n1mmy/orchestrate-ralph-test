"use server";

/**
 * Server-action wrappers for the two Places client calls.
 *
 * The Places API key is a **server secret**: the client never sees it.
 * Every UI search or detail-fetch goes through one of these `authedAction`-
 * wrapped actions so an anonymous caller cannot drive the billed API.
 *
 * Both actions inspect `placesEnabled()` first and return `PLACES_UNAVAILABLE`
 * with no fetch when the key is unset — the `OptionForm` gates the search
 * box on `placesEnabled` so this branch is unreachable in the happy path,
 * but the action defends itself anyway (the gate is a UI affordance, not
 * a security boundary).
 */
import { authedAction } from "@/lib/authed-action";
import {
  PLACES_UNAVAILABLE,
  type PlaceDetailsResult,
  type PlacesSearchResult,
  createPlacesClient,
  placesEnabled,
} from "@/lib/places";

function client() {
  return createPlacesClient(process.env.GOOGLE_PLACES_API_KEY ?? "");
}

export const searchGooglePlaces = authedAction(
  async (query: string): Promise<PlacesSearchResult> => {
    if (!placesEnabled()) return PLACES_UNAVAILABLE;
    return client().searchGoogle(query);
  },
);

export const fetchPlaceDetails = authedAction(
  async (placeId: string): Promise<PlaceDetailsResult> => {
    if (!placesEnabled()) return PLACES_UNAVAILABLE;
    return client().getPlaceDetails(placeId);
  },
);
