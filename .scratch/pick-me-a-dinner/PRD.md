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

**The source of truth is the as-built app.** The tickets model the application
as it actually exists in the reference build (`~/data/local/pick-me-a-dinner-2`).
The per-feature PRDs that originally seeded these tickets
(`.issues/<feature>/PRD.md` in that repo) were written *before* the final phase
of app tweaking and no longer match the shipped code in several places — each
ticket cites its origin PRD as background, but where that PRD and the shipped
code disagree, **the code wins**.

## Build sequence (33 tickets, six phases)

The sequence is linear: each ticket's `Blocked by` names its predecessors, and
the lowest-numbered `ready-for-agent` ticket is always safe to pick up next.

**Phase 1 — v1, the core app (01–10).** Source: `.issues/pick-me-a-dinner-v1/PRD.md`.
Walking skeleton → Catalog CRUD → Tags → Tonight ranked list → pick=log + Log
screen → tag filters → Google Places autofill → auth gate → data import →
Dockerfile & deploy. At the end of phase 1 the app is shippable.

**Phase 2 — Tonight decided mode (11–13).** Source: `.issues/tonight-decided-mode/PRD.md`.
Tonight becomes a two-mode screen: a ranked picker, and a "Tonight's dinner"
decided view once an Option is Picked.

**Phase 3 — AI search (14–18).** Source: `.issues/ai-search/PRD.md`.
A search box on Tonight that re-ranks the Catalog by typed intent via an
Anthropic model, additive and never the default.

**Phase 4 — Rejections (19–21).** Source: `.issues/rejections/PRD.md`.
A reject affordance on every Tonight row; rejected Options are suppressed for
the day and fed into AI search as a learning signal.

**Phase 5 — Option detail page (22–27).** Source: `.issues/option-detail-page/PRD.md`.
A per-Option screen at `/catalog/[id]` showing everything about one Option, with
every sensible control, plus reachable Archived Options.

**Phase 6 — Dated Rejections (28–33).** Source: `.issues/dated-rejections/PRD.md`.
Rejections become manually creatable, freely dated, and editable; the Log
becomes the household's full nightly record.

## Reconciliation notes — where the shipped app diverges from the old PRDs

These tickets build the app *as shipped*. The notable places the shipped code
departs from the per-feature PRDs:

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

Each phase's tickets were rewritten against the shipped code; the bullets above
are the headline divergences, not an exhaustive list.

## Out of scope

The per-feature PRDs each carry their own "Out of Scope" section; those bind.
Nothing beyond the six phases above is in this build.
