import { describe, expect, it } from "vitest";

import {
  PLACES_UNAVAILABLE_NOTICE,
  autofillFromPlace,
  boxStateFromSearch,
} from "./places-box";

describe("boxStateFromSearch", () => {
  it("folds an unavailable result to the inline-notice state", () => {
    expect(boxStateFromSearch({ ok: false })).toEqual({ kind: "unavailable" });
  });

  it("folds an empty hit list to idle (no flash of 'no results')", () => {
    expect(boxStateFromSearch({ ok: true, hits: [] })).toEqual({ kind: "idle" });
  });

  it("folds a non-empty hit list to results, preserving order", () => {
    const result = boxStateFromSearch({
      ok: true,
      hits: [
        { placeId: "a", name: "Alpha", address: "1 A" },
        { placeId: "b", name: "Beta", address: "2 B" },
      ],
    });
    expect(result).toEqual({
      kind: "results",
      hits: [
        { placeId: "a", name: "Alpha", address: "1 A" },
        { placeId: "b", name: "Beta", address: "2 B" },
      ],
    });
  });
});

describe("autofillFromPlace", () => {
  it("maps every field, rendering lat/lng as decimal text", () => {
    expect(
      autofillFromPlace({
        name: "Joe's Pizza",
        address: "1 Main St",
        phone: "+1 555 0000",
        lat: 40.5,
        lng: -74.1,
        url: "https://joes.example",
        mapsUrl: "https://maps.example/joes",
        googlePlaceId: "place-1",
      }),
    ).toEqual({
      name: "Joe's Pizza",
      address: "1 Main St",
      phone: "+1 555 0000",
      url: "https://joes.example",
      mapsUrl: "https://maps.example/joes",
      lat: "40.5",
      lng: "-74.1",
      googlePlaceId: "place-1",
    });
  });

  it("renders a missing coordinate as an empty string so the field does not show null", () => {
    const filled = autofillFromPlace({
      name: "No Coords",
      address: "addr",
      phone: "",
      lat: null,
      lng: null,
      url: "",
      mapsUrl: "",
      googlePlaceId: "place-2",
    });
    expect(filled.lat).toBe("");
    expect(filled.lng).toBe("");
  });
});

describe("PLACES_UNAVAILABLE_NOTICE", () => {
  it("is the inline fallback message", () => {
    expect(PLACES_UNAVAILABLE_NOTICE).toBe(
      "Google search unavailable — enter details manually",
    );
  });
});
