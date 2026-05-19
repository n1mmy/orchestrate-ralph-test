import { requireSession } from "./require-session";

/**
 * The auth gate every mutating server action passes through (ADR-0002,
 * ticket 08). A Server Action is dispatched by its `Next-Action` id from
 * *any* route — middleware can refuse to render an unauthenticated page, but
 * it cannot stop an unauthenticated POST from invoking the action by id. So
 * authentication has to be enforced **inside the action itself**, not at the
 * route. `authedAction` wraps a server action and calls `requireSession`
 * before invoking it — an unauthenticated dispatch is redirected to `/login`
 * (via `next/navigation`'s `redirect`, which throws `NEXT_REDIRECT` past the
 * wrapped action).
 *
 * The single deliberate exception is `login` itself — it cannot require a
 * session because it *starts* one.
 *
 * The wrapper is generic over the action's argument list and return type so
 * every call site keeps its existing type signature.
 */
export function authedAction<Args extends unknown[], R>(
  action: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    await requireSession();
    return action(...args);
  };
}
