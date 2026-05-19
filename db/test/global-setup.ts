import { execSync } from "node:child_process";
import postgres from "postgres";

/**
 * Vitest `globalSetup` for the database integration suite. Creates a
 * per-worktree test database (dropped and recreated for a clean slate) and
 * applies the version-controlled Drizzle migrations to it. Each worktree gets
 * its own database name so parallel Ralph workers never race a shared one.
 *
 * `DATABASE_URL` must point at a reachable Postgres server. The database
 * component of the URL is replaced with the per-worktree test database name;
 * the server, credentials, and port are taken from the URL as given.
 */

function deriveTestDbUrl(baseUrl: string): { adminUrl: string; testUrl: string; testDb: string } {
  const url = new URL(baseUrl);
  // A per-worktree name keeps parallel workers isolated.
  const worktree = process.cwd().split("/").pop() ?? "default";
  const safe = worktree.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const testDb = `pmad_test_${safe}`;
  const admin = new URL(url.toString());
  admin.pathname = "/postgres";
  const test = new URL(url.toString());
  test.pathname = `/${testDb}`;
  return { adminUrl: admin.toString(), testUrl: test.toString(), testDb };
}

export default async function setup() {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error(
      "DATABASE_URL must be set for the database integration suite (pnpm test:db).",
    );
  }

  const { adminUrl, testUrl, testDb } = deriveTestDbUrl(baseUrl);

  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${testDb}"`);
    await admin.unsafe(`CREATE DATABASE "${testDb}"`);
  } finally {
    await admin.end();
  }

  // Apply the version-controlled migrations to the fresh test database.
  execSync("pnpm drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });

  // Expose the test database URL to the suite's test files.
  process.env.DATABASE_URL = testUrl;
}
