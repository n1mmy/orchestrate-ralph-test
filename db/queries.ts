import { asc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { options, optionTags, tags } from "./schema";

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
