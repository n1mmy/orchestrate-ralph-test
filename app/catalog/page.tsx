import { getActiveCatalog, getAllTagNames } from "@/db/queries";
import { CatalogScreen } from "./catalog-screen";

/**
 * `/catalog` is `force-dynamic` so no query fires at build time — the lazy
 * `postgres-js` client in `db/index.ts` opens no socket until the first
 * query, and this is the page that triggers it.
 */
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const [catalog, tagSuggestions] = await Promise.all([
    getActiveCatalog(),
    getAllTagNames(),
  ]);
  return <CatalogScreen catalog={catalog} tagSuggestions={tagSuggestions} />;
}
