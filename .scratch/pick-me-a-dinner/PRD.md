# PRD: Pick Me a Dinner — whole-app build

Status: ready-for-agent

A single, ordered build sequence that takes **Pick Me a Dinner** from an empty
repo to the complete shipped app — v1 plus every feature layered on top.

## What this is

A small personal web app that helps one household decide what's for dinner each
night: a ranked, explained list of dinner **Options** (home meals and
restaurants), a fully editable **Log** of what was eaten, AI-assisted search,
**Rejections** as a learning signal, and a per-Option detail page. One
household, one shared password, no accounts. Built as a "sharp instrument" —
dense, precise, confident.

Stack: Next.js (App Router) + TypeScript + Drizzle ORM + PostgreSQL + Tailwind.
Server actions for every mutation. Ranking computed in TypeScript, not SQL.

## Canonical source documents

The spec documents are copied into this tracker so it is self-contained:

- `CONTEXT.md` — the domain glossary; all terms used here are defined there.
- `DESIGN.md` — the visual system. Canonical for every UI decision.
- `docs/adr/0001`–`0008` — the architectural decisions.

**The source of truth is the ticket.** Each ticket is a complete,
self-contained build spec, written against the final shipped behavior of the
app — implement exactly what it describes. There is no external reference
repository to open and no background PRD to chase down: everything a worker
needs is in its ticket and the tracker documents listed above. The tickets
were derived from an earlier reference build, but that build is not part of
this repo and must not be sought out.

## Build sequence (15 tickets, five phases)

The 15 tickets form a **dependency DAG**, not a linear chain. Each ticket's
`Blocked by` section names only the tickets it *genuinely* builds on — a shared
module it extends, a schema migration it follows, a screen it modifies — so a
ticket becomes eligible the moment every ticket it is blocked by is
`Status: done`. The Ralph orchestrator can therefore run several tickets per
wave; the critical path is ~7 levels deep, not 15.

The five phases below are a **narrative** grouping, not a build barrier — work
crosses phase lines wherever the dependencies allow. In particular: the
Option detail page (Phase 4) starts as soon as Phase 2 lands, independent of
Phase 3; the AI snapshot extensions (ticket 11) bridge Phase 3 and the
Rejections work (ticket 10) without serialising the rest of Phase 4; and the
final Log day-grouping ticket (ticket 15) only unblocks once both the detail
page (13/14) and the rejection-management server actions (12) are in place.
Within Phase 1, the four post-Catalog tickets (04 Tags + import, 05 Places, 06
Auth, 07 Tonight base) are all parallel — they unblock together the moment
03 lands.

**Phase 1 — v1, the core app (01–07).**
Walking skeleton → Dockerfile & deploy → Options catalog CRUD → Tags + prior-
version data import → Google Places autofill → shared-password auth gate →
Tonight base (ranked list + pick=log + Log screen + tri-state tag filters).
At the end of Phase 1 the app is shippable.

**Phase 2 — Tonight decided mode (08).**
Tonight becomes a two-mode screen: a ranked picker, and a "Tonight's dinner"
decided view once an Option is Picked, with action buttons (Menu / Call /
Recipe) and a Remove control on the decided block.

**Phase 3 — AI search and its rejection-aware snapshot (09, 11).**
A search box on Tonight that re-ranks the Catalog by typed intent via an
Anthropic model — built end-to-end across skeleton, failure model, result
hardening, mode polish, and config/observability in ticket 09 — then extended
in ticket 11 to feed Rejections and the future window into the snapshot.

**Phase 4 — Rejections, Tonight UI, and the Option detail page (10, 12, 13, 14).**
A reject affordance on every Tonight row that suppresses rejected Options for
the day (ticket 10, including the `UNIQUE(option_id, rejected_on)` constraint
that follows the initial table); the Rejected-tonight disclosure and the
rejection-management server actions (ticket 12); and the per-Option detail
screen at `/catalog/[id]` — core route, identity, Recency, merged History
section and Option-name links (ticket 13); Actions toolbar, Archived Options
with Un-archive + Catalog disclosure, and Rejection rows in History with
Bring-back parity (ticket 14).

**Phase 5 — Log day grouping and full rejection management (15).**
The Log becomes the household's full nightly record: a shared
`groupByDay` extension over the dinner-grouping module interleaves Log entries
and Rejections by date, the Log screen renders the result with a shared
`RejectionRow`, and the Option detail page's merged History is reworked to use
the same primitives — closing the loop on dated, editable Rejections.

## Build notes — easy-to-get-wrong points

These tickets build the app *as shipped*. A few headline decisions, called out
so a worker does not reach for an obsolete pattern:

- **Design system.** Phase 1 builds the cool-grey functional-color `DESIGN.md`
  system — the two color channels (the 3px meal-kind left bar and the red→green
  recency heatmap) included. The v1 PRD's older "§16 warm palette" is superseded.
- **Recency chip, not Explanation chip.** The deterministic Tonight row carries
  a data-only **Recency chip** (per-Option recency: `18d`, `60d+`, `new`) plus
  heatmap-tinted Tag chips — *not* the prose "Explanation chip" the older PRDs
  and `DESIGN.md` describe. `lib/ranking.ts` computes no explanation string at
  all. Tickets are written to the Recency-chip reality.
- **Option detail page.** The shipped detail page has **no Score block** and a
  **single merged "History" section** interleaving logged dinners and
  Rejections by date — not the separate Score block and separate Log/Rejection
  history sections the Option-detail PRD describes.
- **AI search.** The shipped feature supports **multiple models** (not a single
  Sonnet model), uses integer ids and a `pithy` tail mode in the snapshot,
  caches, and may return rationale-less result rows. Tickets follow the shipped
  behavior.

The bullets above are the headline points, not an exhaustive list — each
ticket's own text is authoritative for its slice.

## Out of scope

Each ticket defines its own scope — build only what its `## What to build`
section and acceptance criteria specify. Nothing beyond the six phases above
is in this build.
