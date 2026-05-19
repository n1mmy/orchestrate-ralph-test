# 27 — Option-name links from Tonight and the Log

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/option-detail-page/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

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

- [ ] The Option name on a Tonight row (`app/tonight-row.tsx`) links to `/catalog/[id]`
- [ ] The Option name on a Log entry row (`EntryRow` in `app/log/log-entry-row.tsx`) links to `/catalog/[id]`
- [ ] The Option name on a Rejection row (`RejectionRow` in `app/log/rejection-row.tsx`) links to `/catalog/[id]`
- [ ] Each name link is visually distinct from the row's action controls, with a visible focus ring, and does not interfere with them
- [ ] The full gate passes — `pnpm typecheck`, `lint`, `test`, `build`

## Blocked by

- 26 — Archived Options: detail page, Un-archive, and Catalog disclosure
