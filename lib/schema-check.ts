/**
 * Boot-time schema check.
 *
 * Counts the migration files bundled in the image (from
 * `drizzle/meta/_journal.json`) and the migrations the DB has applied (from
 * `drizzle.__drizzle_migrations`). Decides:
 *
 *   - bundled === applied : OK, boot
 *   - bundled  >  applied : DB is BEHIND — crash-loop the pod visibly
 *   - bundled  <  applied : DB is AHEAD — tolerated, boot (rolling deploy)
 *   - DB unreachable      : log a warning and continue (the `/api/ready`
 *                           probe holds traffic off the pod until it can
 *                           reach the DB; a transient outage must not
 *                           crash-loop the fleet).
 *
 * A brand-new DB has neither the `drizzle` schema nor the
 * `__drizzle_migrations` table — that reads as zero applied migrations.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import postgres from "postgres";

export type SchemaCheckOutcome =
  | { kind: "ok"; bundled: number; applied: number }
  | { kind: "ahead"; bundled: number; applied: number }
  | { kind: "behind"; bundled: number; applied: number; message: string }
  | { kind: "unreachable"; bundled: number; error: string };

/**
 * Count the migration files the image carries. Reads `drizzle/meta/
 * _journal.json` — the manifest Drizzle Kit writes alongside the SQL files.
 */
export async function countBundledMigrations(
  journalPath: string = path.join(
    process.cwd(),
    "drizzle",
    "meta",
    "_journal.json",
  ),
): Promise<number> {
  const raw = await fs.readFile(journalPath, "utf8");
  const journal = JSON.parse(raw) as { entries?: unknown[] };
  return Array.isArray(journal.entries) ? journal.entries.length : 0;
}

/**
 * Count rows in `drizzle.__drizzle_migrations`. A missing schema or missing
 * table reads as zero, so a brand-new DB does not look like a failure.
 *
 * Connects with a short timeout — a boot-time DB outage should land in the
 * `unreachable` branch, not hang the pod.
 */
export async function countAppliedMigrations(
  databaseUrl: string,
): Promise<number> {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 1,
    onnotice: () => {},
  });
  try {
    const rows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM drizzle.__drizzle_migrations
    `;
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    // Missing schema (`3F000`) or missing table (`42P01`) -> brand-new DB.
    const code = (err as { code?: string } | null)?.code;
    if (code === "3F000" || code === "42P01") return 0;
    throw err;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

/**
 * Pure decision step. Given the two counts (and an optional unreachable
 * error), produce the outcome the boot gate should act on.
 */
export function decideSchemaOutcome(args: {
  bundled: number;
  applied: number | null;
  unreachableError?: string;
}): SchemaCheckOutcome {
  const { bundled, applied, unreachableError } = args;
  if (applied === null) {
    return {
      kind: "unreachable",
      bundled,
      error: unreachableError ?? "DB unreachable",
    };
  }
  if (applied < bundled) {
    const behindBy = bundled - applied;
    return {
      kind: "behind",
      bundled,
      applied,
      message: `DB schema ${behindBy} migrations behind — run drizzle-kit migrate`,
    };
  }
  if (applied > bundled) {
    return { kind: "ahead", bundled, applied };
  }
  return { kind: "ok", bundled, applied };
}

/**
 * Run the bundled-vs-applied comparison and return the decision. Swallows
 * connection errors into the `unreachable` branch; other errors propagate.
 */
export async function schemaCheckResult(
  databaseUrl: string,
  journalPath?: string,
): Promise<SchemaCheckOutcome> {
  const bundled = await countBundledMigrations(journalPath);
  let applied: number | null = null;
  let unreachableError: string | undefined;
  try {
    applied = await countAppliedMigrations(databaseUrl);
  } catch (err) {
    applied = null;
    unreachableError =
      err instanceof Error ? err.message : String(err);
  }
  return decideSchemaOutcome({ bundled, applied, unreachableError });
}

/**
 * The side-effecting boot gate. Logs per the outcome and exits non-zero only
 * on `behind`.
 */
export async function checkSchemaOnBoot(
  databaseUrl: string,
  log: {
    error: (msg: string) => void;
    warn: (msg: string) => void;
    info: (msg: string) => void;
  } = console,
  exit: (code: number) => never = ((code: number) => {
    process.exit(code);
  }) as (code: number) => never,
): Promise<SchemaCheckOutcome> {
  const outcome = await schemaCheckResult(databaseUrl);
  switch (outcome.kind) {
    case "ok":
      log.info(
        `schema-check: OK — ${outcome.applied}/${outcome.bundled} migrations applied`,
      );
      return outcome;
    case "ahead":
      log.warn(
        `schema-check: DB is ahead of this image (applied=${outcome.applied}, bundled=${outcome.bundled}) — tolerated`,
      );
      return outcome;
    case "unreachable":
      log.warn(
        `schema-check: DB unreachable at boot (${outcome.error}) — continuing; readiness probe will hold traffic`,
      );
      return outcome;
    case "behind":
      log.error(`FATAL: ${outcome.message}`);
      exit(1);
      return outcome;
  }
}
