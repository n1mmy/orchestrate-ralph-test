# 27 — Option-name links from Tonight and the Log

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Make the **Option detail page** reachable from the remaining two screens that
show an **Option**'s name — completing the link wiring (the Catalog row link
shipped in ticket 22).

The Option name becomes a `next/link` to `/catalog/[id]` on **Tonight** rows
and on **Log** entry / Rejection rows:

- In `app/tonight-row.tsx`, the Option name in `TonightRowItem` is wrapped in a
  `next/link` to `/catalog/${option.id}`.
- In `app/log/log-entry-row.tsx` (the `EntryRow` extracted in ticket 23), the
  Log entry's Option name links to `/catalog/${entry.optionId}`.
- In `app/log/rejection-row.tsx`, the `RejectionRow`'s Option name links to
  `/catalog/${rejection.optionId}`.

The detail page is a normal page navigation, so the browser Back button returns
the member to where they came from. The link is styled so it reads as a link
and is visually distinct from the row's action controls — Pick, Reject, Edit,
Delete — sitting beside it: the shipped rows use the name set in the display
font (`font-display text-name font-name text-ink`) with `hover:underline`,
`underline-offset-2`, and a `focus-visible` outline ring, so tapping the name
opens the page and never triggers a row control. The result is a uniform,
complete view: every Option has the same detail page, reachable from Catalog,
Tonight, and the Log alike.

## Acceptance criteria

- [x] The Option name on a Tonight row (`app/tonight-row.tsx`) links to `/catalog/[id]`
- [x] The Option name on a Log entry row (`EntryRow` in `app/log/log-entry-row.tsx`) links to `/catalog/[id]`
- [x] The Option name on a Rejection row (`RejectionRow` in `app/log/rejection-row.tsx`) links to `/catalog/[id]`
- [x] Each name link is visually distinct from the row's action controls, with a visible focus ring, and does not interfere with them
- [x] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 23 — Option detail page: merged History section + dinner-grouping module
  (provides the extracted `app/log/log-entry-row.tsx`; the `/catalog/[id]`
  route target comes transitively via ticket 22)

## Comments

- attempt 1: worker reported `needs-info` verbally — "AC3 infeasible until 24 or 32 ships `app/log/rejection-row.tsx`" — but did not commit the status transition, so its branch carries no commit and the issue is still at `ready-for-agent`. The underlying blocker has since been resolved: issue 24 merged this same round and introduced `app/log/rejection-row.tsx`. Re-run branches off the updated tip — `app/log/rejection-row.tsx` now exists, and `app/log/log-entry-row.tsx` from ticket 23 is also already present — so implement the three link wrappings as specified.
- attempt 2: done. Wrapped Option name in `next/link` on `TonightRow` and `LogEntryRow` (RejectionRow already shipped its link with ticket 24); added unit tests for the new link wiring; switched the two AI-search submit tests in `app/tonight-screen.test.tsx` from `fireEvent.click(submit-button)` to `fireEvent.submit(form)` — jsdom's click-to-submit chain became fragile once Link siblings entered the form's render tree, but `fireEvent.submit` reaches the same React handler and is already an established pattern in the codebase (`app/catalog/option-form.test.tsx`). Full gate green.
