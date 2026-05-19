import { NextResponse, type NextRequest } from "next/server";
import { unsealData } from "iron-session";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type AppSession,
} from "@/lib/session";

/**
 * The route gate (ADR-0002, ticket 08). For every page request:
 *
 *   1. Stamp the §4 security headers on the response (every response, gated or
 *      not — they protect the login screen and ready probe too).
 *   2. If the request is for `/login` or `/api/ready`, pass it through.
 *   3. Otherwise, unseal the session cookie. An absent cookie unseals to `{}`;
 *      an expired seal also unseals to `{}` because `unsealData`'s `ttl` arg
 *      rejects stale data. Either way, no `authenticated` flag means redirect
 *      to `/login`.
 *
 * This middleware is **not** the auth boundary for mutating server actions —
 * a Server Action is dispatched by its `Next-Action` id and a route gate does
 * not protect it. See `lib/authed-action.ts` for the in-action enforcement.
 *
 * Edge-runtime constraint: `iron-session` exposes `unsealData` as a function
 * that works on Edge (no `node:crypto` use); the rest of the package's
 * `getIronSession` API does not. We deliberately call only `unsealData` here.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // The two open paths. `config.matcher` below already excludes static
  // assets; the runtime check belt-and-braces excludes the login screen and
  // the readiness probe.
  const isOpenPath = pathname === "/login" || pathname === "/api/ready";

  // `APP_SECRET` is asserted at boot by `checkEnvOnBoot`; here we treat its
  // absence defensively (an unsealed cookie can't authenticate, so redirect).
  const secret = process.env.APP_SECRET ?? "";

  let authenticated = false;
  if (secret.length >= 32) {
    const sealed = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sealed) {
      try {
        const data = await unsealData<AppSession>(sealed, {
          password: secret,
          ttl: SESSION_TTL_SECONDS,
        });
        authenticated = data.authenticated === true;
      } catch {
        // An expired or tampered seal throws; treat it exactly like no cookie.
        authenticated = false;
      }
    }
  }

  let response: NextResponse;
  if (!isOpenPath && !authenticated) {
    const loginUrl = new URL("/login", request.url);
    response = NextResponse.redirect(loginUrl);
  } else {
    response = NextResponse.next();
  }

  applySecurityHeaders(response);
  return response;
}

/**
 * The §4 security headers, stamped on every middleware response (whether the
 * request was gated, redirected, or passed through). HSTS opts the
 * TLS-terminating ingress into preload-eligible enforcement; the rest are
 * baseline OWASP recommendations.
 */
function applySecurityHeaders(response: NextResponse): void {
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
}

/**
 * Run on every request *except* the static-asset paths Next.js generates and
 * the `_next` build artefacts. `/api/ready` is gated at runtime above
 * (a matcher exclusion would also work, but the runtime guard keeps the
 * security-headers behaviour for the ready probe).
 *
 * `runtime: "nodejs"` opts the middleware into Node.js — Edge runtime would
 * otherwise pull `instrumentation.ts` (and its `postgres` / `node:fs` deps)
 * into the Edge bundle, which webpack cannot resolve.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
  runtime: "nodejs",
};
