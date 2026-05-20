"use client";

/**
 * "Search Google" autofill box on the Catalog Restaurant form.
 *
 * Rendered only when `placesEnabled` is true — the parent `OptionForm`
 * gates on it so when the API key is unset, the box is not in the DOM
 * at all and the form degrades to plain manual entry.
 *
 * Searching, or picking a hit, calls the `searchGooglePlaces` /
 * `fetchPlaceDetails` server actions. Selecting a result autofills the
 * parent form via `onAutofill`. Any failure swaps the box for the
 * inline `PLACES_UNAVAILABLE_NOTICE`; the manual fields stay editable
 * so a save still works.
 *
 * The pure state and autofill logic live in `places-box.ts`; this file
 * is the React shell that calls the server actions, dispatches into
 * those helpers, and renders the resulting state.
 */
import { useId, useState, useTransition } from "react";

import {
  PLACES_UNAVAILABLE_NOTICE,
  type Autofill,
  type PlacesBoxState,
  autofillFromPlace,
  boxStateFromSearch,
} from "./places-box";
import { fetchPlaceDetails, searchGooglePlaces } from "./places-actions";

type Props = {
  onAutofill: (filled: Autofill) => void;
};

export function PlacesSearchBox({ onAutofill }: Props) {
  const idBase = useId();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<PlacesBoxState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const runSearch = () => {
    const trimmed = query.trim();
    if (trimmed === "") return;
    startTransition(async () => {
      const result = await searchGooglePlaces(trimmed);
      setState(boxStateFromSearch(result));
    });
  };

  const pickHit = (placeId: string) => {
    startTransition(async () => {
      const result = await fetchPlaceDetails(placeId);
      if (!result.ok) {
        setState({ kind: "unavailable" });
        return;
      }
      onAutofill(autofillFromPlace(result.details));
      setState({ kind: "idle" });
      setQuery("");
    });
  };

  if (state.kind === "unavailable") {
    return (
      <p className="text-meta text-muted" role="status">
        {PLACES_UNAVAILABLE_NOTICE}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-sm rounded-input border border-line bg-surface p-md">
      <label htmlFor={`${idBase}-query`} className="text-meta text-muted">
        Search Google
      </label>
      <div className="flex flex-row gap-sm">
        <input
          id={`${idBase}-query`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runSearch();
            }
          }}
          placeholder="e.g. Joe's Pizza Brooklyn"
          className="min-h-[44px] flex-1 rounded-input border border-line bg-surface px-md py-sm text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={pending || query.trim() === ""}
          className="min-h-[44px] rounded-control bg-action px-md text-body text-action-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
        >
          Search
        </button>
      </div>
      {state.kind === "results" ? (
        <ul className="flex flex-col gap-xs">
          {state.hits.map((hit) => (
            <li key={hit.placeId}>
              <button
                type="button"
                onClick={() => pickHit(hit.placeId)}
                disabled={pending}
                className="flex w-full flex-col gap-xs rounded-control border border-line bg-surface px-md py-sm text-left text-body text-ink hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
              >
                <span className="text-body text-ink">{hit.name}</span>
                {hit.address ? (
                  <span className="text-meta text-muted">{hit.address}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
