import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The lazy database client. `postgres()` does not open a socket on
 * construction — the connection is established on the first query — so
 * importing this module is side-effect-free and `next build` runs with no
 * `DATABASE_URL` set. Every data page must be `force-dynamic` so no query
 * fires at build time.
 */
const client = postgres(process.env.DATABASE_URL ?? "");

export const db = drizzle(client, { schema });

export { schema };
