import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/session";

// Re-export the real iron-session module but with a spy-able `unsealData` so
// the "expired seal" branch can be exercised directly (the real expiry has a
// 60s skew window and would otherwise need real time travel).
const { unsealDataSpy } = vi.hoisted(() => ({ unsealDataSpy: vi.fn() }));
vi.mock("iron-session", async () => {
  const actual = await vi.importActual<typeof import("iron-session")>(
    "iron-session",
  );
  unsealDataSpy.mockImplementation(actual.unsealData);
  return {
    ...actual,
    unsealData: (...args: Parameters<typeof actual.unsealData>) =>
      unsealDataSpy(...args),
  };
});

import { middleware } from "./middleware";

const SECRET = "x".repeat(32);

const originalSecret = process.env.APP_SECRET;
const ironSessionActual =
  await vi.importActual<typeof import("iron-session")>("iron-session");

beforeEach(() => {
  process.env.APP_SECRET = SECRET;
  // Reset the spy's implementation to the real `unsealData` before each test;
  // individual tests can `mockRejectedValueOnce` to override one call.
  unsealDataSpy.mockReset();
  unsealDataSpy.mockImplementation(ironSessionActual.unsealData);
});

afterEach(() => {
  process.env.APP_SECRET = originalSecret;
});

function requestFor(
  pathname: string,
  options: { sealed?: string } = {},
): NextRequest {
  const url = new URL(`https://app.test${pathname}`);
  const headers = new Headers();
  if (options.sealed) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${options.sealed}`);
  }
  return new NextRequest(url, { headers });
}

async function seal(payload: object, ttl = SESSION_TTL_SECONDS): Promise<string> {
  return ironSessionActual.sealData(payload, { password: SECRET, ttl });
}

describe("middleware", () => {
  it("redirects an unauthenticated request to /login", async () => {
    const response = await middleware(requestFor("/catalog"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/login");
  });

  it("redirects when the session is sealed but lacks the authenticated flag", async () => {
    const sealed = await seal({});
    const response = await middleware(requestFor("/catalog", { sealed }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/login");
  });

  it("redirects when the sealed cookie is expired", async () => {
    // iron-webcrypto's expiry check has a 60s skew window, so a short-ttl
    // seal would otherwise pass for an entire minute. Force the mocked
    // `unsealData` to throw the "Expired seal" error the real impl raises
    // past the window — the middleware's catch must treat it identically to
    // an absent cookie.
    const sealed = await seal({ authenticated: true });
    unsealDataSpy.mockRejectedValueOnce(new Error("Expired seal"));
    const response = await middleware(requestFor("/catalog", { sealed }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/login");
  });

  it("lets an authenticated request through", async () => {
    const sealed = await seal({ authenticated: true });
    const response = await middleware(requestFor("/catalog", { sealed }));
    // `NextResponse.next()` returns a 200-ish pass-through with the rewrite
    // header set; the key signal is the absence of a redirect Location.
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not gate /login", async () => {
    const response = await middleware(requestFor("/login"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not gate /api/ready", async () => {
    const response = await middleware(requestFor("/api/ready"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("stamps every §4 security header on a gated response", async () => {
    const response = await middleware(requestFor("/catalog"));
    expect(response.headers.get("Strict-Transport-Security")).toMatch(/max-age=/);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("stamps every §4 security header on a passthrough response too", async () => {
    const response = await middleware(requestFor("/login"));
    expect(response.headers.get("Strict-Transport-Security")).toMatch(/max-age=/);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
});
