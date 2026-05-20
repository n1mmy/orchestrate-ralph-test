import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock iron-session's `unsealData` — drives the "expired/invalid" branch.
const unsealMock = vi.fn();
vi.mock("iron-session", () => ({
  unsealData: (...args: unknown[]) => unsealMock(...args),
}));

// Re-implement just enough of `NextResponse` for the middleware to use.
// The real one needs the Next runtime; the shape we exercise is `.next()`,
// `.redirect(url)`, and a settable `.headers`.
class FakeHeaders {
  private map = new Map<string, string>();
  set(key: string, value: string) {
    this.map.set(key, value);
  }
  get(key: string) {
    return this.map.get(key);
  }
  has(key: string) {
    return this.map.has(key);
  }
  entries() {
    return this.map.entries();
  }
}

type FakeResponse = {
  kind: "next" | "redirect";
  redirectUrl?: URL;
  headers: FakeHeaders;
};

vi.mock("next/server", () => ({
  NextResponse: {
    next: (): FakeResponse => ({ kind: "next", headers: new FakeHeaders() }),
    redirect: (url: URL): FakeResponse => ({
      kind: "redirect",
      redirectUrl: url,
      headers: new FakeHeaders(),
    }),
  },
}));

import { middleware } from "./middleware";

type CookieJar = { get: (name: string) => { value: string } | undefined };

function makeRequest(
  pathname: string,
  cookies: Record<string, string> = {},
): {
  nextUrl: URL & { clone(): URL };
  cookies: CookieJar;
} {
  const url = new URL(`http://localhost${pathname}`);
  const clone = () => new URL(url.toString());
  Object.assign(url, { clone });
  const jar: CookieJar = {
    get: (name: string) =>
      name in cookies ? { value: cookies[name] } : undefined,
  };
  return { nextUrl: url as URL & { clone(): URL }, cookies: jar };
}

const SECRET = "x".repeat(48);
const ORIGINAL_SECRET = process.env.APP_SECRET;

const SECURITY_HEADER_KEYS = [
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Content-Security-Policy",
];

describe("middleware", () => {
  beforeEach(() => {
    unsealMock.mockReset();
    process.env.APP_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.APP_SECRET = ORIGINAL_SECRET;
  });

  it("passes through /login without checking the cookie", async () => {
    const response = (await middleware(
      makeRequest("/login") as unknown as Parameters<typeof middleware>[0],
    )) as unknown as FakeResponse;
    expect(response.kind).toBe("next");
    expect(unsealMock).not.toHaveBeenCalled();
    for (const key of SECURITY_HEADER_KEYS) {
      expect(response.headers.has(key)).toBe(true);
    }
  });

  it("passes through /api/ready without checking the cookie", async () => {
    const response = (await middleware(
      makeRequest("/api/ready") as unknown as Parameters<typeof middleware>[0],
    )) as unknown as FakeResponse;
    expect(response.kind).toBe("next");
    expect(unsealMock).not.toHaveBeenCalled();
    expect(response.headers.has("Content-Security-Policy")).toBe(true);
  });

  it("redirects an unauthenticated request to /login", async () => {
    const response = (await middleware(
      makeRequest("/catalog") as unknown as Parameters<typeof middleware>[0],
    )) as unknown as FakeResponse;
    expect(response.kind).toBe("redirect");
    expect(response.redirectUrl?.pathname).toBe("/login");
    for (const key of SECURITY_HEADER_KEYS) {
      expect(response.headers.has(key)).toBe(true);
    }
  });

  it("redirects an expired cookie (unseals to {}) to /login", async () => {
    unsealMock.mockResolvedValueOnce({});
    const response = (await middleware(
      makeRequest("/catalog", {
        pmad_session: "stale-seal",
      }) as unknown as Parameters<typeof middleware>[0],
    )) as unknown as FakeResponse;
    expect(response.kind).toBe("redirect");
    expect(response.redirectUrl?.pathname).toBe("/login");
  });

  it("redirects a tampered cookie (unseals throws) to /login", async () => {
    unsealMock.mockRejectedValueOnce(new Error("bad seal"));
    const response = (await middleware(
      makeRequest("/catalog", {
        pmad_session: "tampered",
      }) as unknown as Parameters<typeof middleware>[0],
    )) as unknown as FakeResponse;
    expect(response.kind).toBe("redirect");
    expect(response.redirectUrl?.pathname).toBe("/login");
  });

  it("lets an authenticated request through and stamps the security headers", async () => {
    unsealMock.mockResolvedValueOnce({ authenticated: true });
    const response = (await middleware(
      makeRequest("/catalog", {
        pmad_session: "good-seal",
      }) as unknown as Parameters<typeof middleware>[0],
    )) as unknown as FakeResponse;
    expect(response.kind).toBe("next");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toMatch(
      /frame-ancestors 'none'/,
    );
  });
});
