import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auth-gate tests for the rejection-actions module. Both writes go through
 * `authedAction`, so an unauthenticated dispatch must hit `requireSession`'s
 * `redirect("/login")` — modelled as a thrown `NEXT_REDIRECT` so the
 * "redirected" path is observable as a rejection rather than a return.
 *
 * The DB and `next/cache` are stubbed; we only assert the gate fires *before*
 * the action body, never the body itself.
 */

const save = vi.fn(async () => {});
const sessionProxy: { authenticated?: boolean; save: typeof save } = { save };
const getSession = vi.fn(async () => sessionProxy);
const redirect = vi.fn((url: string) => {
  // Production `next/navigation`'s `redirect` throws `NEXT_REDIRECT` past the
  // action's return — the stub mirrors that.
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("@/lib/get-session", () => ({
  getSession: () => getSession(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The DB is not exercised in these tests — every call must throw on the
// auth gate before the body runs.
vi.mock("@/db", () => ({
  db: {
    insert: () => {
      throw new Error("db.insert should not be reached on unauthed dispatch");
    },
    delete: () => {
      throw new Error("db.delete should not be reached on unauthed dispatch");
    },
  },
}));

import { deleteRejection, rejectOption } from "./rejection-actions";

beforeEach(() => {
  redirect.mockClear();
  getSession.mockClear();
});

afterEach(() => {
  delete sessionProxy.authenticated;
});

describe("rejection-actions auth gate", () => {
  it("deleteRejection redirects to /login when the caller has no session", async () => {
    await expect(deleteRejection("rej-1")).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("rejectOption redirects to /login when the caller has no session", async () => {
    await expect(rejectOption("opt-1", "")).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
