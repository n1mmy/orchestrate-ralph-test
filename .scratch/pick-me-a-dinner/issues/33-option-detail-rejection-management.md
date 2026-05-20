# 33 — Option detail page: interleaved History with Rejection management

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Bring the **Option detail page**'s History section to the final shipped form, so a **Rejection** is managed identically wherever the Option is shown (ADR-0007 — every sensible control wherever it makes sense). Phase 5 built the detail page (`app/catalog/[id]/page.tsx`) with a merged History section interleaving that Option's logged dinners and its Rejections; this ticket reworks that section onto the ticket-29 `groupByDay` and the ticket-32 shared `RejectionRow`, so its Rejections become fully manageable in place.

The detail page loads, in its existing `Promise.all`, `getOptionLog(option.id)` and `getOptionRejections(option.id)` (the ticket-31 query — that Option's Rejections, all dates, joined to the Option, newest first), plus `getOptionChoices()` for the edit forms. It calls `groupByDay(optionLog, optionRejections, todaySql)` and renders one merged History section: future-dated groups (Planned dinners and Planned rejections) first, then realized history newest-first — the shipped page builds this as `[...upcoming].reverse().concat(history)`. Each date-group is a `formatDinnerDate` header above that day's `EntryRow`s and `RejectionRow`s, reusing the Log screen's components. When the Option has no logged dinners and no Rejections, the section shows "Nothing logged or rejected yet for this Option."

Every Rejection of that Option — past, today, or future — is inline-editable (Option, date, reason) and deletable through the shared `RejectionRow` from ticket 32. Edit expands the row into the rejection form and calls `updateRejection`; a duplicate `(option_id, rejected_on)` shows the inline "Already rejected for that date" error. Delete uses the §17 inline-confirm and calls `deleteRejection`, removing the Rejection entirely. The detail page's older today-only **Bring back** affordance is subsumed by this always-available Delete — bringing a Rejection back is just deleting it. Because the ticket-31 actions revalidate `/catalog/[id]`, an edit or delete refreshes this page in place with no manual reload.

The detail page gets **no** dated add-rejection form — creating a Rejection for an arbitrary date is the Log screen's job (ticket 32). The detail page keeps its existing live "Reject" control in its Actions block (the Phase 4 / Phase 5 affordance, calling `rejectOption`). Tonight's "Rejected tonight" disclosure is untouched — "Bring back" there stays the today-only quick-undo, a separate affordance from the detail page's per-row Delete. The History section's layout is otherwise unchanged from Phase 5; this ticket upgrades the controls and the grouping, not the surrounding page structure (Recency, Actions, Details sections stay as built).

## Acceptance criteria

- [x] `app/catalog/[id]/page.tsx` loads `getOptionLog`, `getOptionRejections`, and `getOptionChoices` and builds its History section from `groupByDay(optionLog, optionRejections, todaySql)`
- [x] The merged History section renders future-dated groups first (`[...upcoming].reverse()`) then realized history newest-first, each date-group a `formatDinnerDate` header above that day's `EntryRow`s and `RejectionRow`s
- [x] An Option with no logged dinners and no Rejections shows "Nothing logged or rejected yet for this Option."
- [x] Every Rejection row (past, today, or future) offers inline Edit (Option, date, reason → `updateRejection`) and Delete (§17 inline-confirm → `deleteRejection`), reusing the shared `RejectionRow` from ticket 32
- [x] An edit producing a duplicate `(option_id, rejected_on)` shows the inline "Already rejected for that date" error
- [x] The detail page's today-only "Bring back" affordance is replaced by the always-available Delete
- [x] Editing or deleting a Rejection refreshes the detail page in place via the `/catalog/[id]` revalidation
- [x] No dated add-rejection form is added to the detail page; its existing live "Reject" control is unchanged
- [x] Tonight's "Rejected tonight" disclosure and its today-only "Bring back" quick-undo are unchanged

## Blocked by

- 24 — Option detail page: Rejections in History + Bring-back parity (the
  merged History section this ticket reworks)
- 32 — Log screen: interleaved Rejections and the shared RejectionRow
  (provides the shared `RejectionRow` and the `groupByDay` rework)
