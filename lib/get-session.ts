import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { type AppSession, sessionOptions } from "./session";

/**
 * Read the sealed session cookie via Next's `cookies()` store. Use this in
 * server components and server actions — anywhere the App Router exposes the
 * request cookies. The Edge middleware reads the same cookie with the
 * lower-level `unsealData`, since it never has access to the cookie store.
 *
 * An absent or expired cookie unseals to `{}` — callers should treat a
 * missing `authenticated` flag as "not signed in".
 */
export async function getSession(): Promise<AppSession> {
  const store = await cookies();
  return getIronSession<AppSession>(store, sessionOptions());
}
