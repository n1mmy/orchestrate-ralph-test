import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Unit / component suite — pure logic and React components. DB-free, so it
 * runs as part of the verification gate. The database integration suite
 * (`*.db.test.ts`) is excluded here and lives in `vitest.config.db.ts`.
 */
export default defineConfig({
  plugins: [react()],
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
