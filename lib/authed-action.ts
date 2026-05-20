/**
 * Call-site wrapper for server actions that require the Household to be
 * signed in.
 *
 * Authentication is enforced **inside the action**, not by middleware:
 * Next.js dispatches a Server Action by its `Next-Action` id regardless of
 * which route's HTTP path the request hits, so a route-level middleware
 * gate alone leaves every action reachable anonymously. Every mutating
 * action wraps itself in `authedAction`; `login` is the one deliberate
 * exception (it cannot require a session — it starts one).
 *
 * `requireSession()` redirects to `/login` when unauthenticated, which in
 * a server-action context aborts the call with a `NEXT_REDIRECT` — the
 * inner action does not run.
 */
import { requireSession } from "./require-session";

export function authedAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    await requireSession();
    return action(...args);
  };
}
