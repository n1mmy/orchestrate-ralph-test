/**
 * Next.js instrumentation hook (server-side `register()`).
 *
 * Runs once per process start. We gate the boot here with two checks:
 *
 *   1. `checkEnvOnBoot` — required env vars and a valid `APP_TZ`.
 *   2. `checkSchemaOnBoot` — bundled migrations vs. the DB's applied count.
 *
 * Both run only in the Node.js runtime (`NEXT_RUNTIME === "nodejs"`); the
 * edge runtime has no Postgres client and would crash on the import.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkEnvOnBoot } = await import("./lib/check-env");
  checkEnvOnBoot();

  const { checkSchemaOnBoot } = await import("./lib/schema-check");
  // `checkEnvOnBoot` has already exited if `DATABASE_URL` is missing.
  await checkSchemaOnBoot(process.env.DATABASE_URL as string);
}
