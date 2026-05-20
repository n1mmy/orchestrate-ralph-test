import Link from "next/link";

import { OptionSection } from "./option-section";
import type { ActiveCatalog, ArchivedOption } from "@/db/queries";

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
  /**
   * Archived (`active = false`) Options, alphabetical. Pinned to the
   * bottom of the screen in a collapsed "Archived (N)" disclosure; the
   * disclosure does not render at all when nothing is Archived, so the
   * active Catalog reads exactly as before.
   */
  archived: ArchivedOption[];
};

/**
 * Catalog screen — two sections, one for Home meals and one for Restaurants.
 * Identical on phone and desktop (a single `.column`). Empty Catalog shows
 * the §17 placeholder line. An optional "Archived" disclosure sits at the
 * bottom and links each Archived Option back into its detail page.
 */
export function CatalogScreen({
  catalog,
  tagSuggestions,
  placesEnabled,
  archived,
}: Props) {
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
      {archived.length > 0 ? <ArchivedDisclosure archived={archived} /> : null}
    </main>
  );
}

/**
 * Collapsed "Archived (N)" disclosure pinned to the bottom of the Catalog.
 * Mirrors Tonight's "Rejected tonight" pattern: a `<details>` element
 * with the same hairline border the OptionRow uses, expanding to a list
 * of `next/link`s to each Archived Option's detail page.
 */
function ArchivedDisclosure({ archived }: { archived: ArchivedOption[] }) {
  return (
    <details className="flex flex-col gap-sm py-lg">
      <summary className="cursor-pointer font-display text-name text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
        Archived ({archived.length})
      </summary>
      <ul className="flex flex-col">
        {archived.map((option) => (
          <li
            key={option.id}
            className="flex flex-row items-center border-b border-line py-md"
          >
            <Link
              href={`/catalog/${option.id}`}
              className="font-display text-name text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              {option.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
