/**
 * Startup schema check — the second boot gate wired from `instrumentation.ts`.
 *
 * Compares two numbers: the count of migrations bundled in the image
 * (`drizzle/meta/_journal.json#entries.length`) and the count of migrations
 * the DB has applied (`drizzle.__drizzle_migrations`, the table
 * `drizzle-kit migrate` maintains; a brand-new DB has neither the schema nor
 * the table, both of which read as zero).
 *
 * The decision is intentionally narrow:
 *
 *   - DB behind   — loud, specific error, exit 1 so the pod crash-loops
 *                   visibly until the operator runs `drizzle-kit migrate`.
 *   - DB even     — proceed.
 *   - DB ahead    — tolerated (a newer image was rolled back; the old code
 *                   still works against the newer schema).
 *   - DB unreachable — warn and continue; a transient outage must not crash-
 *                      loop the whole fleet. The `/api/ready` probe holds
 *                      traffic off the pod until the connection recovers.
 *
 * `schemaCheckResult` is the pure decision function (testable). `runSchemaCheck`
 * is the side-effectful wrapper that reads the journal, queries the DB, logs,
 * and exits.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SchemaCheckResult =
  | { kind: "even"; bundled: number; applied: number }
  | { kind: "ahead"; bundled: number; applied: number }
  | { kind: "behind"; bundled: number; applied: number; gap: number }
  | { kind: "unreachable"; bundled: number; reason: string };

/**
 * Pure decision: given the bundled migration count and either the applied
 * count or an unreachable-DB signal, return the result the boot gate acts on.
 */
export function schemaCheckResult(
  bundled: number,
  applied: number | { unreachable: true; reason: string },
): SchemaCheckResult {
  if (typeof applied !== "number") {
    return { kind: "unreachable", bundled, reason: applied.reason };
  }
  if (applied < bundled) {
    return { kind: "behind", bundled, applied, gap: bundled - applied };
  }
  if (applied > bundled) {
    return { kind: "ahead", bundled, applied };
  }
  return { kind: "even", bundled, applied };
}

/**
 * Reads `drizzle/meta/_journal.json` from the image and returns
 * `entries.length`. The journal is bundled into the runner image by the
 * Dockerfile precisely so this check can run without network.
 */
export function bundledMigrationCount(
  journalPath: string = join(process.cwd(), "drizzle", "meta", "_journal.json"),
): number {
  const raw = readFileSync(journalPath, "utf8");
  const parsed = JSON.parse(raw) as { entries?: unknown[] };
  return Array.isArray(parsed.entries) ? parsed.entries.length : 0;
}

/**
 * Queries `drizzle.__drizzle_migrations` for the applied-migration count. A
 * missing schema or missing table both read as `0` — that is the brand-new-DB
 * case, where the bundled migrations are about to be applied.
 *
 * Any other failure (host down, auth refused, network partition) is reported
 * as `unreachable` so the gate can warn-and-continue rather than crash-loop.
 */
export async function appliedMigrationCount(
  databaseUrl: string,
): Promise<number | { unreachable: true; reason: string }> {
  // Import lazily so unit tests can stub the postgres driver and so a missing
  // `DATABASE_URL` never blows up at module load.
  const { default: postgres } = await import("postgres");
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 1, connect_timeout: 5 });
  try {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count
      from drizzle.__drizzle_migrations
    `;
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 3F000 = invalid_schema_name, 42P01 = undefined_table — both mean
    // "drizzle migrations have never run here", which is a zero-applied DB,
    // not an unreachable one.
    if (code === "3F000" || code === "42P01") return 0;
    return {
      unreachable: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

/**
 * The side-effectful boot wrapper. Logs the result loudly and, on `behind`,
 * exits non-zero so the pod crash-loops visibly.
 */
export async function runSchemaCheck(databaseUrl: string): Promise<void> {
  const bundled = bundledMigrationCount();
  const applied = await appliedMigrationCount(databaseUrl);
  const result = schemaCheckResult(bundled, applied);

  switch (result.kind) {
    case "even":
      // eslint-disable-next-line no-console
      console.log(
        `[startup] schema-check: DB at current migration (${result.applied}/${result.bundled}).`,
      );
      return;
    case "ahead":
      // eslint-disable-next-line no-console
      console.warn(
        `[startup] schema-check: DB ahead of bundle (applied=${result.applied}, bundled=${result.bundled}) — tolerated.`,
      );
      return;
    case "unreachable":
      // eslint-disable-next-line no-console
      console.warn(
        `[startup] schema-check: DB unreachable at boot — continuing; /api/ready will hold traffic off the pod until the connection recovers. reason=${result.reason}`,
      );
      return;
    case "behind":
      // eslint-disable-next-line no-console
      console.error(
        `[startup] schema-check FAILED: DB schema ${result.gap} migrations behind — run drizzle-kit migrate (applied=${result.applied}, bundled=${result.bundled}).`,
      );
      process.exit(1);
  }
}
