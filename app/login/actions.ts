"use server";

/**
 * Login server action.
 *
 * The single deliberate exception to the `authedAction` rule — `login`
 * starts a session, so it cannot require one. Compares the submitted
 * password against `APP_PASSWORD` in constant time (`passwordMatches`),
 * and on success establishes the sealed `iron-session` cookie and
 * redirects to `/`. On failure it returns `{ error: "Incorrect password" }`
 * — no lockout, no rate limit (ADR-0002).
 *
 * Signature is shaped for `useActionState`: `(prevState, formData) => state`.
 */
import { redirect } from "next/navigation";

import { getSession } from "@/lib/get-session";
import { passwordMatches } from "@/lib/password";

export type LoginState = { error: string | null };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const submitted = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD ?? "";

  if (expected === "" || !passwordMatches(submitted, expected)) {
    return { error: "Incorrect password" };
  }

  const session = await getSession();
  session.authenticated = true;
  await session.save();

  redirect("/");
}
