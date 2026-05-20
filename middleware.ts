/**
 * Next.js middleware: route gate + security headers.
 *
 * On every request the middleware:
 *   1. Stamps the §4 security headers onto the response, regardless of
 *      whether the request is authenticated (an unauthenticated user sees
 *      the same hardened headers on the `/login` page they land on).
 *   2. For requests that are NOT explicitly public (`/login`, `/api/ready`,
 *      static assets — the last are excluded by `config.matcher` below),
 *      validates the sealed `iron-session` cookie. An expired or absent
 *      cookie unseals to `{}` and is treated the same — redirect to
 *      `/login`.
 *
 * **Authentication is also enforced inside every mutating server action**
 * (`authedAction`) — this middleware is the route-level belt, the action
 * wrapper is the suspenders. A Server Action is dispatched by its
 * `Next-Action` id regardless of which route the request hits, so a route
 * gate alone is not sufficient.
 *
 * `iron-session/edge`'s `unsealData` works in the Edge runtime; `getIronSession`
 * (the node-runtime entry) does not. We call `unsealData` directly here.
 */
import { unsealData } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type AppSession,
} from "@/lib/session";

const PUBLIC_PATHS = new Set<string>(["/login", "/api/ready"]);

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  // Baseline CSP: tight by default, includes frame-ancestors 'none'. Next.js's
  // runtime needs `'unsafe-inline'` for its bootstrap scripts in dev; this
  // baseline is the production-safe shape — refine per-screen later if needed.
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return false;
  const secret = process.env.APP_SECRET ?? "";
  if (secret.length < 32) return false;
  try {
    const payload = await unsealData<AppSession>(cookie.value, {
      password: secret,
      ttl: SESSION_TTL_SECONDS,
    });
    return Boolean(payload?.authenticated);
  } catch {
    // An expired seal unseals to `{}`; a tampered seal throws. Both are
    // treated as "no session".
    return false;
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (await isAuthenticated(request)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return applySecurityHeaders(NextResponse.redirect(loginUrl));
}

export const config = {
  // Skip Next internals and static assets — everything else flows through
  // the gate above. `/api/ready` is allowed through inside `middleware()`.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|otf|css|js|map)$).*)",
  ],
};
