/**
 * Boot-time configuration check.
 *
 * `envProblems` is a pure inspector — given an environment, it returns the
 * list of human-readable problems. `checkEnvOnBoot` is the side-effecting
 * wrapper that the Next.js instrumentation hook calls: it logs every problem
 * loudly and exits non-zero on any. Exiting hard at boot is intentional — a
 * misconfigured pod must crash-loop visibly rather than serve broken
 * traffic.
 */

/** Env vars the app refuses to start without. */
const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "APP_SECRET",
  "APP_PASSWORD",
  "APP_TZ",
] as const;

/**
 * Returns true iff the given string is an IANA zone the runtime's `Intl`
 * accepts. We probe `DateTimeFormat` because `Intl.supportedValuesOf` is not
 * available on every supported runtime version.
 */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The slice of the environment this check inspects. A plain
 * `Record<string, string | undefined>` so tests can pass a literal without
 * faking the runtime-only `NODE_ENV` Node injects into `process.env`.
 */
export type EnvSnapshot = Record<string, string | undefined>;

/**
 * Inspect an environment snapshot and return every problem found. Pure: takes
 * an explicit env so tests do not have to mutate `process.env`.
 */
export function envProblems(env: EnvSnapshot = process.env): string[] {
  const problems: string[] = [];
  for (const key of REQUIRED_ENV_KEYS) {
    const value = env[key];
    if (value === undefined || value === "") {
      problems.push(`${key} is required but is not set`);
    }
  }
  const tz = env.APP_TZ;
  if (tz && !isValidTimeZone(tz)) {
    problems.push(
      `APP_TZ='${tz}' is not a valid IANA time zone recognised by the runtime`,
    );
  }
  return problems;
}

/**
 * The side-effecting boot gate. Logs every problem loudly and exits non-zero
 * on any. Returns `true` when the env is clean, so tests and callers can
 * branch on it without forcing a process exit.
 */
export function checkEnvOnBoot(
  env: EnvSnapshot = process.env,
  log: (msg: string) => void = (msg) => console.error(msg),
  exit: (code: number) => never = ((code: number) => {
    process.exit(code);
  }) as (code: number) => never,
): boolean {
  const problems = envProblems(env);
  if (problems.length === 0) return true;
  log("FATAL: refusing to start — invalid configuration:");
  for (const problem of problems) {
    log(`  - ${problem}`);
  }
  exit(1);
  return false;
}
