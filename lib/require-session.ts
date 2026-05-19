import { redirect } from "next/navigation";
import { getSession } from "./get-session";

/**
 * Server-side route guard. Redirects an unauthenticated caller to `/login`
 * via `next/navigation`'s `redirect`, which throws a `NEXT_REDIRECT` error
 * up the React render tree — control never returns to the caller on the
 * unauthenticated path.
 *
 * Middleware enforces this for every page render up front; `requireSession`
 * is the inner belt-and-braces for any server component or server action that
 * wants to assert the session locally (and is what `authedAction` uses to
 * enforce auth on the Server-Action endpoint itself, since middleware does
 * not gate Server Action dispatches — see `authed-action.ts`).
 */
export async function requireSession(): Promise<void> {
  const session = await getSession();
  if (!session.authenticated) {
    redirect("/login");
  }
}
