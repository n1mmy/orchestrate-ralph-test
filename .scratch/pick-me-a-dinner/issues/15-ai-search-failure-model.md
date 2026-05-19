# 15 — AI search: failure model and fallback

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Make AI search **fail safe**. When the model call cannot complete, the
Household loses nothing: the deterministic ranked list is left exactly as it
was, and an inline error explains what happened. AI search being down must
never block the Household from deciding dinner — the deterministic Tonight
ranking is the fallback.

In `lib/ai-search`, give the single model call a per-request timeout via an
`AbortController`. The budget is **90 seconds** (`REQUEST_TIMEOUT_MS`), not a
short window — extended thinking (ticket 17) makes the call substantially slower
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
is a real answer (the empty-state work is ticket 16), whereas malformed output
is a Failure and must fall back to the deterministic list.

On Tonight, when `aiSearchAction` returns the unavailable outcome, show a
**persistent inline error** under the search box ("Search unavailable — try
again") and leave the deterministic list untouched and exactly as-is. The error
is announced via an `aria-live` region. It is not cleared on submit — only when
the query is cleared (the Clear control) or a later search succeeds. The
Household can retry, or simply keep using the deterministic ranking.

## Acceptance criteria

- [ ] The model call carries a per-request timeout via `AbortController`, sized
      at 90 seconds (`REQUEST_TIMEOUT_MS`); a timed-out call is aborted, not
      left to hang
- [ ] The call is made exactly **once** — there is no retry, whatever the
      failure class
- [ ] Every failure mode — timeout/abort, HTTP error (429, 5xx, non-429 4xx),
      network error, a response with no `tool_use` block, and a `tool_use` block
      with malformed input — collapses to the single typed
      `AI_SEARCH_UNAVAILABLE` outcome
- [ ] `parseAndValidate` returns `null` for malformed tool input (`results`
      missing or not an array) and `[]` for a valid, genuinely empty result; the
      client treats `null` as the fallback and `[]` as `ok: true`
- [ ] A failed search leaves the deterministic list exactly as-is and shows a
      persistent inline error under the search box, announced to assistive tech
- [ ] The inline error clears on query-clear or a subsequent successful search,
      never on submit alone
- [ ] Unit tests (`lib/ai-search.test.ts`) cover each failure class mapping to
      `AI_SEARCH_UNAVAILABLE` with exactly one model call, the no-tool-use and
      malformed-input fallbacks, and the genuinely-empty result staying
      `ok: true`; a screen-level test covers "a failed search leaves the
      deterministic list intact and shows the error"
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green

## Blocked by

- 14 — AI search: end-to-end skeleton
