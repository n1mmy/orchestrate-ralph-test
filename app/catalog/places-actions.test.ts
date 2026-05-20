import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `requireSession` redirects to /login when unauthenticated — mirror that here
// so a missing session aborts the action with a recognisable error and the
// happy-path tests can stub it to a no-op.
vi.mock("@/lib/require-session", () => ({
  requireSession: vi.fn(async () => {}),
}));

import { fetchPlaceDetails, searchGooglePlaces } from "./places-actions";
import { requireSession } from "@/lib/require-session";

const ORIGINAL_KEY = process.env.GOOGLE_PLACES_API_KEY;

describe("places-actions — key unset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.GOOGLE_PLACES_API_KEY;
    } else {
      process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_KEY;
    }
  });

  it("searchGooglePlaces returns PLACES_UNAVAILABLE without touching the network", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await searchGooglePlaces("pizza");
    expect(result).toEqual({ ok: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("fetchPlaceDetails returns PLACES_UNAVAILABLE without touching the network", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await fetchPlaceDetails("place-1");
    expect(result).toEqual({ ok: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("treats an empty string key as unset", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "";
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await searchGooglePlaces("pizza")).toEqual({ ok: false });
    expect(await fetchPlaceDetails("place-1")).toEqual({ ok: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("treats a whitespace-only key as unset", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "   ";
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await searchGooglePlaces("pizza")).toEqual({ ok: false });
    expect(await fetchPlaceDetails("place-1")).toEqual({ ok: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("still gates on authedAction — an unauthenticated caller is redirected", async () => {
    (requireSession as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        throw new Error("NEXT_REDIRECT:/login");
      },
    );
    await expect(searchGooglePlaces("pizza")).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(fetchPlaceDetails("place-1")).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
