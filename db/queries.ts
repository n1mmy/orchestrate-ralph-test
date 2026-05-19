import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "./index";
import { dinnerLog, options, optionTags, tags } from "./schema";
import type { RankLogEntry, RankOption } from "@/lib/ranking";
import { epochDayFromSqlDate } from "@/lib/local-day";

/**
 * A single Option as the Catalog screen consumes it — every column from the
 * `options` row plus the Option's Tag names (an empty array until ticket 03
 * lands the Tag CRUD; the join is wired now so the shape does not churn).
 */
export type CatalogOption = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  url: string | null;
  notes: string | null;
  active: boolean;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  mapsUrl: string | null;
  tags: string[];
};

/**
 * The Catalog as the Catalog screen renders it — active Options only
 * (`active = true`), ordered by name, split by kind. Archived Options are
 * deliberately excluded from the default Catalog list per CONTEXT.md's
 * Archived definition; a future Archived screen (ticket 26) loads them
 * separately.
 */
export type ActiveCatalog = {
  home: CatalogOption[];
  restaurants: CatalogOption[];
};

/**
 * Every Tag name in the Catalog, alphabetical. Feeds the `TagInput`
 * autocomplete on the Catalog screen — the suggestions list is the whole set
 * of existing Tags filtered client-side as the Household types. Names are
 * already canonical (`normalizeTag` runs on every write) so no normalization
 * step is needed here. Note: Tags that no longer have any Option attached
 * remain in the `tags` row store and so will appear here; per CONTEXT.md
 * that is harmless — they simply stop appearing on any Option.
 */
export async function getAllTagNames(): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(tags)
    .orderBy(asc(sql`lower(${tags.name})`));
  return rows.map((r) => r.name);
}

/**
 * Load the active Catalog: `active = true` Options ordered by name, each
 * carrying its Tag names. The Tag join is a left-join so an Option with no
 * Tags still appears.
 */
export async function getActiveCatalog(): Promise<ActiveCatalog> {
  const rows = await db
    .select({
      option: options,
      tagName: tags.name,
    })
    .from(options)
    .leftJoin(optionTags, eq(optionTags.optionId, options.id))
    .leftJoin(tags, eq(tags.id, optionTags.tagId))
    .where(eq(options.active, true))
    .orderBy(asc(options.name));

  const byId = new Map<string, CatalogOption>();
  for (const { option, tagName } of rows) {
    let entry = byId.get(option.id);
    if (!entry) {
      entry = {
        id: option.id,
        name: option.name,
        kind: option.kind,
        url: option.url,
        notes: option.notes,
        active: option.active,
        address: option.address,
        phone: option.phone,
        lat: option.lat,
        lng: option.lng,
        googlePlaceId: option.googlePlaceId,
        mapsUrl: option.mapsUrl,
        tags: [],
      };
      byId.set(option.id, entry);
    }
    if (tagName) entry.tags.push(tagName);
  }

  const all = Array.from(byId.values());
  return {
    home: all.filter((o) => o.kind === "home"),
    restaurants: all.filter((o) => o.kind === "restaurant"),
  };
}

/**
 * The two inputs the Tonight ranker needs:
 *
 * - **`options`** — the active Catalog, each Option carrying the fields the
 *   ranker reads (`id`, `name`, `kind`, `tags`) plus the two pass-through
 *   restaurant fields (`url`, `phone`) used by later phases.
 * - **`entries`** — non-future Log rows, joined to active Options only.
 *   Filtered to `eaten_on <= todaySql` so Planned dinners do not move the
 *   ranking, and joined inwardly to `options.active = true` so an Archived
 *   Option's history does not count (per CONTEXT.md's Recency definition).
 *
 * `eaten_on` is converted to an integer epoch-day at the boundary so the
 * downstream ranker sees only integers — no date arithmetic happens in SQL,
 * and DST cannot perturb the day delta. See ADR-0003 and `lib/local-day.ts`.
 */
export type TonightData = {
  options: RankOption[];
  entries: RankLogEntry[];
};

export async function getTonightData(todaySql: string): Promise<TonightData> {
  // Active Options with their Tags — left-joined so tagless Options still
  // appear. Same fan-out / re-grouping shape as `getActiveCatalog`.
  const optionRows = await db
    .select({
      id: options.id,
      name: options.name,
      kind: options.kind,
      url: options.url,
      phone: options.phone,
      tagName: tags.name,
    })
    .from(options)
    .leftJoin(optionTags, eq(optionTags.optionId, options.id))
    .leftJoin(tags, eq(tags.id, optionTags.tagId))
    .where(eq(options.active, true))
    .orderBy(asc(options.name));

  const byId = new Map<string, RankOption>();
  for (const row of optionRows) {
    let entry = byId.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        name: row.name,
        kind: row.kind,
        url: row.url,
        phone: row.phone,
        tags: [],
      };
      byId.set(row.id, entry);
    }
    if (row.tagName) entry.tags.push(row.tagName);
  }

  // Log entries: non-future, joined to active Options only.
  const logRows = await db
    .select({
      optionId: dinnerLog.optionId,
      eatenOn: dinnerLog.eatenOn,
    })
    .from(dinnerLog)
    .innerJoin(options, eq(options.id, dinnerLog.optionId))
    .where(and(eq(options.active, true), lte(dinnerLog.eatenOn, todaySql)));

  const entries: RankLogEntry[] = logRows.map((r) => ({
    optionId: r.optionId,
    eatenOn: epochDayFromSqlDate(r.eatenOn),
  }));

  return {
    options: Array.from(byId.values()),
    entries,
  };
}
