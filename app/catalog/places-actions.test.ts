import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `authedAction` would normally redirect to /login when no session is set;
// the test stubs it to a pass-through so we can isolate the key-unset path.
vi.mock("@/lib/authed-action", () => ({
  authedAction: <Args extends unknown[], R>(
    action: (...args: Args) => Promise<R>,
  ) => action,
}));

describe("places actions — key-unset path", () => {
  const original = process.env.GOOGLE_PLACES_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.GOOGLE_PLACES_API_KEY;
    } else {
      process.env.GOOGLE_PLACES_API_KEY = original;
    }
  });

  it("collapses searchGooglePlaces to PLACES_UNAVAILABLE when the key is unset", async () => {
    const mod = await import("./places-actions");
    const result = await mod.searchGooglePlaces("joe");
    expect(result).toEqual({ ok: false });
  });

  it("collapses fetchPlaceDetails to PLACES_UNAVAILABLE when the key is unset", async () => {
    const mod = await import("./places-actions");
    const result = await mod.fetchPlaceDetails("p-1");
    expect(result).toEqual({ ok: false });
  });

  it("collapses to PLACES_UNAVAILABLE when the key is set to a blank string", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "   ";
    const mod = await import("./places-actions");
    expect(await mod.searchGooglePlaces("joe")).toEqual({ ok: false });
    expect(await mod.fetchPlaceDetails("p-1")).toEqual({ ok: false });
  });
});
