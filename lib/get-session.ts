/**
 * Read (or establish) the sealed `iron-session` cookie from the current
 * server-side request. Used by server components and server actions —
 * anything that runs under `next/headers`.
 *
 * `getIronSession` is the canonical iron-session entry point for the Next.js
 * App Router; it returns a mutable session object whose `save()` and
 * `destroy()` methods write the response cookie. The shape is the
 * `AppSession` payload from `lib/session.ts`.
 */
import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";

import { type AppSession, sessionOptions } from "./session";

export async function getSession(): Promise<IronSession<AppSession>> {
  const cookieStore = await cookies();
  return getIronSession<AppSession>(cookieStore, sessionOptions());
}
