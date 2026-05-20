import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `redirect` throws at runtime — mirror that here so the action's
// terminating redirect propagates as a recognisable error.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    throw err;
  }),
}));

// Capture session writes so the test can assert "the session was established".
const sessionState: { authenticated?: boolean; saved: boolean } = {
  authenticated: undefined,
  saved: false,
};
vi.mock("@/lib/get-session", () => ({
  getSession: async () => ({
    get authenticated() {
      return sessionState.authenticated;
    },
    set authenticated(value: boolean | undefined) {
      sessionState.authenticated = value;
    },
    save: async () => {
      sessionState.saved = true;
    },
  }),
}));

import { redirect } from "next/navigation";

import { login } from "./actions";

const ORIGINAL_PASSWORD = process.env.APP_PASSWORD;

describe("login action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.authenticated = undefined;
    sessionState.saved = false;
    process.env.APP_PASSWORD = "correct-secret";
  });

  afterEach(() => {
    process.env.APP_PASSWORD = ORIGINAL_PASSWORD;
  });

  it("establishes the session and redirects to / on a correct password", async () => {
    const formData = new FormData();
    formData.set("password", "correct-secret");

    await expect(login({ error: null }, formData)).rejects.toThrow(
      /NEXT_REDIRECT:\//,
    );

    expect(sessionState.authenticated).toBe(true);
    expect(sessionState.saved).toBe(true);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("returns the inline 'Incorrect password' error on a wrong password", async () => {
    const formData = new FormData();
    formData.set("password", "wrong-secret");

    const result = await login({ error: null }, formData);

    expect(result).toEqual({ error: "Incorrect password" });
    expect(sessionState.authenticated).toBeUndefined();
    expect(sessionState.saved).toBe(false);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects an empty submission as a wrong password (constant-time)", async () => {
    const formData = new FormData();
    formData.set("password", "");

    const result = await login({ error: null }, formData);

    expect(result).toEqual({ error: "Incorrect password" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses to authenticate when APP_PASSWORD is unset", async () => {
    process.env.APP_PASSWORD = "";
    const formData = new FormData();
    formData.set("password", "");

    const result = await login({ error: null }, formData);

    expect(result).toEqual({ error: "Incorrect password" });
  });
});
