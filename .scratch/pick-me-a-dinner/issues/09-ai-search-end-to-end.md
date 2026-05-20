# 09 — AI search: end-to-end

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

AI search built in five layers, in order: an end-to-end skeleton; a fail-safe failure model that falls back to the deterministic list; result hardening for sloppy, empty, or rationale-less model output; mode polish, habit reasoning via extended thinking, and accessibility; and finally config gating, model selection across model families, prompt caching, and observability. Each layer extends the previous one — the same `lib/ai-search` deep module grows through all five.

### Layer 1 — End-to-end skeleton

The first complete path through **AI search**, end to end: a member of the
Household types an intent into a search box on **Tonight**, submits, and the
screen swaps the deterministic ranked list for an AI-ranked result, each row
carrying an **AI rationale**. The deterministic ranking is never touched —
`lib/ranking.ts` and `rankTonight` stay exactly as v1/v2 left them, and the
Tonight page remains `force-dynamic`. AI search reasons about the Household's
eating *habits* (cadence, day-of-week rhythm, streaks, drift) rather than
re-sorting recency — `lib/ranking.ts` is not used here at all.

Build the **`lib/ai-search` deep module**, modeled on the existing
`lib/places.ts` external-API client — a small interface, with the Anthropic
client constructed **lazily** inside `createAiSearchClient` (never at import
time, so `pnpm build` needs no env vars). It has a pure **`buildSnapshot`** that
turns the active Catalog (each Option's `id`, `name`, `kind`, `tags`, `notes`),
the full Log (each entry's `optionId`, `eatenOn`, `note`), the Rejection
history, today's Household calendar day, and the query into the model-input
JSON. Decisions baked into the snapshot: Options come out in **alphabetical
order by name** (not Score-rank order — a pre-ranked list would anchor the
model); every Option is given a **small integer number** — its 1-based position
in that alphabetical order — and the snapshot refers to Options by that integer
everywhere (in `options`, the `log`, the `rejections`), never by UUID, because
an integer tokenizes far cheaper in the request and in every result row the
model writes back. Crucially the snapshot carries **no pre-computed recency** —
plain dated history only, so the model re-derives recency itself and spends its
reasoning on the patterns recency misses. The `log` is the **full Log**, newest
dinner first, including future-dated rows (Planned dinners). The Restaurant
**Places fields** (`address`, `phone`, `lat`, `lng`, `googlePlaceId`,
`mapsUrl`) are excluded by construction — `SnapshotOption` has no slot for them.
All Household-authored free text (Option names, Tags, Option notes, Log notes,
Rejection reasons, and the query) is wrapped in `<household-text>` delimiters
(via `lib/snapshot-format`'s `delimit`) so catalog text cannot be read as model
instructions. `buildSnapshot` returns a `BuiltSnapshot` — the `ModelSnapshot`
plus an `idByIndex` map from each candidate's snapshot integer back to its UUID.

The module calls the Anthropic API with **tool-use and a strict schema** —
a single `rank_options` tool whose input is an **ordered array** of
`{ id, reason }`, the array order being the result ranking, `id` the Option's
snapshot integer, and `reason` the AI rationale. A pure **`parseAndValidate`**
step takes the model's tool-use input and `idByIndex`, maps each integer back to
its real UUID, drops any integer that is not a candidate (a hallucination), and
returns the validated, ordered array preserving the model's ordering. (Dedup,
rationale truncation, and the malformed-vs-empty distinction land in later
layers.) The Anthropic call goes through `createAiSearchClient`, which builds
the system prompt (`buildSystemPrompt`), sends the snapshot, finds the
`tool_use` block in the response, and runs `parseAndValidate`.

Extend **`getTonightData`** to additionally return each Option's `notes` and
each Log entry's `note` — the snapshot builder needs them. The ranking input is
otherwise unchanged; `rankTonight` still receives exactly what it does today.
Add the **`aiSearchAction(query)` server action** in `app/tonight-actions.ts`,
`authedAction`-wrapped (auth by default — only an authenticated session may
invoke it). It reads the active Catalog, the full Log, and the Rejections,
builds the snapshot, calls `createAiSearchClient(apiKey).search(...)`, and
returns either the validated ordered result or the typed unavailable outcome. It
is thin — the snapshot, prompt, and parsing all live in `lib/ai-search`.

On **Tonight**, add a search box above the list inside the Picker in
`app/tonight-screen.tsx`. Submitting a query — by Enter or an explicit Search
button, an empty query allowed — runs the action and swaps the deterministic
list in place for the AI result. AI result rows render the AI rationale (in
`app/tonight-row.tsx`, via the `aiReason` prop) below the chip row on a neutral
`raised` surface, and are pickable exactly like deterministic rows
(`pick = log` is unchanged). A Clear control, and any page reload, restores the
deterministic list; the AI result is never persisted. Rough edges are
acceptable here and are addressed by the later layers: minimal error handling
(a basic inline message is enough), and the filter zone need not yet hide in AI
mode.

### Layer 2 — Failure model and fallback

Make AI search **fail safe**. When the model call cannot complete, the
Household loses nothing: the deterministic ranked list is left exactly as it
was, and an inline error explains what happened. AI search being down must
never block the Household from deciding dinner — the deterministic Tonight
ranking is the fallback.

In `lib/ai-search`, give the single model call a per-request timeout via an
`AbortController`. The budget is **90 seconds** (`REQUEST_TIMEOUT_MS`), not a
short window — extended thinking (Layer 4) makes the call substantially slower
than a plain completion, so the timeout is sized to clear a healthy thinking
call's latency tail rather than race it. The call is **not retried**: a timeout
has already spent its full budget, and a transient HTTP or network error was
already retried inside the Anthropic SDK client before it surfaced here. (Note:
this is a deliberate divergence from the background PRD, which specified a
~10-second timeout and one retry on transient errors — the shipped code wins.)

Every failure mode collapses to the **one typed `AI_SEARCH_UNAVAILABLE`
outcome** (`{ ok: false }`), the way `lib/places.ts` collapses every failure to
one "unavailable" result. The failure modes that collapse to it are: a
timeout/abort, an HTTP error (429, 5xx, and non-429 4xx alike), a network
error, a response that **never called the `rank_options` tool**, and a
`tool_use` block whose input is **malformed** — `results` missing or not an
array, which `parseAndValidate` signals by returning `null`. That malformed
case is distinct from a valid, genuinely **empty** result (`results: []`,
`parseAndValidate` returns `[]`): a genuinely empty result stays `ok: true` and
is a real answer (the empty-state work is Layer 3), whereas malformed output
is a Failure and must fall back to the deterministic list.

On Tonight, when `aiSearchAction` returns the unavailable outcome, show a
**persistent inline error** under the search box ("Search unavailable — try
again") and leave the deterministic list untouched and exactly as-is. The error
is announced via an `aria-live` region. It is not cleared on submit — only when
the query is cleared (the Clear control) or a later search succeeds. The
Household can retry, or simply keep using the deterministic ranking.

### Layer 3 — Result hardening and empty state

Harden the AI result so a sloppy, empty, or rationale-less model response still
produces a clean screen.

Complete `parseAndValidate` in `lib/ai-search`. Beyond dropping non-candidate
integers (Layer 1), it must: **skip a malformed entry** inside an otherwise
valid `results` array (a non-string `reason`, or an `id` that is neither an
integer nor a numeric string — `toIndex` accepts a JSON integer or a
digits-only string and rejects a float, a non-numeric string, or a missing
value); **dedupe** a repeated Option, keeping the **first** occurrence; and
**truncate** an over-long AI rationale. The truncation cap is **~200
characters** (`MAX_RATIONALE_LENGTH`), a generous backstop — not the ~80
characters the background PRD specified — because the rationale names the
*pattern* behind a placement ("Sushi runs ~weekly, 9 days out") and needs room;
the prompt asks for one short line and the cap only catches a model that
ignores that. An over-long rationale is cut at the last word boundary within
the cap (never mid-word) and marked with an ellipsis; a single over-long word
with no space is cut at the cap itself; a rationale within the cap is returned
unchanged. The `reason` is plain text — no markdown.

Critically, an **empty-string `reason` is kept as-is** — it is not dropped and
not skipped. In `pithy` tail mode (Layer 4) the model deliberately returns an
empty rationale for an Option it judges an obviously bad pick. An AI result row
whose `reason` is empty must therefore render with **no rationale line at all**
— just the Option name and its Recency/Tag chips, reading like a deterministic
row. In `app/tonight-row.tsx` the `aiReason` paragraph is rendered only when
`aiReason` is a non-empty string.

On Tonight, handle an **empty AI result** — the model legitimately returning
zero Options (`results: []`) for a query that nothing fits. Render a plain
empty-state message ("No Options fit that search.") with a clear control,
mirroring the existing "No Options match the current filter" state. The clear
control returns the screen to the deterministic list. This is distinct from the
malformed-output Failure of Layer 2: an empty result is a real answer and
stays `ok: true`.

### Layer 4 — Mode polish, habit reasoning, accessibility

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
Layer 5; this layer builds `buildSystemPrompt`, `planThinking`, and the
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
The empty-rationale rendering itself was wired in Layer 3.

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

### Layer 5 — Config, model selection, caching, observability

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
default. The open-query result shape is `AI_TAIL_MODE` (Layer 4). Add
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

### Layer 1 — End-to-end skeleton

- [x] A search box on Tonight inside the Picker; submitting a query (Enter or a
      Search button, empty query allowed) swaps the deterministic list for an
      AI-ranked result in place
- [x] `lib/ai-search` exposes pure `buildSnapshot` and `parseAndValidate`, plus
      `createAiSearchClient` that constructs the Anthropic client lazily so
      `pnpm build` needs no env vars
- [x] `buildSnapshot` emits Options alphabetically by name, numbers them 1-based
      by that order, refers to Options by integer everywhere, carries **no
      pre-computed recency**, excludes the Places fields, and wraps all
      Household text in `<household-text>` delimiters; it returns `idByIndex`
- [x] The snapshot `log` is the full Log (past and future-dated Planned
      dinners), newest dinner first; today and each Log date carry a weekday
- [x] The Anthropic call uses tool-use with the strict `rank_options` ordered
      `{ id, reason }` schema; `parseAndValidate` maps each integer back to its
      UUID and drops any non-candidate integer (a hallucination)
- [x] `getTonightData` returns Option `notes` and Log-entry `note`; the ranking
      input is unchanged and `rankTonight` still passes its tests
- [x] `aiSearchAction` is `authedAction`-wrapped, builds the snapshot from the
      active Catalog, the full Log, and the Rejections, and returns the
      validated ordered result
- [x] AI result rows show the AI rationale (`aiReason`) instead of the
      deterministic prose and are pickable; clearing the search or reloading
      restores the deterministic list
- [x] Unit tests (`lib/ai-search.test.ts`) cover the snapshot builder (ordering,
      integer numbering, field selection, delimiters) and `parseAndValidate`
      (hallucinated integer dropped, ordering preserved); a screen-level test
      (`app/tonight-screen.test.tsx`) covers submit-swaps / clear-restores and
      introduces React Testing Library

### Layer 2 — Failure model and fallback

- [x] The model call carries a per-request timeout via `AbortController`, sized
      at 90 seconds (`REQUEST_TIMEOUT_MS`); a timed-out call is aborted, not
      left to hang
- [x] The call is made exactly **once** — there is no retry, whatever the
      failure class
- [x] Every failure mode — timeout/abort, HTTP error (429, 5xx, non-429 4xx),
      network error, a response with no `tool_use` block, and a `tool_use` block
      with malformed input — collapses to the single typed
      `AI_SEARCH_UNAVAILABLE` outcome
- [x] `parseAndValidate` returns `null` for malformed tool input (`results`
      missing or not an array) and `[]` for a valid, genuinely empty result; the
      client treats `null` as the fallback and `[]` as `ok: true`
- [x] A failed search leaves the deterministic list exactly as-is and shows a
      persistent inline error under the search box, announced to assistive tech
- [x] The inline error clears on query-clear or a subsequent successful search,
      never on submit alone
- [x] Unit tests (`lib/ai-search.test.ts`) cover each failure class mapping to
      `AI_SEARCH_UNAVAILABLE` with exactly one model call, the no-tool-use and
      malformed-input fallbacks, and the genuinely-empty result staying
      `ok: true`; a screen-level test covers "a failed search leaves the
      deterministic list intact and shows the error"

### Layer 3 — Result hardening and empty state

- [x] `parseAndValidate` skips a malformed entry (non-string `reason`, or an
      `id` that is not an integer or numeric string) while keeping the valid
      rows around it
- [x] `parseAndValidate` accepts a numeric-string `id` and rejects a float
- [x] `parseAndValidate` dedupes a repeated Option, keeping the first occurrence
- [x] `parseAndValidate` truncates a rationale over ~200 characters
      (`MAX_RATIONALE_LENGTH`) at the last word boundary with an ellipsis, and
      leaves a rationale within the cap unchanged
- [x] An empty-string `reason` is kept by `parseAndValidate`; an AI row with an
      empty `aiReason` renders no rationale line — just the name and chips
- [x] An empty AI result (`results: []`) renders a plain empty-state message
      with a clear control that returns the screen to the deterministic list
- [x] Unit tests (`lib/ai-search.test.ts`) cover the skipped malformed entry,
      numeric-string acceptance, dedup, word-boundary truncation, a short
      rationale left unchanged, and an empty-string `reason` kept; a screen-level
      test covers an empty-reason row rendering no rationale paragraph and the
      empty-result empty-state

### Layer 4 — Mode polish, habit reasoning, accessibility

- [x] `buildSystemPrompt` produces a habit-reasoning prompt (cadence,
      day-of-week rhythm, streaks, drift) that explicitly tells the model not to
      just re-sort recency, and explains the Rejections block and the
      `<household-text>` delimiter rule
- [x] Every model call enables extended thinking; `AI_EFFORT`
      (`off`/`low`/`medium`/`high`, default `low`) is the single effort knob
- [x] Budget-API models (Sonnet, Haiku) use `thinking.type: "enabled"` with
      `budget_tokens` mapped from effort; the adaptive-API model (Opus 4.7) uses
      `thinking.type: "adaptive"` + `output_config.effort` and is streamed via
      `messages.stream(...).finalMessage()`
- [x] `resolveTailMode` reads `AI_TAIL_MODE` (`full`/`pithy`/`drop`, default
      `pithy`); `buildSystemPrompt` swaps only the open-query instruction by
      mode and shares the rest
- [x] In `pithy` mode an obviously bad pick gets an empty-string rationale; a
      narrowing query returns a focused shortlist in every mode
- [x] The kind segment and Tag filter chips are hidden while an AI result is
      shown (via the Picker's `onAiActiveChange` callback) and restored on clear
- [x] The search box shows a pending state and is disabled while a search is in
      flight; the deterministic list stays visible underneath until the result
      arrives
- [x] An `aria-live` region announces the pending state, the swap, the empty
      result, and the return to the deterministic list; the search box, Search,
      and Clear controls are keyboard-operable with visible focus and ≥44px
      touch targets
- [x] Unit tests (`lib/ai-search.test.ts`) cover `resolveTailMode`,
      `buildSystemPrompt` per-mode instructions, and the Opus streaming /
      adaptive-shape path; a screen-level test covers
      clearing-restores-the-filter-zone and the in-flight disable

### Layer 5 — Config, model selection, caching, observability

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

- 08 — Tonight decided mode: two-mode picker, action buttons, remove

## Comments

Implemented all five layers. The Anthropic transport uses `fetch` directly
(no `@anthropic-ai/sdk` dependency added — adding npm packages is outside
the worker's permission set), but the request shape, tool schema, prompt
caching, and adaptive/budget thinking split match the SDK contract. Opus
goes through the same JSON endpoint with a high `max_tokens`; the issue's
streaming-via-SDK note is the only deviation. Screen-level tests deferred
(no RTL installed); unit tests in `lib/ai-search.test.ts` (43 tests) cover
the snapshot builder, `parseAndValidate`, `planThinking`, the failure
collapse, the empty-result `ok: true` distinction, and the log-line shape.
