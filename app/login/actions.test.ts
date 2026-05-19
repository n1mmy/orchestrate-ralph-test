import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn(async () => {});
const sessionProxy: { authenticated?: boolean; save: typeof save } = {
  save,
};
const getSession = vi.fn(async () => sessionProxy);
const redirect = vi.fn((url: string) => {
  // Production `next/navigation`'s `redirect` throws `NEXT_REDIRECT` past the
  // action's return; the stub mirrors that so a "match" path is observable as
  // a rejection rather than a returned value.
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("@/lib/get-session", () => ({
  getSession: () => getSession(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

import { login } from "./actions";

const originalPassword = process.env.APP_PASSWORD;

beforeEach(() => {
  process.env.APP_PASSWORD = "open-sesame";
});

afterEach(() => {
  process.env.APP_PASSWORD = originalPassword;
  save.mockClear();
  getSession.mockClear();
  redirect.mockReset();
  redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  delete sessionProxy.authenticated;
});

describe("login action", () => {
  it("establishes the session and redirects to / on a correct password", async () => {
    const formData = new FormData();
    formData.set("password", "open-sesame");

    await expect(login({}, formData)).rejects.toThrow("NEXT_REDIRECT:/");

    expect(sessionProxy.authenticated).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("returns the inline error on a wrong password, without establishing a session", async () => {
    const formData = new FormData();
    formData.set("password", "wrong");

    const result = await login({}, formData);

    expect(result).toEqual({ error: "Incorrect password" });
    expect(save).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(sessionProxy.authenticated).toBeUndefined();
  });

  it("returns the inline error when the password field is missing entirely", async () => {
    const formData = new FormData();
    const result = await login({}, formData);
    expect(result).toEqual({ error: "Incorrect password" });
    expect(save).not.toHaveBeenCalled();
  });

});
