import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/navigation's redirect to throw a recognisable sentinel — that is
// how `redirect()` behaves at runtime in a server context.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  }),
}));

// Stub the session reader so each test can dictate auth state.
const sessionState = { authenticated: false as boolean | undefined };
vi.mock("./get-session", () => ({
  getSession: async () => sessionState,
}));

import { redirect } from "next/navigation";

import { requireSession } from "./require-session";

describe("requireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.authenticated = undefined;
  });

  it("redirects to /login when the session has no `authenticated` flag", async () => {
    sessionState.authenticated = undefined;
    await expect(requireSession()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the session is explicitly not authenticated", async () => {
    sessionState.authenticated = false;
    await expect(requireSession()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("resolves without redirecting when the session is authenticated", async () => {
    sessionState.authenticated = true;
    await expect(requireSession()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
