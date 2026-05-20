# 05 — Google Places autofill for Restaurants

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Google Places autofill on the Catalog add/edit Restaurant form.

Build the **Places client** (`lib/places.ts`) as a deep module wrapping the
Google Places API (New) behind a small `PlacesClient` interface — `searchGoogle(
query)` and `getPlaceDetails(placeId)`. `createPlacesClient(apiKey)` returns the
client; the two methods hide URL construction, the `X-Goog-FieldMask` headers,
the `X-Goog-Api-Key` auth, response parsing, and the error collapse. Every
failure mode — a network error, a 429 quota error, any 4xx/5xx, a malformed
body, an `AbortController` timeout (`REQUEST_TIMEOUT_MS`) — collapses through a
single `null`-on-failure `placesFetch` funnel to the one typed
`PLACES_UNAVAILABLE` (`{ ok: false }`) result, so the form has exactly one
fallback path. `placesEnabled()` reports whether `GOOGLE_PLACES_API_KEY` is set.

`getPlaceDetails` returns the eight autofill fields as `PlaceDetails`: `name`,
`address`, `phone`, `lat`/`lng` (numbers or `null`), `url` (website), `mapsUrl`,
`googlePlaceId`. The Places calls are reached only through the
`authedAction`-wrapped server actions in `app/catalog/places-actions.ts`
(`searchGooglePlaces` / `fetchPlaceDetails`) — the API key is a server secret
the client never sees, and the wrapper stops an anonymous caller driving the
billed API. The pure box logic lives in `app/catalog/places-box.ts`:
`boxStateFromSearch` folds a search result into a `PlacesBoxState` (`idle` /
`results` / `unavailable`), `autofillFromPlace` maps `PlaceDetails` to the eight
form-field strings (`lat`/`lng` rendered as decimal text, a missing coordinate
becoming an empty field), and `PLACES_UNAVAILABLE_NOTICE` is the inline message.

`PlacesSearchBox` (`app/catalog/places-search-box.tsx`) is the "Search Google"
box on the Restaurant form, rendered only when `placesEnabled` (the parent
`OptionForm` gates on it). Searching, or picking a hit, calls a Places server
action; selecting a result autofills the parent form via `onAutofill` —
`applyAutofill` in `OptionForm` sets every field. **One nuance: an
already-filled `url` is kept, not overwritten** — a hand-picked menu link beats
the Place's generic website, so a match flags a `urlKept` notice instead of
clobbering it. Every autofilled field stays editable. Any Places failure swaps
the box for the inline `PLACES_UNAVAILABLE_NOTICE` ("Google search unavailable —
enter details manually"); the manual fields stay editable so a save still works.
When `GOOGLE_PLACES_API_KEY` is unset the box is not rendered at all and the
form degrades cleanly to plain manual entry. Home meals have no Places
integration — this ticket touches only the Restaurant form.

## Acceptance criteria

- [ ] `lib/places.ts` is a deep module with a small `PlacesClient` interface;
      all failure modes (network/quota/4xx/5xx/malformed/timeout) collapse to
      the one typed `PLACES_UNAVAILABLE`; each request carries an
      `AbortController` timeout
- [ ] Selecting a Google result autofills all eight fields via `onAutofill`;
      every field stays editable, and an already-filled `url` is kept (with the
      `urlKept` notice) rather than overwritten
- [ ] With `GOOGLE_PLACES_API_KEY` unset, `placesEnabled` is false and the
      `PlacesSearchBox` is not rendered
- [ ] A Places request failure shows the inline `PLACES_UNAVAILABLE_NOTICE`;
      manual entry and save still work
- [ ] Tests cover the Places client failure-collapse (`lib/places.test.ts`),
      the pure box logic (`app/catalog/places-box.test.ts` —
      `boxStateFromSearch`, `autofillFromPlace`), and the server actions
      key-unset path (`app/catalog/places-actions.test.ts`)

## Blocked by

- 03 — Options catalog: CRUD
