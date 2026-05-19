/**
 * One-off prior-version data import. The previous app was a Prisma project
 * with `Meal` / `Restaurant` / `Dinner` tables; this script maps those into
 * the v1 `options` / `tags` / `option_tags` / `dinner_log` schema and writes
 * them in a single transaction.
 *
 * Two pieces of machinery:
 *
 *  - `mapPriorData(prior, timeZone)` — pure. Rewires the prior cuid string
 *    ids onto fresh uuids, inverts `hidden` to `active`, coalesces
 *    `orderUrl` / `menuUrl` into one `url`, and normalises Tags via the
 *    shared `normalizeTag` helper that the Catalog tag-attach path also
 *    uses (so the two call sites cannot drift). A `Dinner` row referencing
 *    neither a `Meal` nor a `Restaurant`, or an unresolvable id, throws —
 *    that throw runs before any DB write, so a bad input never half-writes.
 *
 *  - `runImport(prior, timeZone, database)` — maps first (outside the
 *    transaction so a bad FK fails fast), then inserts all four tables
 *    inside `database.transaction`. Any failure rolls the whole import back;
 *    after fixing the offending row the script is simply re-run from
 *    scratch against the empty DB. There is no upsert / idempotency
 *    machinery.
 *
 * Input arrives one of two ways: a JSON dump path on `argv[2]`, or the live
 * prior Postgres DB read directly via `loadPriorDataFromDb` when
 * `MIGRATE_FROM` is set. `DATABASE_URL` and `APP_TZ` come from `.env`.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { dinnerLog, optionTags, options, tags } from "@/db/schema";
import { normalizeTag } from "@/lib/normalize-tag";

/** Shape of a `Meal` row from the prior Prisma schema. */
export type PriorMeal = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: Date;
  hidden: boolean;
  tags: string[];
};

/** Shape of a `Restaurant` row from the prior Prisma schema. */
export type PriorRestaurant = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: Date;
  hidden: boolean;
  tags: string[];
  phoneNumber: string | null;
  orderUrl: string | null;
  menuUrl: string | null;
};

/** Shape of a `Dinner` row from the prior Prisma schema. */
export type PriorDinner = {
  id: string;
  date: string;
  notes: string | null;
  type: "meal" | "restaurant" | string;
  mealId: string | null;
  restaurantId: string | null;
};

/** The whole prior dataset, as supplied to `mapPriorData` / `runImport`. */
export type PriorData = {
  meals: PriorMeal[];
  restaurants: PriorRestaurant[];
  dinners: PriorDinner[];
};

/** v1 insert row for `options`. */
export type OptionRow = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  url: string | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  mapsUrl: string | null;
};

/** v1 insert row for `tags`. */
export type TagRow = { id: string; name: string };

/** v1 insert row for `option_tags`. */
export type OptionTagRow = { optionId: string; tagId: string };

/** v1 insert row for `dinner_log`. */
export type DinnerLogRow = {
  id: string;
  optionId: string;
  eatenOn: string;
  note: string | null;
  createdAt: Date;
};

/** The full mapped result of `mapPriorData`. */
export type MappedImport = {
  options: OptionRow[];
  tags: TagRow[];
  optionTags: OptionTagRow[];
  dinnerLog: DinnerLogRow[];
};

/**
 * The UTC `Date` for local midnight on `dateStr` (a `YYYY-MM-DD`) in
 * `timeZone`.
 *
 * Two passes because the zone's offset itself depends on which date we are
 * resolving — a date whose midnight straddles a DST change needs the
 * offset that applies *at midnight*, not at noon UTC. The first pass uses
 * the offset at noon UTC of that date to land somewhere near the target
 * wall time; the second pass reads the offset at *that* instant and
 * corrects, which is enough for any single-step DST transition in a real
 * IANA zone.
 */
export function localMidnightUtc(dateStr: string, timeZone: string): Date {
  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  // Offset (in minutes, positive = ahead of UTC) of `timeZone` at the
  // given instant. We extract it by formatting that instant as both UTC
  // and the target zone, then differencing.
  function offsetMinutesAt(instant: Date): number {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) === 24 ? 0 : Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return Math.round((asUtc - instant.getTime()) / 60000);
  }

  // Pass 1: pretend the zone's offset at noon UTC applies at midnight.
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const offset1 = offsetMinutesAt(new Date(noonUtc));
  const guess1 = Date.UTC(year, month - 1, day, 0, 0, 0) - offset1 * 60000;
  // Pass 2: re-read the offset at the guessed instant — covers the DST
  // case where midnight is on the other side of the transition from noon.
  const offset2 = offsetMinutesAt(new Date(guess1));
  const guess2 = Date.UTC(year, month - 1, day, 0, 0, 0) - offset2 * 60000;
  return new Date(guess2);
}

/**
 * Map the prior dataset into v1 insert rows.
 *
 * Pure: no I/O, no DB access. Throws on a malformed `Dinner` (one that
 * references neither a `Meal` nor a `Restaurant`, or an unresolvable id) so
 * the bad input fails before any DB write begins.
 */
export function mapPriorData(prior: PriorData, timeZone: string): MappedImport {
  const optionRows: OptionRow[] = [];
  const optionIdByPriorId = new Map<string, string>();

  // Tag rows are deduped globally by canonical name; per-Option dedupe of
  // option_tag pairs uses the (optionId, tagId) tuple.
  const tagIdByCanonical = new Map<string, string>();
  const tagRows: TagRow[] = [];
  const optionTagRows: OptionTagRow[] = [];
  const seenOptionTag = new Set<string>();

  function ensureTagId(canonical: string): string {
    const existing = tagIdByCanonical.get(canonical);
    if (existing !== undefined) return existing;
    const id = randomUUID();
    tagIdByCanonical.set(canonical, id);
    tagRows.push({ id, name: canonical });
    return id;
  }

  function attachTags(optionId: string, rawTags: string[]): void {
    // Per-Option dedupe via a `Set` of canonical names, so attaching
    // ["Pasta", "pasta"] yields one option_tag row.
    const canonical = Array.from(
      new Set(rawTags.map(normalizeTag).filter((t) => t !== "")),
    );
    for (const name of canonical) {
      const tagId = ensureTagId(name);
      const key = `${optionId}:${tagId}`;
      if (seenOptionTag.has(key)) continue;
      seenOptionTag.add(key);
      optionTagRows.push({ optionId, tagId });
    }
  }

  // Meals → Home meal Options. Home meals have no `url` (the prior schema
  // never carried one), so it is `null`.
  for (const meal of prior.meals) {
    const id = randomUUID();
    optionIdByPriorId.set(meal.id, id);
    optionRows.push({
      id,
      name: meal.name,
      kind: "home",
      url: null,
      notes: meal.notes,
      active: !meal.hidden,
      createdAt: meal.createdAt instanceof Date
        ? meal.createdAt
        : new Date(meal.createdAt),
      address: null,
      phone: null,
      lat: null,
      lng: null,
      googlePlaceId: null,
      mapsUrl: null,
    });
    attachTags(id, meal.tags ?? []);
  }

  // Restaurants → Restaurant Options. `url` coalesces orderUrl ?? menuUrl;
  // the prior app never populated both. The Google-Places fields the v1
  // schema carries (`address`, `lat`, `lng`, `google_place_id`, `maps_url`)
  // do not exist in the prior schema — import as `null`.
  for (const r of prior.restaurants) {
    const id = randomUUID();
    optionIdByPriorId.set(r.id, id);
    optionRows.push({
      id,
      name: r.name,
      kind: "restaurant",
      url: r.orderUrl ?? r.menuUrl ?? null,
      notes: r.notes,
      active: !r.hidden,
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
      address: null,
      phone: r.phoneNumber,
      lat: null,
      lng: null,
      googlePlaceId: null,
      mapsUrl: null,
    });
    attachTags(id, r.tags ?? []);
  }

  // Dinners → Log entries. Each Dinner must reference exactly one of
  // `mealId` / `restaurantId`; an unresolvable id (one not in
  // `optionIdByPriorId`) is a fatal data-quality bug and throws here, in
  // pure code, before `runImport` opens its transaction.
  const dinnerRows: DinnerLogRow[] = [];
  for (const d of prior.dinners) {
    const priorOptionId = d.mealId ?? d.restaurantId;
    if (priorOptionId === null || priorOptionId === undefined) {
      throw new Error(
        `Dinner ${d.id} (date ${d.date}) references neither a Meal nor a Restaurant`,
      );
    }
    const optionId = optionIdByPriorId.get(priorOptionId);
    if (optionId === undefined) {
      throw new Error(
        `Dinner ${d.id} (date ${d.date}) references unknown Option id ${priorOptionId}`,
      );
    }
    // `Dinner.date` is stored as an ISO string with a time component; the
    // `YYYY-MM-DD` head is what the v1 `date` column wants.
    const eatenOn = d.date.slice(0, 10);
    dinnerRows.push({
      id: randomUUID(),
      optionId,
      eatenOn,
      note: d.notes,
      createdAt: localMidnightUtc(eatenOn, timeZone),
    });
  }

  return {
    options: optionRows,
    tags: tagRows,
    optionTags: optionTagRows,
    dinnerLog: dinnerRows,
  };
}

/**
 * The `db.transaction` callback parameter type — the transaction-scoped
 * Drizzle handle. Matches the shape `app/catalog/actions.ts` uses.
 */
type Tx = Parameters<Parameters<typeof defaultDb.transaction>[0]>[0];

/** The minimal slice of `db` `runImport` needs — keeps tests injectable. */
export type ImportDb = {
  transaction: <T>(cb: (tx: Tx) => Promise<T>) => Promise<T>;
};

/**
 * Run the import end-to-end. Mapping runs first, outside the transaction,
 * so a malformed Dinner throws without touching the DB; the four-table
 * write then runs inside a single `database.transaction` so any DB-level
 * failure rolls the whole import back, leaving the DB untouched. There is
 * no upsert / idempotency — a fresh DB is the contract.
 */
export async function runImport(
  prior: PriorData,
  timeZone: string,
  database: ImportDb = defaultDb,
): Promise<MappedImport> {
  // 1. Map. Pure; throws before we open the transaction if the input is bad.
  const mapped = mapPriorData(prior, timeZone);

  // 2. Insert, all four tables, one transaction.
  await database.transaction(async (tx) => {
    if (mapped.options.length > 0) {
      await tx.insert(options).values(mapped.options);
    }
    if (mapped.tags.length > 0) {
      await tx.insert(tags).values(mapped.tags);
    }
    if (mapped.optionTags.length > 0) {
      await tx.insert(optionTags).values(mapped.optionTags);
    }
    if (mapped.dinnerLog.length > 0) {
      await tx.insert(dinnerLog).values(mapped.dinnerLog);
    }
  });

  return mapped;
}

/**
 * Read the prior dataset live from the prior Postgres database at `url`.
 * Used when `MIGRATE_FROM` is set instead of a JSON dump path.
 *
 * The prior app's column names follow Prisma's default `camelCase →
 * snake_case` convention; the queries select them explicitly so the
 * returned shape lines up with `PriorMeal` / `PriorRestaurant` /
 * `PriorDinner`.
 */
export async function loadPriorDataFromDb(url: string): Promise<PriorData> {
  const sql = postgres(url, { max: 1 });
  try {
    const mealRows = await sql<
      Array<{
        id: string;
        name: string;
        notes: string | null;
        created_at: Date;
        hidden: boolean;
        tags: string[];
      }>
    >`select id, name, notes, "createdAt" as created_at, hidden, tags from "Meal"`;
    const restaurantRows = await sql<
      Array<{
        id: string;
        name: string;
        notes: string | null;
        created_at: Date;
        hidden: boolean;
        tags: string[];
        phone_number: string | null;
        order_url: string | null;
        menu_url: string | null;
      }>
    >`select id, name, notes, "createdAt" as created_at, hidden, tags,
        "phoneNumber" as phone_number, "orderUrl" as order_url, "menuUrl" as menu_url
      from "Restaurant"`;
    const dinnerRows = await sql<
      Array<{
        id: string;
        date: string;
        notes: string | null;
        type: string;
        meal_id: string | null;
        restaurant_id: string | null;
      }>
    >`select id, date::text as date, notes, type,
        "mealId" as meal_id, "restaurantId" as restaurant_id
      from "Dinner"`;
    return {
      meals: mealRows.map((m) => ({
        id: m.id,
        name: m.name,
        notes: m.notes,
        createdAt: m.created_at,
        hidden: m.hidden,
        tags: m.tags ?? [],
      })),
      restaurants: restaurantRows.map((r) => ({
        id: r.id,
        name: r.name,
        notes: r.notes,
        createdAt: r.created_at,
        hidden: r.hidden,
        tags: r.tags ?? [],
        phoneNumber: r.phone_number,
        orderUrl: r.order_url,
        menuUrl: r.menu_url,
      })),
      dinners: dinnerRows.map((d) => ({
        id: d.id,
        date: d.date,
        notes: d.notes,
        type: d.type,
        mealId: d.meal_id,
        restaurantId: d.restaurant_id,
      })),
    };
  } finally {
    await sql.end();
  }
}

/**
 * Reify a JSON-dump-shaped object into the typed `PriorData` shape — the
 * only fix-up needed is that `createdAt` arrives as an ISO string in JSON
 * and the rest of the script expects a `Date`.
 */
export function reifyPriorJson(raw: unknown): PriorData {
  const obj = raw as {
    meals?: Array<PriorMeal & { createdAt: string | Date }>;
    restaurants?: Array<PriorRestaurant & { createdAt: string | Date }>;
    dinners?: PriorDinner[];
  };
  return {
    meals: (obj.meals ?? []).map((m) => ({
      ...m,
      createdAt: m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt),
    })),
    restaurants: (obj.restaurants ?? []).map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
    })),
    dinners: obj.dinners ?? [],
  };
}

/**
 * Script entry point. Reads `APP_TZ` from the env, the prior dataset from
 * either a JSON dump (`argv[2]`) or the live prior DB (`MIGRATE_FROM`),
 * and writes into the v1 DB pointed at by `DATABASE_URL`.
 *
 * Wrapped in a top-level `if` so importing this file from tests does not
 * run the entry point.
 */
async function main(): Promise<void> {
  const timeZone = process.env.APP_TZ;
  if (timeZone === undefined || timeZone === "") {
    throw new Error("APP_TZ is required");
  }

  const dumpPath = process.argv[2];
  const migrateFrom = process.env.MIGRATE_FROM;

  let prior: PriorData;
  if (dumpPath !== undefined && dumpPath !== "") {
    prior = reifyPriorJson(JSON.parse(readFileSync(dumpPath, "utf8")));
  } else if (migrateFrom !== undefined && migrateFrom !== "") {
    prior = await loadPriorDataFromDb(migrateFrom);
  } else {
    throw new Error(
      "Pass a JSON dump path as argv[2] or set MIGRATE_FROM to the prior DB URL",
    );
  }

  // Build a dedicated client so we can `.end()` it cleanly when the import
  // finishes — the lazy `@/db` client has no public close handle.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") {
    throw new Error("DATABASE_URL is required");
  }
  const client = postgres(databaseUrl, { max: 1 });
  const local = drizzle(client, { schema });
  try {
    const mapped = await runImport(prior, timeZone, local);
    // eslint-disable-next-line no-console
    console.log(
      `Imported ${mapped.options.length} options, ${mapped.tags.length} tags, ` +
        `${mapped.optionTags.length} option_tags, ${mapped.dinnerLog.length} dinner_log rows.`,
    );
  } finally {
    await client.end();
  }
}

// Only run the entry point when executed directly, not when imported by the
// test suite. `import.meta.url` matches `process.argv[1]` only in the
// direct-execution case.
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
