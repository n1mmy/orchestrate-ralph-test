/**
 * Next.js instrumentation hook — runs once at server start, before any request
 * is served. We use it to run the two startup gates in order:
 *
 *   1. `checkEnvOnBoot`     — fail loudly if the env is unusable.
 *   2. `runSchemaCheck`     — fail loudly if the DB schema is behind bundle.
 *
 * Edge runtime has no `node:fs` and no Postgres driver, so the gates only run
 * under `NEXT_RUNTIME === "nodejs"`. The Edge runtime is a no-op here.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkEnvOnBoot } = await import("./lib/check-env");
  checkEnvOnBoot();

  const { runSchemaCheck } = await import("./lib/schema-check");
  await runSchemaCheck(process.env.DATABASE_URL ?? "");
}
