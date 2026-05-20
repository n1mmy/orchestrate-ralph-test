"use client";

/**
 * The Login screen's single-field form.
 *
 * Uses React 19's `useActionState` so the `login` server action's return
 * value (`{ error }`) reaches the inline error region without a useState
 * dance. The form's `key` is bound to `attempt` — incremented on every
 * submit — so React unmounts and remounts the uncontrolled password input
 * after each round-trip, clearing the wrong value out of the DOM exactly
 * as the ticket requires.
 */
import { useActionState, useEffect, useState } from "react";

import { login, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL);
  const [attempt, setAttempt] = useState(0);

  // Every time the action returns (including a wrong-password error), bump
  // `attempt` so the form's `key` changes and React resets the uncontrolled
  // input. The `state` reference changes each call even on identical errors,
  // so this fires once per submit round-trip.
  useEffect(() => {
    setAttempt((n) => n + 1);
  }, [state]);

  return (
    <form
      key={attempt}
      action={formAction}
      noValidate
      className="flex flex-col gap-md"
    >
      <label htmlFor="password" className="sr-only">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        aria-invalid={state.error != null}
        aria-describedby={state.error ? "login-error" : undefined}
        className={[
          "min-h-[44px] w-full rounded-input border border-line bg-surface px-md py-sm",
          "text-body text-ink focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-ink",
        ].join(" ")}
      />
      {state.error ? (
        <p
          id="login-error"
          role="alert"
          className="text-meta text-danger"
        >
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={[
          "min-h-[44px] rounded-control bg-action px-lg py-sm",
          "text-body font-medium text-action-ink",
          "hover:bg-action-hover disabled:opacity-60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
        ].join(" ")}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
