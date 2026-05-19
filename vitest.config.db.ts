import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Database integration suite — only `*.db.test.ts` files. Needs a live
 * Postgres server, so it is run via `pnpm test:db` and is deliberately kept
 * out of the worker verification gate. `fileParallelism: false` keeps the
 * shared test database from being raced; `globalSetup` creates and migrates a
 * per-worktree test database before the suite runs.
 *
 * The `@/*` alias mirrors `tsconfig.json`'s `paths`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.db.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", ".claude/worktrees/**"],
    fileParallelism: false,
    globalSetup: ["./db/test/global-setup.ts"],
  },
});
