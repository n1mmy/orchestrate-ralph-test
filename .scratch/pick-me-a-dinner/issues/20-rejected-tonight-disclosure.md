# 20 — Rejected tonight disclosure

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Building on the reject path (ticket 19), give the Household a way to see today's Rejections and undo a mistaken one.

Add a **"Rejected tonight (N)" disclosure** to `app/tonight-screen.tsx`, rendered as a `RejectedTonightDisclosure` component pinned at the **bottom** of the Tonight page — after the picker `<ol>` of ranked rows and after the decided-mode block alike. It is rendered only when something was actually rejected today (`rejectedTonight.length > 0`), so it costs no screen space until then, and is **collapsed by default** — a local `open` state toggled by the heading button. The heading is a `<button>` carrying `aria-expanded` and the literal label `Rejected tonight (N)`, where `N` is the count of today's Rejections, so a member can tell at a glance whether anything has been rejected. The disclosure renders the same in picker mode and in decided mode's reopened picker — it lives at the screen level, below whichever mode is showing.

Expanded, the disclosure renders a `<ul>` of today's Rejections — for each, the Option name and, when one was given, the reason on a muted second line — each row carrying a **"Bring back"** button. The list is the `rejectedTonight` prop: the `TodayRejection[]` that `app/page.tsx` already loads via `getTodayRejections` (built in ticket 19) and passes through to `TonightScreen`. No new query is needed — the page passes the same today's-Rejections result to both the suppression filter and this disclosure.

"Bring back" calls the **`deleteRejection(rejectionId)`** server action — there is no separate `bringBackRejection` action; bringing back a Rejection the Household made today is the same row delete, so one shared `authedAction`-wrapped action covers both. `deleteRejection` lives in `app/rejection-actions.ts` (the module added in ticket 19): it deletes the `rejections` row by id and revalidates the affected views (`/`, `/log`, `/catalog/[id]`). It is thin — no logic beyond the delete — following the existing thin-server-action pattern. The disclosure calls it inside a `useTransition` and disables the controls while the delete is in flight. Deleting the row returns the Option to tonight's list immediately and — because the record is gone, not merely expired — ensures a mis-tapped Rejection never reaches AI search and never teaches the model anything. The disclosure offers "Bring back" **only for today's Rejections**, keeping it a quick-undo tool rather than a history manager; managing the historical Rejection log is out of scope (see the source PRD).

## Acceptance criteria

- [ ] A `RejectedTonightDisclosure` rendered at the bottom of `app/tonight-screen.tsx`, only when today has Rejections, collapsed by default
- [ ] The heading is a button carrying `aria-expanded` and the literal label `Rejected tonight (N)` with the count of today's Rejections
- [ ] Expanded, it lists today's Rejections with the Option name and the reason on a muted line when one was given
- [ ] The disclosure list is the `rejectedTonight` (`TodayRejection[]`) prop passed from `app/page.tsx` — no new query is added
- [ ] Each entry has a "Bring back" button calling the `authedAction`-wrapped `deleteRejection(rejectionId)` from `app/rejection-actions.ts` — the same shared delete action, no separate `bringBackRejection`
- [ ] "Bring back" deletes the `rejections` row entirely and returns the Option to tonight's list immediately on revalidation
- [ ] Only today's Rejections appear in the disclosure
- [ ] The disclosure renders the same in picker mode and in decided mode's reopened picker
- [ ] The disclosure toggle and every "Bring back" control are keyboard-operable with visible focus and adequate touch targets, and disabled while a delete is in flight
- [ ] `deleteRejection` is `authedAction`-wrapped and rejects an unauthenticated caller
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green

## Blocked by

- 19 — Reject and suppress
