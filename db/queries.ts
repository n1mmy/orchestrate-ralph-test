/**
 * Read-side queries against the Catalog.
 *
 * `getActiveCatalog` powers the `/catalog` screen: every `active = true`
 * Option, name-ordered, split into the two Catalog sections (`home` /
 * `restaurants`) and each row carries the names of its Tags. The Tag join is
 * stubbed in this slice (ticket 04 wires up Tag attachment) — until then the
 * Tag arrays are empty.
 */
import { asc, eq } from "drizzle-orm";

import { db } from "./index";
import { options, optionTags, tags } from "./schema";

export type CatalogRow = {
  id: string;
  name: string;
  kind: "home" | "restaurant";
  url: string | null;
  notes: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  mapsUrl: string | null;
  tags: string[];
};

export type ActiveCatalog = {
  home: CatalogRow[];
  restaurants: CatalogRow[];
};

export async function getActiveCatalog(): Promise<ActiveCatalog> {
  const rows = await db
    .select({
      id: options.id,
      name: options.name,
      kind: options.kind,
      url: options.url,
      notes: options.notes,
      address: options.address,
      phone: options.phone,
      lat: options.lat,
      lng: options.lng,
      googlePlaceId: options.googlePlaceId,
      mapsUrl: options.mapsUrl,
    })
    .from(options)
    .where(eq(options.active, true))
    .orderBy(asc(options.name));

  // Tag names per Option. The join may yield no rows for any Option without
  // Tags; the result map carries empty arrays for those Options.
  const tagRows = await db
    .select({
      optionId: optionTags.optionId,
      name: tags.name,
    })
    .from(optionTags)
    .innerJoin(tags, eq(optionTags.tagId, tags.id));

  const tagsByOption = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagsByOption.get(row.optionId) ?? [];
    list.push(row.name);
    tagsByOption.set(row.optionId, list);
  }

  const home: CatalogRow[] = [];
  const restaurants: CatalogRow[] = [];
  for (const row of rows) {
    const enriched: CatalogRow = {
      ...row,
      tags: tagsByOption.get(row.id) ?? [],
    };
    if (row.kind === "home") {
      home.push(enriched);
    } else {
      restaurants.push(enriched);
    }
  }

  return { home, restaurants };
}
