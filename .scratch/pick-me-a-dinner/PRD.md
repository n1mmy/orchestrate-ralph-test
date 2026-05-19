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

## Build sequence (33 tickets, six phases)

The 33 tickets form a **dependency DAG**, not a linear chain. Each ticket's
`Blocked by` section names only the tickets it *genuinely* builds on — a shared
module it extends, a schema migration it follows, a screen it modifies — so a
ticket becomes eligible the moment every ticket it is blocked by is
`Status: done`. The Ralph orchestrator can therefore run several tickets per
wave; the critical path is ~10 levels deep, not 33.

The six phases below are a **narrative** grouping, not a build barrier — work
crosses phase lines wherever the dependencies allow. In particular: Rejections
(Phase 4) does not wait on AI search (Phase 3) — only ticket 21, which feeds
Rejections *into* AI search, bridges them; the Option detail page (Phase 5)
starts as soon as Phase 2 lands, independent of Phases 3–4; and the dated-
Rejections foundation (ticket 28's `UNIQUE` migration) follows ticket 19
directly rather than the whole detail-page phase. Within a phase the AI-search
chain (14→15→16→17→18) and the detail-page page-file chain (22→23→24/25→26)
remain mostly sequential because each ticket reworks the same module or screen
file as its predecessor.

**Phase 1 — v1, the core app (01–10).**
Walking skeleton → Catalog CRUD → Tags → Tonight ranked list → pick=log + Log
screen → tag filters → Google Places autofill → auth gate → data import →
Dockerfile & deploy. At the end of phase 1 the app is shippable.

**Phase 2 — Tonight decided mode (11–13).**
Tonight becomes a two-mode screen: a ranked picker, and a "Tonight's dinner"
decided view once an Option is Picked.

**Phase 3 — AI search (14–18).**
A search box on Tonight that re-ranks the Catalog by typed intent via an
Anthropic model, additive and never the default.

**Phase 4 — Rejections (19–21).**
A reject affordance on every Tonight row; rejected Options are suppressed for
the day and fed into AI search as a learning signal.

**Phase 5 — Option detail page (22–27).**
A per-Option screen at `/catalog/[id]` showing everything about one Option, with
every sensible control, plus reachable Archived Options.

**Phase 6 — Dated Rejections (28–33).**
Rejections become manually creatable, freely dated, and editable; the Log
becomes the household's full nightly record.

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
