import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PLACES_UNAVAILABLE,
  REQUEST_TIMEOUT_MS,
  createPlacesClient,
  placesEnabled,
} from "./places";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("placesEnabled", () => {
  it("is false when the env var is unset", () => {
    expect(placesEnabled({})).toBe(false);
  });

  it("is false when the env var is empty or whitespace", () => {
    expect(placesEnabled({ GOOGLE_PLACES_API_KEY: "" })).toBe(false);
    expect(placesEnabled({ GOOGLE_PLACES_API_KEY: "   " })).toBe(false);
  });

  it("is true when a non-empty key is set", () => {
    expect(placesEnabled({ GOOGLE_PLACES_API_KEY: "secret-key" })).toBe(true);
  });
});

describe("createPlacesClient — searchGoogle", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("sends the API key, FieldMask, and the text query, returning normalized hits", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        places: [
          {
            id: "place-1",
            displayName: { text: "Joe's Pizza" },
            formattedAddress: "1 Main St",
          },
          {
            id: "place-2",
            displayName: { text: "Mario's" },
            formattedAddress: "2 Oak Ave",
          },
        ],
      }),
    );

    const client = createPlacesClient("secret-key", fetchMock);
    const result = await client.searchGoogle("pizza");

    expect(result).toEqual({
      ok: true,
      hits: [
        { placeId: "place-1", name: "Joe's Pizza", address: "1 Main St" },
        { placeId: "place-2", name: "Mario's", address: "2 Oak Ave" },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ textQuery: "pizza" });
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("secret-key");
    expect(headers["X-Goog-FieldMask"]).toContain("places.id");
    expect(headers["X-Goog-FieldMask"]).toContain("places.displayName");
    expect(headers["X-Goog-FieldMask"]).toContain("places.formattedAddress");
  });

  it("collapses a network throw to PLACES_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const client = createPlacesClient("secret-key", fetchMock);
    expect(await client.searchGoogle("pizza")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a 429 quota response to PLACES_UNAVAILABLE", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );
    const client = createPlacesClient("secret-key", fetchMock);
    expect(await client.searchGoogle("pizza")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses any 4xx/5xx to PLACES_UNAVAILABLE", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }));
    const client1 = createPlacesClient("secret-key", fetchMock);
    expect(await client1.searchGoogle("pizza")).toEqual(PLACES_UNAVAILABLE);

    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 503 }));
    const client2 = createPlacesClient("secret-key", fetchMock);
    expect(await client2.searchGoogle("pizza")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a malformed JSON body to PLACES_UNAVAILABLE", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createPlacesClient("secret-key", fetchMock);
    expect(await client.searchGoogle("pizza")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a 2xx body missing the places array to PLACES_UNAVAILABLE", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));
    const client = createPlacesClient("secret-key", fetchMock);
    expect(await client.searchGoogle("pizza")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses an empty API key without calling fetch", async () => {
    const client = createPlacesClient("", fetchMock);
    expect(await client.searchGoogle("pizza")).toEqual(PLACES_UNAVAILABLE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts with an AbortController on request timeout", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const err = new Error("Aborted");
              (err as Error & { name: string }).name = "AbortError";
              reject(err);
            });
          }),
      );
      const client = createPlacesClient("secret-key", fetchMock);
      const promise = client.searchGoogle("pizza");
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
      expect(await promise).toEqual(PLACES_UNAVAILABLE);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createPlacesClient — getPlaceDetails", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses the eight autofill fields on success", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "place-1",
        displayName: { text: "Joe's Pizza" },
        formattedAddress: "1 Main St, Anytown",
        internationalPhoneNumber: "+1 555 000 1234",
        location: { latitude: 40.5, longitude: -74.1 },
        websiteUri: "https://joes.example",
        googleMapsUri: "https://maps.example/joes",
      }),
    );

    const client = createPlacesClient("secret-key", fetchMock);
    const result = await client.getPlaceDetails("place-1");

    expect(result).toEqual({
      ok: true,
      details: {
        name: "Joe's Pizza",
        address: "1 Main St, Anytown",
        phone: "+1 555 000 1234",
        lat: 40.5,
        lng: -74.1,
        url: "https://joes.example",
        mapsUrl: "https://maps.example/joes",
        googlePlaceId: "place-1",
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places/place-1");
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("secret-key");
    expect(headers["X-Goog-FieldMask"]).toContain("location");
    expect(headers["X-Goog-FieldMask"]).toContain("websiteUri");
  });

  it("falls back to the national phone number when international is missing", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "place-1",
        displayName: { text: "Local Diner" },
        formattedAddress: "Somewhere",
        nationalPhoneNumber: "(555) 555-1234",
      }),
    );

    const client = createPlacesClient("secret-key", fetchMock);
    const result = await client.getPlaceDetails("place-1");
    expect(result.ok && result.details.phone).toBe("(555) 555-1234");
    expect(result.ok && result.details.lat).toBeNull();
    expect(result.ok && result.details.lng).toBeNull();
  });

  it("collapses a network throw to PLACES_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    const client = createPlacesClient("secret-key", fetchMock);
    expect(await client.getPlaceDetails("place-1")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a non-2xx to PLACES_UNAVAILABLE", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    const client = createPlacesClient("secret-key", fetchMock);
    expect(await client.getPlaceDetails("place-1")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a malformed details body to PLACES_UNAVAILABLE", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ no_id_here: true }));
    const client = createPlacesClient("secret-key", fetchMock);
    expect(await client.getPlaceDetails("place-1")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses an empty placeId without calling fetch", async () => {
    const client = createPlacesClient("secret-key", fetchMock);
    expect(await client.getPlaceDetails("")).toEqual(PLACES_UNAVAILABLE);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
