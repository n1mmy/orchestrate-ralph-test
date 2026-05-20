// The Catalog is data, queried per request, so `force-dynamic` keeps it out
// of the static build and lets `next build` run without a live DATABASE_URL.
export const dynamic = "force-dynamic";

import { CatalogScreen } from "./catalog-screen";
import { getActiveCatalog, getAllTagNames } from "@/db/queries";

export default async function CatalogPage() {
  const [catalog, tagSuggestions] = await Promise.all([
    getActiveCatalog(),
    getAllTagNames(),
  ]);
  return <CatalogScreen catalog={catalog} tagSuggestions={tagSuggestions} />;
}
