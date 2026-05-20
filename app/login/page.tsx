/**
 * The Login screen.
 *
 * A quiet, centered single-field form under the "Pick Me a Dinner" wordmark.
 * No tagline, no marketing copy — ADR-0002 is a household password gate, not
 * a sign-up funnel.
 */
import { LoginForm } from "./login-form";

// No DB read; mark dynamic to opt out of static prerendering during build.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-md">
      <div className="w-full max-w-sm flex flex-col items-stretch gap-lg">
        <h1 className="font-display text-h1 text-ink text-center">
          Pick Me a Dinner
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
