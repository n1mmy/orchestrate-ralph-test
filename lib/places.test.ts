import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlacesClient,
  PLACES_UNAVAILABLE,
  placesEnabled,
  REQUEST_TIMEOUT_MS,
} from "./places";

/**
 * The Places client is the one place every external-API failure mode is
 * funneled into a single `PLACES_UNAVAILABLE` result. The tests pin each
 * failure mode to that result so the form upstream only has to handle one
 * fallback path.
 */

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("placesEnabled", () => {
  it("is false when the key is unset", () => {
    expect(placesEnabled({})).toBe(false);
  });

  it("is false when the key is blank", () => {
    expect(placesEnabled({ GOOGLE_PLACES_API_KEY: "   " })).toBe(false);
  });

  it("is true when the key is set", () => {
    expect(placesEnabled({ GOOGLE_PLACES_API_KEY: "k" })).toBe(true);
  });
});

describe("searchGoogle", () => {
  it("returns an empty hit list for a blank query without hitting the network", async () => {
    const fetchImpl = vi.fn();
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    const result = await client.searchGoogle("   ");
    expect(result).toEqual({ ok: true, hits: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("parses a normal text-search response", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        places: [
          {
            id: "abc",
            displayName: { text: "Joe's Pizza" },
            formattedAddress: "1 Main St",
          },
        ],
      }),
    );
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    const result = await client.searchGoogle("joe");
    expect(result).toEqual({
      ok: true,
      hits: [{ placeId: "abc", name: "Joe's Pizza", address: "1 Main St" }],
    });
    // The X-Goog auth/field-mask headers must be wired up.
    const [, init] = fetchImpl.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("k");
    expect(headers["X-Goog-FieldMask"]).toContain("places.id");
  });

  it("treats an omitted `places` field as a zero-hit success, not a failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.searchGoogle("joe")).toEqual({ ok: true, hits: [] });
  });

  it("collapses a network error to PLACES_UNAVAILABLE", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET"));
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.searchGoogle("joe")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a 429 quota error to PLACES_UNAVAILABLE", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("Too many", { status: 429 }));
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.searchGoogle("joe")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a 5xx error to PLACES_UNAVAILABLE", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("oops", { status: 503 }));
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.searchGoogle("joe")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a 4xx error (other than 429) to PLACES_UNAVAILABLE", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("denied", { status: 403 }));
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.searchGoogle("joe")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a malformed JSON body to PLACES_UNAVAILABLE", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.searchGoogle("joe")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a non-object JSON body to PLACES_UNAVAILABLE", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse("scalar"));
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.searchGoogle("joe")).toEqual(PLACES_UNAVAILABLE);
  });
});

describe("getPlaceDetails", () => {
  it("parses a normal place-details response into the eight autofill fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        id: "p-1",
        displayName: { text: "Joe's Pizza" },
        formattedAddress: "1 Main St",
        internationalPhoneNumber: "+1 555 0100",
        location: { latitude: 40.5, longitude: -73.9 },
        websiteUri: "https://example.com",
        googleMapsUri: "https://maps.google.com/?cid=1",
      }),
    );
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.getPlaceDetails("p-1")).toEqual({
      ok: true,
      details: {
        name: "Joe's Pizza",
        address: "1 Main St",
        phone: "+1 555 0100",
        lat: 40.5,
        lng: -73.9,
        url: "https://example.com",
        mapsUrl: "https://maps.google.com/?cid=1",
        googlePlaceId: "p-1",
      },
    });
  });

  it("falls back to the national phone number when the international one is absent", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        id: "p-1",
        displayName: { text: "X" },
        nationalPhoneNumber: "(555) 0100",
      }),
    );
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    const result = await client.getPlaceDetails("p-1");
    expect(result.ok && result.details.phone).toBe("(555) 0100");
  });

  it("renders a missing location as null lat / null lng", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        id: "p-1",
        displayName: { text: "X" },
      }),
    );
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    const result = await client.getPlaceDetails("p-1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.details.lat).toBeNull();
    expect(result.details.lng).toBeNull();
  });

  it("collapses a body with no `id` to PLACES_UNAVAILABLE", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.getPlaceDetails("p-1")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a network error to PLACES_UNAVAILABLE", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("offline"));
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.getPlaceDetails("p-1")).toEqual(PLACES_UNAVAILABLE);
  });

  it("collapses a blank placeId to PLACES_UNAVAILABLE without hitting the network", async () => {
    const fetchImpl = vi.fn();
    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch);
    expect(await client.getPlaceDetails("   ")).toEqual(PLACES_UNAVAILABLE);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("placesFetch timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the request once REQUEST_TIMEOUT_MS elapses and collapses to PLACES_UNAVAILABLE", async () => {
    // The fetch never resolves on its own; it must be aborted via the
    // `AbortController.signal` wired up inside `placesFetch`. We forward the
    // `AbortError` so the funnel collapses it the same as any network throw.
    let abortReason: unknown;
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            abortReason = (signal as AbortSignal).reason;
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    const client = createPlacesClient("k", fetchImpl as unknown as typeof fetch, 100);
    const promise = client.searchGoogle("joe");

    await vi.advanceTimersByTimeAsync(150);
    const result = await promise;
    expect(result).toEqual(PLACES_UNAVAILABLE);
    expect(abortReason).toBeDefined();
  });

  it("exposes a REQUEST_TIMEOUT_MS constant for the form to read", () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
