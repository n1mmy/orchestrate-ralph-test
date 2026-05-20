/**
 * Gate a server-side caller on an authenticated session. Redirects to
 * `/login` when no session is established. Used by server components and
 * (via `authedAction`) by every mutating server action.
 *
 * The redirect is deliberately the only failure mode — a route gate alone
 * is not enough because Next.js dispatches a Server Action by its
 * `Next-Action` id regardless of which page rendered it, so this check
 * must run inside the action itself.
 */
import { redirect } from "next/navigation";

import { getSession } from "./get-session";

export async function requireSession(): Promise<void> {
  const session = await getSession();
  if (!session.authenticated) {
    redirect("/login");
  }
}
