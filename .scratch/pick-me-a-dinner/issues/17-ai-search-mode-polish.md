# 17 — AI search: mode polish, habit reasoning, and accessibility

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Make AI search a clean, accessible **mode** — and give the model room to
actually reason about the Household's eating habits rather than re-sort recency.

**Habit reasoning via extended thinking.** Build `buildSystemPrompt` in
`lib/ai-search`: a system prompt that tells the model its job is *not* to
re-sort the Catalog by raw recency (a deterministic ranking already does that),
but to read the dinner Log and find the habits and rhythms plain recency misses
— cadence (weekly vs monthly), day-of-week rhythm, sequencing and streaks,
drift. The prompt also explains the Rejections block (today's-rejected vs
not-today's, standing vs one-off) and the prompt-injection delimiter rule. To
let the model do that reasoning, every model call enables **extended thinking**.
How hard it thinks is one knob, `AI_EFFORT` (`off` | `low` | `medium` | `high`,
default `low`), uniform across models — but the two model families take it
through different APIs: the budget-API models (Sonnet, Haiku) get a
`thinking.type: "enabled"` with `budget_tokens` mapped from the effort level
(low→1024, medium→4000, high→6144), while the adaptive-API model (Opus 4.7) gets
`thinking.type: "adaptive"` plus `output_config.effort`. An adaptive-thinking
call has a high `max_tokens` that trips the SDK's long-request guard, so the
Opus path must be **streamed** (`messages.stream(...).finalMessage()`) where the
budget path uses plain `messages.create`. The full env-var/model wiring lands in
ticket 18; this ticket builds `buildSystemPrompt`, `planThinking`, and the
streaming/non-streaming split.

**Tiered open-query rationale (`AI_TAIL_MODE`).** A narrowing query
("something light") always returns a focused shortlist; an empty or open query
returns the whole candidate Catalog, and the rationale shape of that tail is
governed by `resolveTailMode` reading `AI_TAIL_MODE`: `full` gives every row a
full one-line rationale; `pithy` (the default) tiers it — a genuine pick gets a
one-line rationale, a clearly weak pick a terse few-word note, an obviously bad
pick an **empty string** (no rationale at all); `drop` omits the clearly-bad
picks and returns only a shortlist. `buildSystemPrompt` swaps only the
open-query instruction by mode; the habit-reasoning core is mode-independent.
The empty-rationale rendering itself was wired in ticket 16.

**Mode polish.** While an AI result is shown, **hide the filter zone** — the
All/Home/Restaurant kind segment and the tri-state Tag filter chips — so the
query is the single ranking authority. The Picker reports AI-result state up to
`TonightScreen` via an `onAiActiveChange` callback so the header can drop the
kind segment. Clearing the search restores both the deterministic list and its
filter controls. While a search is **in flight**, the search box shows a pending
state ("Searching…") and is **disabled**; the deterministic list stays visible
underneath until the result arrives, then swaps. Disabling the box means only
one search runs at a time, so a slow response can never overwrite a newer query.

**Accessibility.** A visually-hidden `aria-live` region announces the search
status — pending, the swap to the AI result, an empty result, and the return to
the deterministic list. The search box, the Search button, and the Clear
control are keyboard-reachable with a visible focus ring and have adequate
(≥44px) touch targets on phone and desktop.

## Acceptance criteria

- [ ] `buildSystemPrompt` produces a habit-reasoning prompt (cadence,
      day-of-week rhythm, streaks, drift) that explicitly tells the model not to
      just re-sort recency, and explains the Rejections block and the
      `<household-text>` delimiter rule
- [ ] Every model call enables extended thinking; `AI_EFFORT`
      (`off`/`low`/`medium`/`high`, default `low`) is the single effort knob
- [ ] Budget-API models (Sonnet, Haiku) use `thinking.type: "enabled"` with
      `budget_tokens` mapped from effort; the adaptive-API model (Opus 4.7) uses
      `thinking.type: "adaptive"` + `output_config.effort` and is streamed via
      `messages.stream(...).finalMessage()`
- [ ] `resolveTailMode` reads `AI_TAIL_MODE` (`full`/`pithy`/`drop`, default
      `pithy`); `buildSystemPrompt` swaps only the open-query instruction by
      mode and shares the rest
- [ ] In `pithy` mode an obviously bad pick gets an empty-string rationale; a
      narrowing query returns a focused shortlist in every mode
- [ ] The kind segment and Tag filter chips are hidden while an AI result is
      shown (via the Picker's `onAiActiveChange` callback) and restored on clear
- [ ] The search box shows a pending state and is disabled while a search is in
      flight; the deterministic list stays visible underneath until the result
      arrives
- [ ] An `aria-live` region announces the pending state, the swap, the empty
      result, and the return to the deterministic list; the search box, Search,
      and Clear controls are keyboard-operable with visible focus and ≥44px
      touch targets
- [ ] Unit tests (`lib/ai-search.test.ts`) cover `resolveTailMode`,
      `buildSystemPrompt` per-mode instructions, and the Opus streaming /
      adaptive-shape path; a screen-level test covers
      clearing-restores-the-filter-zone and the in-flight disable
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green

## Blocked by

- 16 — AI search: result hardening and empty state
