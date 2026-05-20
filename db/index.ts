/**
 * Lazy Drizzle client.
 *
 * `postgres(connectionString)` does not open a socket until the first query,
 * so `next build` can render every data page (all `force-dynamic`) with no
 * live `DATABASE_URL`. The fall-back to `""` keeps the import side-effect
 * free at build time.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export const queryClient = postgres(process.env.DATABASE_URL ?? "");

export const db = drizzle(queryClient, { schema });

export { schema };
