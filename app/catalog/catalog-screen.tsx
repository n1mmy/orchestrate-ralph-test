import { OptionSection } from "./option-section";
import type { ActiveCatalog } from "@/db/queries";

type Props = {
  catalog: ActiveCatalog;
  tagSuggestions: string[];
  /**
   * Whether `GOOGLE_PLACES_API_KEY` is set on the server. When false, the
   * Restaurant form's `PlacesSearchBox` is not rendered at all and the
   * form degrades to plain manual entry. Resolved in the server component
   * (`page.tsx`) and threaded down so this client tree never sees the key.
   */
  placesEnabled: boolean;
};

/**
 * Catalog screen — two sections, one for Home meals and one for Restaurants.
 * Identical on phone and desktop (a single `.column`). Empty Catalog shows
 * the §17 placeholder line.
 */
export function CatalogScreen({ catalog, tagSuggestions, placesEnabled }: Props) {
  const empty = catalog.home.length === 0 && catalog.restaurants.length === 0;

  return (
    <main className="column">
      <h1 className="py-lg font-display text-h1 text-ink">Catalog</h1>
      {empty ? (
        <p className="text-body text-muted">
          Add a meal or restaurant to get started.
        </p>
      ) : null}
      <OptionSection
        title="Home meals"
        kind="home"
        rows={catalog.home}
        addLabel="+ Add a meal"
        tagSuggestions={tagSuggestions}
        placesEnabled={placesEnabled}
      />
      <OptionSection
        title="Restaurants"
        kind="restaurant"
        rows={catalog.restaurants}
        addLabel="+ Add a restaurant"
        tagSuggestions={tagSuggestions}
        placesEnabled={placesEnabled}
      />
    </main>
  );
}
