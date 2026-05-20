import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Database integration suite. Only `*.db.test.ts` files; runs serially so the
 * single per-worktree test database is never touched by two workers at once.
 *
 * The global-setup creates and migrates a fresh test database scoped to this
 * worktree, so parallel workers do not collide.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["**/*.db.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".claude/worktrees/**"],
    fileParallelism: false,
    globalSetup: ["./test/db-global-setup.ts"],
  },
});
