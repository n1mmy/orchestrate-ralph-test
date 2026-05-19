import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit config. Migration files are generated into `./drizzle`, are
 * version-controlled, and are never applied automatically — `pnpm db:migrate`
 * (or the test `globalSetup`) applies them explicitly.
 */
export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
