import { OptionSection } from "./option-section";
import type { ActiveCatalog } from "@/db/queries";

/**
 * The Catalog screen. Renders the two kinds as two `OptionSection`s — Home
 * meals and Restaurants — each row showing just the Option name with the
 * Edit / Archive / Delete actions; the Option name being a link to
 * `/catalog/[id]` is a later phase and is deliberately omitted here. An
 * empty Catalog falls back to the §17 empty-state copy.
 */
export function CatalogScreen({ catalog }: { catalog: ActiveCatalog }) {
  const empty =
    catalog.home.length === 0 && catalog.restaurants.length === 0;
  return (
    <main className="column">
      <h1 className="font-display text-h1 font-semibold">Catalog</h1>
      {empty ? (
        <p className="py-md text-body text-muted">
          Add a meal or restaurant to get started
        </p>
      ) : null}
      <OptionSection
        title="Home meals"
        kind="home"
        options={catalog.home}
        addLabel="+ Add a meal"
      />
      <OptionSection
        title="Restaurants"
        kind="restaurant"
        options={catalog.restaurants}
        addLabel="+ Add a restaurant"
      />
    </main>
  );
}
