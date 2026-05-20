/**
 * One-off importer for the prior version's Catalog and Log history.
 *
 * The prior app was Prisma-backed with three tables:
 *
 *   - `Meal`        — Home meal Options
 *   - `Restaurant`  — Restaurant Options
 *   - `Dinner`      — a Log entry (one Option eaten on one date)
 *
 * The v1 schema replaces those with `options` / `tags` / `option_tags` /
 * `dinner_log`. `mapPriorData` is the pure mapping layer; `runImport` wires
 * it to the live database inside a single transaction so any failure rolls
 * the whole import back. No upsert / idempotency machinery — re-run against
 * a fresh empty DB.
 *
 * Entry points: `argv[2]` is a JSON dump path; when `MIGRATE_FROM` is set
 * instead, the script reads straight from the prior Postgres instance.
 */
import { randomUUID } from "node:crypto";

import { db, queryClient } from "@/db";
import { dinnerLog, optionTags, options, tags } from "@/db/schema";
import { localMidnightUtc } from "@/lib/local-midnight";
import { normalizeTag } from "@/lib/normalize-tag";

export type PriorMeal = {
  id: string;
  name: string;
  notes?: string | null;
  tags?: string[] | null;
  hidden?: boolean | null;
  url?: string | null;
  createdAt: string | Date;
};

export type PriorRestaurant = {
  id: string;
  name: string;
  notes?: string | null;
  tags?: string[] | null;
  hidden?: boolean | null;
  phoneNumber?: string | null;
  orderUrl?: string | null;
  menuUrl?: string | null;
  createdAt: string | Date;
};

export type PriorDinner = {
  id: string;
  date: string;
  notes?: string | null;
  type?: string | null;
  mealId?: string | null;
  restaurantId?: string | null;
  createdAt?: string | Date | null;
};

export type PriorData = {
  meals: PriorMeal[];
  restaurants: PriorRestaurant[];
  dinners: PriorDinner[];
};

export type OptionInsert = {
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

export type TagInsert = { id: string; name: string };

export type OptionTagInsert = { optionId: string; tagId: string };

export type DinnerLogInsert = {
  id: string;
  optionId: string;
  eatenOn: string;
  note: string | null;
  createdAt: Date;
};

export type MappedImport = {
  options: OptionInsert[];
  tags: TagInsert[];
  optionTags: OptionTagInsert[];
  dinnerLog: DinnerLogInsert[];
};

function toDate(value: string | Date | null | undefined): Date {
  if (value == null) {
    throw new Error("mapPriorData: missing createdAt");
  }
  return value instanceof Date ? value : new Date(value);
}

function nullableString(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Take the `YYYY-MM-DD` head of a `Dinner.date`.
 *
 * The prior schema stored full timestamps; only the calendar date counts on
 * the way into v1's `dinner_log.eaten_on`. We keep just the first ten chars
 * after a sanity check.
 */
function ymdHead(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (!match) {
    throw new Error(`mapPriorData: not a YYYY-MM-DD head: ${value}`);
  }
  return match[1];
}

/**
 * Pure: maps `prior` to the v1 insert rows. No DB calls. A `Dinner` that
 * references neither a `Meal` nor a `Restaurant`, or an unresolvable id,
 * throws — the caller can run this outside the transaction to fail fast
 * before touching the DB.
 */
export function mapPriorData(
  prior: PriorData,
  timeZone: string,
): MappedImport {
  const optionsOut: OptionInsert[] = [];
  const optionIdByPriorId = new Map<string, string>();
  const optionKindByPriorId = new Map<string, "home" | "restaurant">();

  // Tag rows are shared across all Options — dedupe by canonical name.
  const tagIdByName = new Map<string, string>();
  const tagsOut: TagInsert[] = [];
  const optionTagsOut: OptionTagInsert[] = [];

  function ensureTag(rawName: string): string | null {
    const name = normalizeTag(rawName);
    if (name === "") return null;
    const existing = tagIdByName.get(name);
    if (existing) return existing;
    const id = randomUUID();
    tagIdByName.set(name, id);
    tagsOut.push({ id, name });
    return id;
  }

  function attachTags(optionId: string, rawTags: string[] | null | undefined) {
    if (!rawTags) return;
    const seen = new Set<string>();
    for (const raw of rawTags) {
      const id = ensureTag(raw);
      if (id == null) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      optionTagsOut.push({ optionId, tagId: id });
    }
  }

  for (const meal of prior.meals) {
    const newId = randomUUID();
    optionIdByPriorId.set(meal.id, newId);
    optionKindByPriorId.set(meal.id, "home");
    optionsOut.push({
      id: newId,
      name: meal.name,
      kind: "home",
      url: nullableString(meal.url),
      notes: nullableString(meal.notes),
      active: !(meal.hidden ?? false),
      createdAt: toDate(meal.createdAt),
      address: null,
      phone: null,
      lat: null,
      lng: null,
      googlePlaceId: null,
      mapsUrl: null,
    });
    attachTags(newId, meal.tags);
  }

  for (const restaurant of prior.restaurants) {
    const newId = randomUUID();
    optionIdByPriorId.set(restaurant.id, newId);
    optionKindByPriorId.set(restaurant.id, "restaurant");
    const url =
      nullableString(restaurant.orderUrl) ??
      nullableString(restaurant.menuUrl) ??
      null;
    optionsOut.push({
      id: newId,
      name: restaurant.name,
      kind: "restaurant",
      url,
      notes: nullableString(restaurant.notes),
      active: !(restaurant.hidden ?? false),
      createdAt: toDate(restaurant.createdAt),
      address: null,
      phone: nullableString(restaurant.phoneNumber),
      lat: null,
      lng: null,
      googlePlaceId: null,
      mapsUrl: null,
    });
    attachTags(newId, restaurant.tags);
  }

  const dinnerLogOut: DinnerLogInsert[] = [];
  for (const dinner of prior.dinners) {
    const priorOptionId = dinner.mealId ?? dinner.restaurantId ?? null;
    if (priorOptionId == null) {
      throw new Error(
        `mapPriorData: Dinner ${dinner.id} references neither a Meal nor a Restaurant`,
      );
    }
    const newOptionId = optionIdByPriorId.get(priorOptionId);
    if (newOptionId == null) {
      throw new Error(
        `mapPriorData: Dinner ${dinner.id} references unknown id ${priorOptionId}`,
      );
    }
    const eatenOn = ymdHead(dinner.date);
    dinnerLogOut.push({
      id: randomUUID(),
      optionId: newOptionId,
      eatenOn,
      note: nullableString(dinner.notes),
      // `dinner_log.created_at` defaults to the eaten date at local midnight
      // in `APP_TZ`. The prior `Dinner.createdAt` is intentionally dropped —
      // it logged when the row was *entered*, not when the dinner happened.
      createdAt: localMidnightUtc(eatenOn, timeZone),
    });
  }

  return {
    options: optionsOut,
    tags: tagsOut,
    optionTags: optionTagsOut,
    dinnerLog: dinnerLogOut,
  };
}

/**
 * Insert a `MappedImport` into the database inside a single transaction.
 * Any failure rolls every row back, leaving the database untouched.
 */
export async function insertMapped(mapped: MappedImport): Promise<void> {
  await db.transaction(async (tx) => {
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
}

/**
 * Run the import end-to-end: map first (outside the transaction, so a bad
 * FK fails fast without touching the DB), then insert all four tables
 * inside a single transaction.
 */
export async function runImport(
  prior: PriorData,
  timeZone: string,
): Promise<MappedImport> {
  const mapped = mapPriorData(prior, timeZone);
  await insertMapped(mapped);
  return mapped;
}

/**
 * Load the prior dataset straight from the live prior Postgres instance.
 *
 * Used when `MIGRATE_FROM` is set instead of a JSON dump path. The exact
 * connection-string lives in `MIGRATE_FROM`; the script does no fan-out, it
 * just executes three `SELECT *`s.
 */
export async function loadPriorDataFromDb(
  connectionString: string,
): Promise<PriorData> {
  const postgres = (await import("postgres")).default;
  const client = postgres(connectionString, { max: 1 });
  try {
    const meals = (await client`SELECT * FROM "Meal"`) as unknown as PriorMeal[];
    const restaurants = (await client`SELECT * FROM "Restaurant"`) as unknown as PriorRestaurant[];
    const dinners = (await client`SELECT * FROM "Dinner"`) as unknown as PriorDinner[];
    return { meals, restaurants, dinners };
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function loadPriorDataFromJson(path: string): Promise<PriorData> {
  const fs = await import("node:fs/promises");
  const raw = await fs.readFile(path, "utf8");
  return JSON.parse(raw) as PriorData;
}

/* c8 ignore start — CLI entry point exercised by hand, not by tests. */
async function main() {
  const timeZone = process.env.APP_TZ;
  if (!timeZone) {
    throw new Error("import-prior-data: APP_TZ must be set in .env");
  }
  const migrateFrom = process.env.MIGRATE_FROM;
  const prior = migrateFrom
    ? await loadPriorDataFromDb(migrateFrom)
    : await loadPriorDataFromJson(process.argv[2]);
  const mapped = await runImport(prior, timeZone);
  // eslint-disable-next-line no-console
  console.log(
    `Imported ${mapped.options.length} options, ${mapped.tags.length} tags, ${mapped.optionTags.length} option_tags, ${mapped.dinnerLog.length} dinner_log rows.`,
  );
  await queryClient.end({ timeout: 5 });
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
/* c8 ignore stop */
