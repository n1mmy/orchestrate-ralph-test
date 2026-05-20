/**
 * Shared `iron-session` config for the single-shared-password gate
 * (ADR-0002).
 *
 * Holds the `AppSession` payload, the cookie name, the TTL, and
 * `sessionOptions()` — a sealed (encrypted + signed) cookie keyed by
 * `APP_SECRET`. `APP_SECRET` must be ≥ 32 characters; the boot-time env
 * check (`lib/check-env.ts`) already refuses to start without it set, and
 * `sessionOptions()` throws if it is shorter (`iron-session` enforces this
 * itself).
 *
 * Cookie flags are set explicitly — not left to the iron-session defaults —
 * so a reader doesn't have to look up what the library picks:
 *   - `HttpOnly`     — JS cannot read the cookie
 *   - `Secure`       — only over HTTPS (the ingress trusts X-Forwarded-Proto)
 *   - `SameSite=Lax` — cross-site GETs are fine, cross-site POSTs are not
 *   - `Path=/`       — every route
 *
 * `SESSION_TTL_SECONDS` is ~180 days; long-lived on purpose for a single-
 * household kitchen-sink app — re-logging-in every few days would be hostile.
 */
import type { SessionOptions } from "iron-session";

export type AppSession = {
  authenticated?: boolean;
};

export const SESSION_COOKIE_NAME = "pmad_session";

/** ~180 days in seconds. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 180;

export function sessionOptions(): SessionOptions {
  const password = process.env.APP_SECRET ?? "";
  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}
