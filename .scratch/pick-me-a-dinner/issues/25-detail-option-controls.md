# 25 — Option detail page: the Actions section (OptionControls)

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The **"Actions" section** of the **Option detail page** — a new client
component `app/catalog/[id]/option-controls.tsx` exporting `OptionControls`,
rendered by `page.tsx` under the "Actions" heading. Following ADR-0007, it
carries every control that makes sense for an **Option** so the Household can
act on it from its full view, not only from the screen that happens to carry
each control.

`OptionControls` takes the `OptionWithTags`, the full `allTags` list,
`placesEnabled`, and a `canDelete` boolean. It renders a wrapping toolbar row:
**Edit**, **Archive** (or **Un-archive** — the toggle is completed in ticket
26; this slice ships the Archive side), a conditional **Delete**, and — pinned
to the row's right edge — **Reject** and the shared **`PickButton`**. Every
control reuses an existing server action: `pickTonight` (via `PickButton`),
`rejectOption`, `updateOption` (via the reused `OptionForm`), `archiveOption`,
and `deleteOption`.

**Edit** swaps the whole component for the reused `OptionForm` inline
(`kind`, `initial`, `allTags`, `placesEnabled`, with `onCancel` / `onSaved`
collapsing it); a save revalidates `/catalog/[id]` so the page's fields and
Recency refresh in place. **Reject** toggles an inline reason form on the row
(an autofocused optional-reason text input with Submit and Cancel); Submit
calls `rejectOption(option.id, reason)` and, on the typed `{ ok: false }`
result of a same-day collision, shows the error inline rather than letting it
500. **Archive** and **Delete** each take a §17 inline-confirm step
("Archive · Cancel" / "Delete · Cancel"), consistent with the Catalog row and
`DESIGN.md` — a destructive action cannot be triggered with a single mis-tap.

The **Delete** control renders only when `canDelete` is true — `page.tsx`
passes `optionLog.length === 0`, since the **Hard-delete** rule (ADR-0001)
blocks deleting an Option with Log entries, so the control is hidden rather
than shown to fail. `runDelete` still keeps an inline-error path as a guard
against a Log entry being added between page load and the click. A successful
Delete uses `useRouter().push("/catalog")` to send the member back to the
Catalog screen, since the Option no longer exists; a blocked Delete shows the
inline error and keeps the page. Pick, Reject, and Edit update the page in
place — the reused actions revalidate `/catalog/[id]`.

This slice also extends the reused actions' revalidation: `app/catalog/actions.ts`
gains a `revalidateCatalog()` helper that revalidates `/catalog` **and**
`/catalog/[id]` (`revalidatePath("/catalog/[id]", "page")`), called from
`updateOption`, `archiveOption`, and `deleteOption`; `rejectOption`'s
revalidation in `app/rejection-actions.ts` likewise adds `/catalog/[id]`. The
existing `/`, `/catalog`, and `/log` targets are kept — a control behaves
identically wherever it is invoked (ADR-0007).

## Acceptance criteria

- [ ] `app/catalog/[id]/option-controls.tsx` exports `OptionControls`, rendered under the page's "Actions" heading
- [ ] The toolbar offers Edit, Archive, a conditional Delete, Reject, and a `PickButton`, each reusing its existing server action
- [ ] Edit swaps the controls for the reused `OptionForm` inline; a save revalidates `/catalog/[id]` and refreshes the page
- [ ] Reject opens an inline optional-reason form; a same-day collision shows the typed-result error inline
- [ ] Archive and Delete each take a §17 inline-confirm step
- [ ] Delete renders only when the Option has no Log entries (`canDelete`)
- [ ] A successful Delete routes to `/catalog`; a Delete blocked by the Hard-delete rule shows an inline error and keeps the page
- [ ] `updateOption` / `archiveOption` / `deleteOption` and `rejectOption` revalidate `/catalog/[id]` alongside their existing targets
- [ ] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 19 — Reject and suppress (the Actions toolbar's Reject control reuses
  `rejectOption`)
- 22 — Option detail page: route, identity, and Recency (the page the
  `OptionControls` "Actions" section is rendered into — independent of the
  History work in 23/24)

## Comments

- attempt 1: worker succeeded but merge into integration aborted on conflict in `app/catalog/[id]/page.tsx` (issue 23's merged History rework changed the same `page.tsx`). Re-run branches off the updated tip — the History section is now in place — so layer the new "Actions" heading and `<OptionControls>` rendering on top of the existing structure rather than rewriting the file from scratch.
- attempt 2: worker succeeded but merge into integration again aborted on conflict in `app/catalog/[id]/page.tsx` — this round merged issue 24 first, which also reworked the same `page.tsx` to render Rejections inside the History section. Re-run branches off the updated tip (24 now merged): the History block now imports `RejectionRow` and renders Rejections inside its date groups; layer the new "Actions" heading and `<OptionControls>` rendering on top of *that* structure.
