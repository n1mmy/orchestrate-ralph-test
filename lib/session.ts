import type { SessionOptions } from "iron-session";

/**
 * The sealed (encrypted + signed) `iron-session` cookie that gates the app
 * (ADR-0002). The whole payload is a single `authenticated` flag — there is
 * no per-user identity to carry, because there are no users.
 *
 * `sessionOptions()` is a function rather than a constant so the
 * `APP_SECRET` length is checked at *call time* (the first request handler
 * that needs the cookie), not at module-import time — that lets unit tests
 * import this file without `APP_SECRET` set.
 */

/** The cookie name. Stable across deploys; flips on a manual rotation only. */
export const SESSION_COOKIE_NAME = "pmad_session";

/** ~180 days in seconds. The Household stays signed in across a typical season. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 180;

/** The minimum length of `APP_SECRET` `iron-session` will accept. */
export const SESSION_SECRET_MIN_LENGTH = 32;

/**
 * The shape of the sealed cookie payload. Optional `authenticated` because an
 * absent cookie unseals to `{}` — a cookie without the flag is equivalent to
 * no session at all.
 */
export type AppSession = {
  authenticated?: boolean;
};

/**
 * Build the `iron-session` options. Reads `APP_SECRET` lazily so this module
 * can be imported in environments where the env is not yet set (tests).
 */
export function sessionOptions(): SessionOptions {
  const password = process.env.APP_SECRET ?? "";
  if (password.length < SESSION_SECRET_MIN_LENGTH) {
    throw new Error(
      `APP_SECRET must be at least ${SESSION_SECRET_MIN_LENGTH} characters; got ${password.length}.`,
    );
  }
  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      // `iron-session` derives its own cookie `maxAge` from `ttl`; setting it
      // here would override that. The default is correct.
    },
  };
}
