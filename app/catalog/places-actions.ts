"use server";

import {
  createPlacesClient,
  PLACES_UNAVAILABLE,
  placesEnabled,
  type DetailsResult,
  type SearchResult,
} from "@/lib/places";
import { authedAction } from "@/lib/authed-action";

/**
 * Server-action wrappers around the Places client.
 *
 * Two jobs: keep the `GOOGLE_PLACES_API_KEY` a server secret (the client
 * never sees it), and pass `authedAction` so an anonymous caller cannot drive
 * the billed Google API through a stolen `Next-Action` id. Every other
 * concern — URL construction, field masks, response parsing, error collapse
 * — lives in `lib/places.ts`.
 *
 * Each action collapses an unset key the same way the network funnel
 * collapses any failure: a `PLACES_UNAVAILABLE` result. The form upstream
 * already gates on `placesEnabled` so this is belt-and-braces, but it means
 * the action cannot be tricked into instantiating a client with a blank key
 * when the env is misconfigured at runtime.
 */

export const searchGooglePlaces = authedAction(
  async (query: string): Promise<SearchResult> => {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!placesEnabled() || typeof key !== "string" || key.trim() === "") {
      return PLACES_UNAVAILABLE;
    }
    const client = createPlacesClient(key);
    return client.searchGoogle(query);
  },
);

export const fetchPlaceDetails = authedAction(
  async (placeId: string): Promise<DetailsResult> => {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!placesEnabled() || typeof key !== "string" || key.trim() === "") {
      return PLACES_UNAVAILABLE;
    }
    const client = createPlacesClient(key);
    return client.getPlaceDetails(placeId);
  },
);
