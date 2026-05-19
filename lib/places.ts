/**
 * Google Places API (New) client — the one funnel through which every call to
 * Google goes. Built deep on purpose: the surface area the rest of the app
 * sees is two methods (`searchGoogle`, `getPlaceDetails`) returning a typed
 * `{ ok: true, ... } | typeof PLACES_UNAVAILABLE` union, and every failure
 * mode (network error, 429 quota, any 4xx/5xx, malformed JSON, an
 * `AbortController` timeout at `REQUEST_TIMEOUT_MS`) collapses through one
 * `placesFetch` to the same `PLACES_UNAVAILABLE` result. The form upstream
 * only has to handle one fallback path.
 *
 * The API key is a server secret — `createPlacesClient` is constructed inside
 * the server-action layer (`app/catalog/places-actions.ts`), never from a
 * client component. `placesEnabled()` reports whether `GOOGLE_PLACES_API_KEY`
 * is set so the parent form can gate the search box out entirely when no key
 * is configured.
 */
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL_BASE = "https://places.googleapis.com/v1/places";

/** Per-request timeout. Any single Places call that runs longer aborts. */
export const REQUEST_TIMEOUT_MS = 8000;

/** The eight autofill fields a `Place` resolves into for the Restaurant form. */
export type PlaceDetails = {
  name: string;
  address: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  url: string;
  mapsUrl: string;
  googlePlaceId: string;
};

/** A single hit in a text search — name + place id is all the box renders. */
export type PlaceSearchHit = {
  placeId: string;
  name: string;
  address: string;
};

/**
 * Sentinel for every Places failure. The form upstream branches on
 * `result.ok` and shows the inline `PLACES_UNAVAILABLE_NOTICE` for the
 * `ok: false` case — there is no other failure shape to handle.
 */
export const PLACES_UNAVAILABLE = { ok: false as const };
export type PlacesUnavailable = typeof PLACES_UNAVAILABLE;

export type SearchResult =
  | { ok: true; hits: PlaceSearchHit[] }
  | PlacesUnavailable;
export type DetailsResult =
  | { ok: true; details: PlaceDetails }
  | PlacesUnavailable;

export type PlacesClient = {
  searchGoogle(query: string): Promise<SearchResult>;
  getPlaceDetails(placeId: string): Promise<DetailsResult>;
};

/**
 * Reports whether `GOOGLE_PLACES_API_KEY` is configured. The form on the
 * server reads this to decide whether to render the `PlacesSearchBox` at all
 * — when the key is unset the box disappears and manual entry is the only
 * path.
 */
export function placesEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const key = env.GOOGLE_PLACES_API_KEY;
  return typeof key === "string" && key.trim() !== "";
}

/**
 * The one-and-only network funnel. Every call into Google goes through here;
 * every failure mode lands on `null`. The two public methods then map a
 * `null` to `PLACES_UNAVAILABLE` and a parsed body to the typed success.
 *
 * The error collapse is deliberate — see the ticket: the form has exactly one
 * fallback path, so we never let an `Error` escape this function. The
 * `AbortController` is wired up here so the timeout is uniform across both
 * Places endpoints and not duplicated at each call site.
 */
async function placesFetch(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    try {
      return await response.json();
    } catch {
      // Malformed body — collapse.
      return null;
    }
  } catch {
    // Network failure or timeout (`AbortController.abort` rejects the
    // pending `fetch` with an `AbortError`) — collapse.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A typed shape we coerce a search response into; everything is best-effort. */
type RawSearchPlace = {
  id?: unknown;
  displayName?: { text?: unknown } | unknown;
  formattedAddress?: unknown;
};

/** A typed shape for the eight Place-details fields we pull through. */
type RawDetailsPlace = {
  id?: unknown;
  displayName?: { text?: unknown } | unknown;
  formattedAddress?: unknown;
  internationalPhoneNumber?: unknown;
  nationalPhoneNumber?: unknown;
  location?: { latitude?: unknown; longitude?: unknown } | unknown;
  websiteUri?: unknown;
  googleMapsUri?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readDisplayName(value: unknown): string {
  if (value && typeof value === "object" && "text" in value) {
    return asString((value as { text: unknown }).text);
  }
  return "";
}

function parseSearchHits(body: unknown): PlaceSearchHit[] | null {
  if (!body || typeof body !== "object") return null;
  const places = (body as { places?: unknown }).places;
  if (!Array.isArray(places)) {
    // An empty result body legitimately omits `places`; treat that as a
    // zero-hit success rather than a failure.
    return [];
  }
  const hits: PlaceSearchHit[] = [];
  for (const raw of places as RawSearchPlace[]) {
    const placeId = asString(raw.id);
    if (placeId === "") continue;
    hits.push({
      placeId,
      name: readDisplayName(raw.displayName),
      address: asString(raw.formattedAddress),
    });
  }
  return hits;
}

function parsePlaceDetails(body: unknown): PlaceDetails | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as RawDetailsPlace;
  const placeId = asString(raw.id);
  if (placeId === "") return null;
  const location =
    raw.location && typeof raw.location === "object"
      ? (raw.location as { latitude?: unknown; longitude?: unknown })
      : {};
  // Prefer the international phone number when present; fall back to the
  // national format. Either is sufficient for "tap to dial" on the form.
  const phone =
    asString(raw.internationalPhoneNumber) ||
    asString(raw.nationalPhoneNumber);
  return {
    name: readDisplayName(raw.displayName),
    address: asString(raw.formattedAddress),
    phone,
    lat: asFiniteNumber(location.latitude),
    lng: asFiniteNumber(location.longitude),
    url: asString(raw.websiteUri),
    mapsUrl: asString(raw.googleMapsUri),
    googlePlaceId: placeId,
  };
}

const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress";
const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "location",
  "websiteUri",
  "googleMapsUri",
].join(",");

/**
 * Build a `PlacesClient` bound to an API key. The key is held in this
 * closure and never leaves the server — only the typed result shapes do.
 *
 * The optional `fetchImpl` lets the test suite inject a stub `fetch` that
 * simulates each failure mode (network throw, 429, 5xx, malformed JSON,
 * timeout). The default is the global `fetch`.
 */
export function createPlacesClient(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): PlacesClient {
  const baseHeaders: Record<string, string> = {
    "X-Goog-Api-Key": apiKey,
    "Content-Type": "application/json",
  };

  return {
    async searchGoogle(query: string): Promise<SearchResult> {
      const trimmed = query.trim();
      if (trimmed === "") return { ok: true, hits: [] };
      const body = await placesFetch(
        SEARCH_URL,
        {
          method: "POST",
          headers: {
            ...baseHeaders,
            "X-Goog-FieldMask": SEARCH_FIELD_MASK,
          },
          body: JSON.stringify({ textQuery: trimmed }),
        },
        fetchImpl,
        timeoutMs,
      );
      if (body === null) return PLACES_UNAVAILABLE;
      const hits = parseSearchHits(body);
      if (hits === null) return PLACES_UNAVAILABLE;
      return { ok: true, hits };
    },

    async getPlaceDetails(placeId: string): Promise<DetailsResult> {
      const trimmed = placeId.trim();
      if (trimmed === "") return PLACES_UNAVAILABLE;
      const url = `${DETAILS_URL_BASE}/${encodeURIComponent(trimmed)}`;
      const body = await placesFetch(
        url,
        {
          method: "GET",
          headers: {
            ...baseHeaders,
            "X-Goog-FieldMask": DETAILS_FIELD_MASK,
          },
        },
        fetchImpl,
        timeoutMs,
      );
      if (body === null) return PLACES_UNAVAILABLE;
      const details = parsePlaceDetails(body);
      if (details === null) return PLACES_UNAVAILABLE;
      return { ok: true, details };
    },
  };
}
