/**
 * Vitest global-setup for the database integration suite.
 *
 * Creates a per-worktree test database, applies all generated migrations,
 * and exposes its connection string on `process.env.DATABASE_URL` so the
 * lazy `db` client picks it up. The worktree-scoped name keeps parallel
 * Ralph workers from colliding on a shared instance.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

function worktreeDbName(): string {
  const root = process.cwd();
  const slug = createHash("sha1").update(root).digest("hex").slice(0, 12);
  return `pmd_test_${slug}`;
}

export async function setup(): Promise<void> {
  const adminUrl =
    process.env.TEST_DATABASE_ADMIN_URL ??
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/postgres";

  if (!adminUrl) {
    throw new Error(
      "db-global-setup: TEST_DATABASE_ADMIN_URL or DATABASE_URL must be set.",
    );
  }

  const dbName = worktreeDbName();
  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const testUrl = url.toString();
  process.env.DATABASE_URL = testUrl;

  const client = postgres(testUrl, { max: 1 });
  const db = drizzle(client);
  try {
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function teardown(): Promise<void> {
  // Leaving the per-worktree database in place between runs is harmless —
  // `setup` drops and re-creates it next time. No teardown work needed.
}
