/**
 * Google Places API (New) client.
 *
 * A **deep module**: callers see a tiny `PlacesClient` surface
 * (`searchGoogle`, `getPlaceDetails`) and one typed failure
 * (`PLACES_UNAVAILABLE`). Behind that surface every transport detail —
 * URL construction, the `X-Goog-FieldMask` headers, the `X-Goog-Api-Key`
 * auth, JSON parsing, and the error collapse — is hidden so the form
 * has exactly **one fallback path**.
 *
 * Every failure mode (network error, 429 quota, any 4xx/5xx, malformed
 * body, `AbortController` timeout) funnels through `placesFetch`, which
 * returns `null` on any non-2xx or thrown error. The two public methods
 * lift that `null` to a `{ ok: false }` `PLACES_UNAVAILABLE` result.
 *
 * `placesEnabled()` reports whether `GOOGLE_PLACES_API_KEY` is set; the
 * UI gates the search box on it so the form degrades cleanly to plain
 * manual entry when the key is absent.
 */

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL_PREFIX = "https://places.googleapis.com/v1/places/";

const SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress";

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

/** Per-request abort window. Network or server stall beyond this collapses. */
export const REQUEST_TIMEOUT_MS = 5_000;

export type PlacesUnavailable = { ok: false };

/** Single typed failure — every transport problem collapses to this shape. */
export const PLACES_UNAVAILABLE: PlacesUnavailable = { ok: false };

export type PlacesSearchHit = {
  placeId: string;
  name: string;
  address: string;
};

export type PlacesSearchOk = { ok: true; hits: PlacesSearchHit[] };
export type PlacesSearchResult = PlacesSearchOk | PlacesUnavailable;

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

export type PlaceDetailsOk = { ok: true; details: PlaceDetails };
export type PlaceDetailsResult = PlaceDetailsOk | PlacesUnavailable;

export type PlacesClient = {
  searchGoogle: (query: string) => Promise<PlacesSearchResult>;
  getPlaceDetails: (placeId: string) => Promise<PlaceDetailsResult>;
};

/**
 * True iff `GOOGLE_PLACES_API_KEY` is set in the current environment.
 * The UI gates the `PlacesSearchBox` on this so the form degrades to
 * manual entry when the key is absent.
 */
export function placesEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const key = env.GOOGLE_PLACES_API_KEY;
  return typeof key === "string" && key.trim() !== "";
}

type FetchLike = typeof fetch;

type FetchOptions = {
  url: string;
  method: "GET" | "POST";
  apiKey: string;
  fieldMask: string;
  body?: unknown;
};

/**
 * The single funnel every Places request goes through. Returns the parsed
 * JSON body on a 2xx, or `null` on **any** failure — network throw, abort,
 * non-2xx status, or malformed JSON. Lifting this `null` to
 * `PLACES_UNAVAILABLE` keeps the form's fallback path one-shaped.
 */
async function placesFetch(
  options: FetchOptions,
  fetchImpl: FetchLike,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const init: RequestInit = {
      method: options.method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": options.apiKey,
        "X-Goog-FieldMask": options.fieldMask,
      },
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }
    const response = await fetchImpl(options.url, init);
    if (!response.ok) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type RawSearchBody = {
  places?: Array<{
    id?: unknown;
    displayName?: { text?: unknown } | unknown;
    formattedAddress?: unknown;
  }>;
};

function parseHits(body: unknown): PlacesSearchHit[] | null {
  if (body == null || typeof body !== "object") return null;
  const raw = body as RawSearchBody;
  if (!Array.isArray(raw.places)) return null;
  const hits: PlacesSearchHit[] = [];
  for (const place of raw.places) {
    if (!place || typeof place !== "object") return null;
    const id = (place as { id?: unknown }).id;
    if (typeof id !== "string" || id === "") return null;
    const displayName = (place as { displayName?: unknown }).displayName;
    let name = "";
    if (
      displayName !== null &&
      typeof displayName === "object" &&
      typeof (displayName as { text?: unknown }).text === "string"
    ) {
      name = (displayName as { text: string }).text;
    }
    const formatted = (place as { formattedAddress?: unknown }).formattedAddress;
    const address = typeof formatted === "string" ? formatted : "";
    hits.push({ placeId: id, name, address });
  }
  return hits;
}

type RawDetailsBody = {
  id?: unknown;
  displayName?: { text?: unknown } | unknown;
  formattedAddress?: unknown;
  internationalPhoneNumber?: unknown;
  nationalPhoneNumber?: unknown;
  location?: { latitude?: unknown; longitude?: unknown } | unknown;
  websiteUri?: unknown;
  googleMapsUri?: unknown;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDetails(body: unknown): PlaceDetails | null {
  if (body == null || typeof body !== "object") return null;
  const raw = body as RawDetailsBody;
  const id = raw.id;
  if (typeof id !== "string" || id === "") return null;
  let name = "";
  if (
    raw.displayName !== null &&
    typeof raw.displayName === "object" &&
    typeof (raw.displayName as { text?: unknown }).text === "string"
  ) {
    name = (raw.displayName as { text: string }).text;
  }
  const phone =
    readString(raw.internationalPhoneNumber) || readString(raw.nationalPhoneNumber);
  let lat: number | null = null;
  let lng: number | null = null;
  if (raw.location !== null && typeof raw.location === "object") {
    const loc = raw.location as { latitude?: unknown; longitude?: unknown };
    lat = readNumber(loc.latitude);
    lng = readNumber(loc.longitude);
  }
  return {
    name,
    address: readString(raw.formattedAddress),
    phone,
    lat,
    lng,
    url: readString(raw.websiteUri),
    mapsUrl: readString(raw.googleMapsUri),
    googlePlaceId: id,
  };
}

/**
 * Build a `PlacesClient` against a given API key. Tests inject `fetchImpl`
 * to drive the failure-collapse paths without hitting the network.
 */
export function createPlacesClient(
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): PlacesClient {
  return {
    async searchGoogle(query: string): Promise<PlacesSearchResult> {
      if (apiKey === "" || query.trim() === "") return PLACES_UNAVAILABLE;
      const body = await placesFetch(
        {
          url: SEARCH_URL,
          method: "POST",
          apiKey,
          fieldMask: SEARCH_FIELD_MASK,
          body: { textQuery: query },
        },
        fetchImpl,
      );
      if (body === null) return PLACES_UNAVAILABLE;
      const hits = parseHits(body);
      if (hits === null) return PLACES_UNAVAILABLE;
      return { ok: true, hits };
    },

    async getPlaceDetails(placeId: string): Promise<PlaceDetailsResult> {
      if (apiKey === "" || placeId.trim() === "") return PLACES_UNAVAILABLE;
      const body = await placesFetch(
        {
          url: `${DETAILS_URL_PREFIX}${encodeURIComponent(placeId)}`,
          method: "GET",
          apiKey,
          fieldMask: DETAILS_FIELD_MASK,
        },
        fetchImpl,
      );
      if (body === null) return PLACES_UNAVAILABLE;
      const details = parseDetails(body);
      if (details === null) return PLACES_UNAVAILABLE;
      return { ok: true, details };
    },
  };
}
