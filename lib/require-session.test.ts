import { afterEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const redirect = vi.fn((url: string) => {
  // `next/navigation`'s `redirect` throws a `NEXT_REDIRECT` error that bubbles
  // up the call stack; the stub mirrors that so the caller's control flow
  // matches the production path.
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("./get-session", () => ({
  getSession: () => getSession(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

import { requireSession } from "./require-session";

afterEach(() => {
  getSession.mockReset();
  redirect.mockReset();
  redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("requireSession", () => {
  it("returns silently when the session is authenticated", async () => {
    getSession.mockResolvedValueOnce({ authenticated: true });
    await expect(requireSession()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /login when the session has no authenticated flag", async () => {
    getSession.mockResolvedValueOnce({});
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when `authenticated` is explicitly false", async () => {
    getSession.mockResolvedValueOnce({ authenticated: false });
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
