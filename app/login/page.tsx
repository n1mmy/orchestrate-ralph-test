import { LoginForm } from "./login-form";

/**
 * `/login` — the single-shared-password gate (ADR-0002). A quiet, centered
 * stack: the "Pick Me a Dinner" wordmark and one password field below it.
 * No tagline, no marketing copy — the screen is the door, not the lobby.
 *
 * `force-dynamic` keeps Next from prerendering the page at build time (it
 * touches `cookies()` indirectly through the action, but the form itself is
 * a client component — pinning the route to dynamic is the cheapest way to
 * make this an explicit decision rather than a fragile inferred one).
 */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="column flex min-h-screen flex-col items-center justify-center gap-xl py-3xl">
      <h1 className="font-display text-h1 font-semibold text-ink">
        Pick Me a Dinner
      </h1>
      <div className="w-full">
        <LoginForm />
      </div>
    </main>
  );
}
