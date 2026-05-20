import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit config. Migration files are version-controlled and applied by
 * hand (or by the test global-setup) — nothing applies them automatically.
 */
export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
