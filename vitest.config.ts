import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Unit / component suite — pure logic and React components. DB-free, so it
 * runs as part of the verification gate. The database integration suite
 * (`*.db.test.ts`) is excluded here and lives in `vitest.config.db.ts`.
 *
 * The `@/*` alias mirrors `tsconfig.json`'s `paths` so test files can import
 * project modules the same way component code does.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/*.db.test.ts",
      ".claude/worktrees/**",
    ],
  },
});
