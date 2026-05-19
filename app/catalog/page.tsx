import { getActiveCatalog, getAllTagNames } from "@/db/queries";
import { placesEnabled } from "@/lib/places";
import { CatalogScreen } from "./catalog-screen";

/**
 * `/catalog` is `force-dynamic` so no query fires at build time — the lazy
 * `postgres-js` client in `db/index.ts` opens no socket until the first
 * query, and this is the page that triggers it.
 *
 * `placesEnabled()` is read on the server so the Restaurant form can decide
 * whether to render the `PlacesSearchBox` at all — with no
 * `GOOGLE_PLACES_API_KEY` the box disappears and the form degrades cleanly
 * to manual entry.
 */
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const [catalog, tagSuggestions] = await Promise.all([
    getActiveCatalog(),
    getAllTagNames(),
  ]);
  return (
    <CatalogScreen
      catalog={catalog}
      tagSuggestions={tagSuggestions}
      placesEnabled={placesEnabled()}
    />
  );
}
