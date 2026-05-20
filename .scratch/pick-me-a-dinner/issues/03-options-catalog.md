# 03 — Options catalog: CRUD

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The Catalog screen and its server actions — the first real vertical slice. The
Household can add, edit, list, Archive, and hard-delete Options (Home meals and
Restaurants), with manual data entry only (Google Places autofill is ticket 05;
Tags are ticket 04).

The `/catalog` route is `force-dynamic` and loads the active Catalog via a
`getActiveCatalog()` query in `db/queries.ts` — `active = true` Options ordered
by name, split into `home` and `restaurants`, each carrying its Tag names.
`CatalogScreen` renders the two kinds as two `OptionSection`s ("Home meals" /
"Restaurants"), each row showing just the Option name. Adding and editing happen
**inline** in `OptionForm`: a per-section "+ Add a meal" / "+ Add a restaurant"
button expands an add form in place, and a row's "Edit" action expands the same
form over that row — identical on phone and desktop. The Restaurant form exposes
the restaurant-only fields (`address`, `phone`, `url` as "Website or menu link",
`maps_url`, `lat`, `lng`, `google_place_id`) as plain `TextField`s for manual
entry; the Home meal form has `name`, `notes`, and an optional `url` recipe
link. (v1 Catalog rows show only the name with Edit / Archive / Delete actions —
the Option name being a link to `/catalog/[id]` is a later phase, so omit it.)

The server actions in `app/catalog/actions.ts` are each wrapped in
`authedAction` (built in ticket 06 — until then a thin pass-through is
acceptable, but write the call site for it). `createOption(kind, values)` and
`updateOption(id, kind, values)` both run the Option write inside a
`db.transaction` so the Tag sync (ticket 04) commits atomically with it; both
reject a blank name with `{ ok: false, error: "Enter a name" }`. They return the
shared `ActionResult` type (`lib/action-result.ts`). `archiveOption(id)` sets
`active = false` — the Option leaves the default Catalog list and Tonight, but
its Log history is untouched. `deleteOption(id)` hard-deletes; it is allowed only
for an Option with zero Log entries. The `dinner_log.option_id` `ON DELETE
RESTRICT` constraint raises a Postgres `23503`; `lib/pg-error.ts`'s
`pgErrorMessage` translates that into a friendly inline `"In your log — archive
instead"` rather than a 500. All four actions `revalidatePath("/catalog")` on
success.

`OptionRow` carries the destructive actions through the §17 inline-confirm
pattern: tapping "Archive" or "Delete" swaps the action cluster for an in-place
"Archive · Cancel" / "Delete · Cancel" confirm step — no modal, no undo-toast. A
failed delete surfaces `result.error` as an inline `text-danger` line on the
row. Cover the §17 interaction states (a `loading.tsx` placeholder; empty
Catalog → "Add a meal or restaurant to get started"; blank-name inline field
error; a saved Option appears/updates in place) and the §18 rules — single
`.column`, ≥ 44×44px touch targets, visible `focus-visible` rings, every input
with a visible `<label>`.

## Acceptance criteria

- [x] Home meals and Restaurants load via `getActiveCatalog()`, render in two
      sections each showing the Option name, and add/edit via an inline-expand
      `OptionForm` identical on phone and desktop
- [x] `archiveOption` sets `active = false`; archived Options drop out of the
      default Catalog list and Tonight, Log history untouched
- [x] `deleteOption` hard-deletes an Option with zero Log entries
- [x] Deleting an Option with Log history catches the `ON DELETE RESTRICT`
      (`23503`) via `pgErrorMessage` and returns the inline "In your log —
      archive instead" message — no error page
- [x] Destructive actions require an inline "Delete/Archive · Cancel" confirm
      step (no modal, no undo)
- [x] Loading (`loading.tsx`) / empty / blank-name error / saved-in-place
      states match §17 for Catalog
- [x] `app/catalog/actions.db.test.ts` covers: archive sets `active = false`;
      hard-delete blocked for a logged Option and allowed for an unlogged one;
      blank name rejected with "Enter a name"

## Blocked by

- 01 — Walking skeleton: scaffold, schema, design foundation
