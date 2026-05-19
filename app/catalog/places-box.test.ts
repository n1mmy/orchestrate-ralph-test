import { describe, expect, it } from "vitest";
import {
  autofillFromPlace,
  boxStateFromSearch,
  PLACES_UNAVAILABLE_NOTICE,
} from "./places-box";
import { PLACES_UNAVAILABLE } from "@/lib/places";

describe("boxStateFromSearch", () => {
  it("flips to the unavailable state on a Places failure", () => {
    expect(boxStateFromSearch(PLACES_UNAVAILABLE)).toEqual({
      kind: "unavailable",
    });
  });

  it("folds a successful response into a results state, preserving order", () => {
    const state = boxStateFromSearch({
      ok: true,
      hits: [
        { placeId: "a", name: "A", address: "addr-a" },
        { placeId: "b", name: "B", address: "addr-b" },
      ],
    });
    expect(state).toEqual({
      kind: "results",
      hits: [
        { placeId: "a", name: "A", address: "addr-a" },
        { placeId: "b", name: "B", address: "addr-b" },
      ],
    });
  });

  it("yields a results state with an empty hit list when the search has no matches", () => {
    expect(boxStateFromSearch({ ok: true, hits: [] })).toEqual({
      kind: "results",
      hits: [],
    });
  });
});

describe("autofillFromPlace", () => {
  it("maps every field through, rendering lat/lng as decimal text", () => {
    expect(
      autofillFromPlace({
        name: "Joe's",
        address: "1 Main",
        phone: "+1 555 0100",
        lat: 40.5,
        lng: -73.9,
        url: "https://example.com",
        mapsUrl: "https://maps.google.com/?cid=1",
        googlePlaceId: "p-1",
      }),
    ).toEqual({
      name: "Joe's",
      address: "1 Main",
      phone: "+1 555 0100",
      lat: "40.5",
      lng: "-73.9",
      url: "https://example.com",
      mapsUrl: "https://maps.google.com/?cid=1",
      googlePlaceId: "p-1",
    });
  });

  it("renders a missing coordinate as an empty string so the field clears", () => {
    const fields = autofillFromPlace({
      name: "X",
      address: "",
      phone: "",
      lat: null,
      lng: null,
      url: "",
      mapsUrl: "",
      googlePlaceId: "p-1",
    });
    expect(fields.lat).toBe("");
    expect(fields.lng).toBe("");
  });
});

describe("PLACES_UNAVAILABLE_NOTICE", () => {
  it("matches the inline-message copy the form falls back to", () => {
    expect(PLACES_UNAVAILABLE_NOTICE).toBe(
      "Google search unavailable — enter details manually",
    );
  });
});
