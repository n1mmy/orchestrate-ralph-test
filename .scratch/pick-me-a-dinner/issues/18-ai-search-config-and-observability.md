# 18 — AI search: config, model selection, caching, and observability

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Gate AI search on configuration, make the model and effort fully
env-configurable across model families, cache the request prefix, and make each
model call observable.

**Config gating.** Add **`aiSearchEnabled()`** to `lib/ai-search`, returning
whether `ANTHROPIC_API_KEY` is set — mirroring `placesEnabled()`. The Tonight
page (`app/page.tsx`) passes a `searchEnabled` flag to `TonightScreen`; the
search box is **hidden entirely** when the key is absent (Tonight is then
exactly v1) or when the Catalog is empty. `aiSearchAction` returns the typed
`AI_SEARCH_UNAVAILABLE` without any DB read or model call when the key is unset.
`lib/check-env.ts` is **not** modified — `ANTHROPIC_API_KEY` is optional (absent
→ feature hidden) and does not belong in the hard-required boot set.

**Model selection — multiple models.** The model is chosen by **`AI_MODEL`**,
defaulting to **`claude-opus-4-7`** (`MODEL_DEFAULT`). This is a deliberate
divergence from the background PRD, which assumed a single Sonnet model — the
shipped feature supports three: Opus 4.7 (the default, adaptive-thinking API),
Sonnet 4.6, and Haiku 4.5 (both budget-thinking API). The thinking effort is
chosen by **`AI_EFFORT`** (`off`/`low`/`medium`/`high`, or — for the budget-API
models only — a bare integer used directly as `budget_tokens`, floor 1024, `0`
meaning off). A positive numeric `AI_EFFORT` has no meaning for an adaptive
model, so pairing one with an Opus model must **throw at client construction**
(`createAiSearchClient`) — a loud misconfiguration error, never a silent
default. The open-query result shape is `AI_TAIL_MODE` (ticket 17). Add
`ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_EFFORT`, and `AI_TAIL_MODE` to
`.env.example`, each documented as optional. `pnpm build` must still succeed
with no AI env vars set (the Anthropic client is constructed lazily).

**Prompt caching.** The snapshot body — everything except the query — is stable
between searches minutes apart, so send it in a `cache_control: { type:
"ephemeral" }` block: the system prompt, the tools, and the snapshot body form
the cached prefix, and the query trails it uncached. A burst of searches over
unchanged Catalog/Log data then reads the prefix from cache.

**Observability.** Emit one **structured JSON log line per model call**
(`event: "ai_search"`), on both the ok and the fallback path: query length
(length only — never the query text, so Household intent stays out of the logs),
model id, tail mode, the thinking choice descriptor (`off` / `budget:N` /
`effort:level`), latency in ms, outcome (`ok` or `fallback`), result count, and
— when the call returned a response — its token usage (input, output, and the
cache read/creation token counts).

An **eval harness**, `scripts/ai-search-eval.ts`, runs an AI search against the
real dev database from the command line without the Tonight UI — it builds the
snapshot exactly as `aiSearchAction` does, supports a `--snapshot` dump, a
`--mode=full|pithy|drop` override, and a `--compare` matrix sweeping the budget
models over token-budget levels and Opus over effort levels (with `--serial`
for clean per-call latencies).

## Acceptance criteria

- [x] `aiSearchEnabled()` reports whether `ANTHROPIC_API_KEY` is set; the search
      box is hidden when the key is absent or the Catalog is empty
- [x] `aiSearchAction` returns the typed unavailable with no DB read or model
      call when `ANTHROPIC_API_KEY` is unset
- [x] `AI_MODEL` selects the model, defaulting to `claude-opus-4-7`; Opus 4.6,
      Sonnet 4.6, and Haiku 4.5 are all supported through their respective
      thinking APIs
- [x] `AI_EFFORT` accepts `off`/`low`/`medium`/`high` or a bare integer budget
      for budget-API models; a positive numeric `AI_EFFORT` paired with an Opus
      model throws at `createAiSearchClient`
- [x] `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_EFFORT`, and `AI_TAIL_MODE` are in
      `.env.example`, documented as optional; `pnpm build` passes with no AI env
      vars set; `lib/check-env.ts` is unchanged
- [x] The snapshot body is sent in a `cache_control` ephemeral block with the
      query trailing it uncached
- [x] Each model call emits one structured `ai_search` JSON log line (query
      length only, model, tail mode, thinking descriptor, latency, outcome,
      result count, token usage) on both the ok and the fallback path
- [x] `scripts/ai-search-eval.ts` runs a search from the CLI, builds the
      snapshot as `aiSearchAction` does, and supports `--snapshot`, `--mode=`,
      and `--compare`/`--serial`
- [x] Unit tests cover `aiSearchEnabled()`, the numeric-`AI_EFFORT`-on-Opus
      throw, and the log-line shape on both paths; a screen-level test covers
      the search box hidden when search is not enabled
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green, and
      `pnpm build` passes with no env vars set

## Blocked by

- 17 — AI search: mode polish, habit reasoning, and accessibility
