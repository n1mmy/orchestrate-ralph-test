# 06 — Shared-password auth gate

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The single-shared-password access gate (ADR-0002).

Build the **Login screen** (`/login`) — a quiet, centered single password field
under the wordmark "Pick Me a Dinner"; no tagline, no marketing copy.
`LoginForm` uses React 19 `useActionState`; a wrong password fills an inline
`role="alert"` error under the field and React resets the uncontrolled input,
clearing it. The `login` server action (`app/login/actions.ts`) compares the
submitted value against the plaintext `APP_PASSWORD` env var via
`passwordMatches` in `lib/password.ts` — `crypto.timingSafeEqual` over equal-
length buffers, a length mismatch short-circuiting to `false` (constant-time, no
hashing). On a match it establishes the session and `redirect("/")`; a wrong
password returns `{ error: "Incorrect password" }` — no lockout, no rate limit.
There is no logout UI in v1.

The session uses **`iron-session`**. `lib/session.ts` holds the `AppSession`
payload (`{ authenticated?: boolean }`), the cookie name (`pmad_session`), the
~180-day `SESSION_TTL_SECONDS`, and `sessionOptions()` — a sealed (encrypted +
signed) cookie keyed by `APP_SECRET` (which must be ≥ 32 chars), flags
`HttpOnly` / `Secure` / `SameSite=Lax` / `Path=/` set explicitly. `lib/
get-session.ts` reads the session via `next/headers` for server components and
actions. `lib/require-session.ts`'s `requireSession()` redirects an
unauthenticated caller to `/login`, and `lib/authed-action.ts`'s `authedAction`
wraps a server action so it runs only for an authenticated session —
**authentication is enforced in the action itself, not by middleware**, because
Next.js dispatches a Server Action by its `Next-Action` id regardless of route,
so a route gate alone leaves every action reachable anonymously. Wrap every
mutating action built in earlier tickets with `authedAction`; `login` is the
single deliberate exception (it cannot require a session — it starts one).

Add **Next.js middleware** (`middleware.ts`) that validates the sealed cookie
with `unsealData` on every route except `/login`, `/api/ready`, and the static
assets excluded by `config.matcher`, redirecting an unauthenticated or expired
request to `/login` (an expired seal unseals to `{}` and fails exactly like an
absent one). The middleware also stamps the §4 security headers onto every
response either way: `Strict-Transport-Security`, `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a
baseline `Content-Security-Policy` including `frame-ancestors 'none'`. The app
trusts `X-Forwarded-Proto` so `Secure` cookies survive behind the TLS-
terminating ingress proxy.

## Acceptance criteria

- [x] `/login` renders a centered single password field with the "Pick Me a
      Dinner" wordmark and no tagline
- [x] A correct password (`passwordMatches`, constant-time) establishes the
      sealed `iron-session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`,
      `Path=/`, ~180-day TTL) and redirects to `/`
- [x] A wrong password shows the inline "Incorrect password" error with the
      field cleared — no lockout
- [x] `middleware.ts` redirects an unauthenticated or expired request to
      `/login`; `/login`, `/api/ready`, and static assets are not gated
- [x] Every mutating server action is `authedAction`-wrapped (auth enforced in
      the action, since a Server Action is reachable by id from any route);
      `login` is the one exception
- [x] The §4 security headers are present on middleware responses
- [x] Tests: `lib/password.test.ts` (constant-time compare),
      `app/login/actions.test.ts` (correct password establishes the session,
      wrong password → inline error), `lib/require-session.test.ts`,
      `middleware.test.ts` (redirects an unauthenticated / expired request)

## Blocked by

- 03 — Options catalog: CRUD

## Comments

Implemented the iron-session-sealed shared-password gate end-to-end:
`lib/password.ts` (constant-time), `lib/session.ts` / `lib/get-session.ts` /
`lib/require-session.ts`, `lib/authed-action.ts` upgraded from pass-through to
real gate, `app/login/{page,login-form,actions}.tsx`, and `middleware.ts`
with the §4 security headers. Build needed a `webpack` shim in
`next.config.mjs` to keep `lib/schema-check.ts` (and its `postgres` import)
out of the Edge bundle that Next produces alongside `middleware.ts`.
