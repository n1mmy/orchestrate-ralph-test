import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Unit + component suite. Excludes the database integration suite
 * (`*.db.test.ts`) and any worktree caches under `.claude/worktrees`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "**/*.db.test.ts",
      "node_modules/**",
      ".next/**",
      ".claude/worktrees/**",
    ],
  },
});
