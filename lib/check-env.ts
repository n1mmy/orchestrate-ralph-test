/**
 * Startup config check — the first of the two boot gates wired up from
 * `instrumentation.ts`. The contract is small and loud: if any required env
 * var is missing or `APP_TZ` is not an IANA zone the runtime's `Intl` will
 * accept, log every problem and `process.exit(1)` so the pod crash-loops
 * visibly instead of booting into a half-configured state.
 *
 * `envProblems` is pure (it just inspects `env`) so it can be unit-tested
 * without exiting the process; `checkEnvOnBoot` is the side-effectful wrapper
 * the instrumentation hook calls.
 */

const REQUIRED_VARS = ["DATABASE_URL", "APP_SECRET", "APP_PASSWORD", "APP_TZ"] as const;

/**
 * Returns true iff the runtime's `Intl.DateTimeFormat` accepts `tz` as an IANA
 * time zone identifier. Node 22 throws `RangeError` for unknown zones, which
 * is exactly the signal we want.
 */
export function isValidIanaZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspects `env` (defaulting to `process.env`) and returns one human-readable
 * problem string per fault, or an empty array if the config is clean.
 */
export function envProblems(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string[] {
  const problems: string[] = [];

  for (const key of REQUIRED_VARS) {
    const value = env[key];
    if (value === undefined || value === "") {
      problems.push(`${key} is required but is missing or empty`);
    }
  }

  const tz = env.APP_TZ;
  if (tz !== undefined && tz !== "" && !isValidIanaZone(tz)) {
    problems.push(
      `APP_TZ "${tz}" is not a valid IANA time zone (Intl.DateTimeFormat rejected it)`,
    );
  }

  return problems;
}

/**
 * Boot-time gate. Logs each problem loudly and exits the process with code 1
 * if there are any. Safe to call from `instrumentation.ts` — on a clean
 * config it returns silently.
 */
export function checkEnvOnBoot(): void {
  const problems = envProblems();
  if (problems.length === 0) return;

  // eslint-disable-next-line no-console
  console.error("[startup] env config check FAILED:");
  for (const problem of problems) {
    // eslint-disable-next-line no-console
    console.error(`[startup]   - ${problem}`);
  }
  // eslint-disable-next-line no-console
  console.error(
    "[startup] refusing to boot — fix the env vars above and restart the pod.",
  );
  process.exit(1);
}
