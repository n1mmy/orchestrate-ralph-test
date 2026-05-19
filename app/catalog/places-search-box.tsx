"use client";

import { useState, useTransition } from "react";
import { searchGooglePlaces, fetchPlaceDetails } from "./places-actions";
import {
  autofillFromPlace,
  boxStateFromSearch,
  PLACES_UNAVAILABLE_NOTICE,
  type AutofillFields,
  type PlacesBoxState,
} from "./places-box";

/**
 * The "Search Google" box on the Restaurant form. Rendered only when
 * `placesEnabled` — the parent `OptionForm` gates on that, so this component
 * never appears with a missing key.
 *
 * Behavior: typing a query and pressing Search calls the
 * `searchGooglePlaces` server action; the result is folded through
 * `boxStateFromSearch` into one of three rendered states (`idle` / `results`
 * / `unavailable`). Picking a hit calls `fetchPlaceDetails`; on success the
 * eight autofill strings flow up through `onAutofill`. Any failure swaps the
 * box for the inline `PLACES_UNAVAILABLE_NOTICE` — manual entry below stays
 * editable, so a save still works.
 */
type Props = {
  onAutofill: (fields: AutofillFields) => void;
};

export function PlacesSearchBox({ onAutofill }: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<PlacesBoxState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function handleSearch() {
    const trimmed = query.trim();
    if (trimmed === "") {
      setState({ kind: "idle" });
      return;
    }
    startTransition(async () => {
      const result = await searchGooglePlaces(trimmed);
      setState(boxStateFromSearch(result));
    });
  }

  function handlePick(placeId: string) {
    startTransition(async () => {
      const result = await fetchPlaceDetails(placeId);
      if (!result.ok) {
        setState({ kind: "unavailable" });
        return;
      }
      onAutofill(autofillFromPlace(result.details));
      // After a successful autofill, collapse the result list back to idle
      // so the form is not visually competing with the populated fields.
      setState({ kind: "idle" });
    });
  }

  if (state.kind === "unavailable") {
    return (
      <p
        role="status"
        className="rounded-input border border-line bg-surface px-sm py-xs text-meta text-muted"
      >
        {PLACES_UNAVAILABLE_NOTICE}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-xs rounded-input border border-line bg-surface p-sm">
      <label className="flex flex-col gap-2xs text-meta font-medium text-ink">
        Search Google
        <div className="flex gap-xs">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Restaurant name"
            className="block w-full min-h-[44px] rounded-input border border-line bg-surface px-sm py-xs text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={pending || query.trim() === ""}
            className="min-h-[44px] rounded-control border border-line bg-surface px-md py-xs text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50"
          >
            Search
          </button>
        </div>
      </label>
      {state.kind === "results" ? (
        state.hits.length === 0 ? (
          <p className="text-meta text-muted">No matches</p>
        ) : (
          <ul className="flex flex-col gap-2xs">
            {state.hits.map((hit) => (
              <li key={hit.placeId}>
                <button
                  type="button"
                  onClick={() => handlePick(hit.placeId)}
                  disabled={pending}
                  className="block w-full min-h-[44px] rounded-control border border-line bg-surface px-sm py-xs text-left text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-50"
                >
                  <span className="block font-medium">{hit.name}</span>
                  {hit.address ? (
                    <span className="block text-muted">{hit.address}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
