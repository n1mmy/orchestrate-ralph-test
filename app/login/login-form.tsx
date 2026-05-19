"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

/**
 * The single-field login form. Uses React 19's `useActionState` so the server
 * action's returned `error` lands directly in component state without a
 * `useTransition` dance.
 *
 * Wrong-password handling: the server action returns `{ error: "Incorrect
 * password" }`; the inline `role="alert"` paragraph picks it up and React's
 * form-reset on a server action also clears the uncontrolled input. The
 * deliberate `key={errorNonce}` increment forces React to remount the input
 * on every error so the field is empty on the next attempt even when the
 * browser would otherwise preserve its value.
 */
const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  // A new `key` on the input remounts it on every wrong-password response,
  // which empties the uncontrolled field — the "field cleared" acceptance
  // criterion. `state.error ?? ""` keeps the key stable on success.
  const errorKey = state.error ? `wrong-${(state as { _n?: number })._n ?? 0}-${state.error}` : "ok";

  return (
    <form action={formAction} className="flex flex-col gap-md" noValidate>
      <label htmlFor="password" className="sr-only">
        Password
      </label>
      <input
        key={errorKey}
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "login-error" : undefined}
        className="block w-full min-h-[44px] rounded-input border border-line bg-surface px-md py-xs text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
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
        className="min-h-[44px] rounded-control bg-action px-md py-xs text-body font-semibold text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50"
      >
        Sign in
      </button>
    </form>
  );
}
