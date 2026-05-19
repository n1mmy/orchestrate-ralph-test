"use server";

import { redirect } from "next/navigation";
import { passwordMatches } from "@/lib/password";
import { getSession } from "@/lib/get-session";

/**
 * Shape returned by the `login` server action to its `useActionState` caller.
 * On a wrong password the form shows `error` inline; on success the action
 * never returns — it `redirect()`s to `/`, which throws `NEXT_REDIRECT` past
 * `useActionState`.
 *
 * `login` is the deliberate exception to the `authedAction` rule (ADR-0002):
 * it cannot require a session, because it is what starts one.
 */
export type LoginState = { error?: string };

const WRONG_PASSWORD_MESSAGE = "Incorrect password";

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const submitted = formData.get("password");
  const password = typeof submitted === "string" ? submitted : "";
  const expected = process.env.APP_PASSWORD ?? "";

  if (!passwordMatches(password, expected)) {
    return { error: WRONG_PASSWORD_MESSAGE };
  }

  const session = await getSession();
  session.authenticated = true;
  // `getSession` returns the live iron-session proxy; assigning to it stages
  // the change, and `save()` writes the sealed Set-Cookie header onto the
  // response.
  await (session as unknown as { save(): Promise<void> }).save();
  redirect("/");
}
