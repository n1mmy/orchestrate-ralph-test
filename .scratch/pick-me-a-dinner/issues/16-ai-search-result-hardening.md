# 16 — AI search: result hardening and empty state

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Harden the AI result so a sloppy, empty, or rationale-less model response still
produces a clean screen.

Complete `parseAndValidate` in `lib/ai-search`. Beyond dropping non-candidate
integers (ticket 14), it must: **skip a malformed entry** inside an otherwise
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
not skipped. In `pithy` tail mode (ticket 17) the model deliberately returns an
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
malformed-output Failure of ticket 15: an empty result is a real answer and
stays `ok: true`.

## Acceptance criteria

- [ ] `parseAndValidate` skips a malformed entry (non-string `reason`, or an
      `id` that is not an integer or numeric string) while keeping the valid
      rows around it
- [ ] `parseAndValidate` accepts a numeric-string `id` and rejects a float
- [ ] `parseAndValidate` dedupes a repeated Option, keeping the first occurrence
- [ ] `parseAndValidate` truncates a rationale over ~200 characters
      (`MAX_RATIONALE_LENGTH`) at the last word boundary with an ellipsis, and
      leaves a rationale within the cap unchanged
- [ ] An empty-string `reason` is kept by `parseAndValidate`; an AI row with an
      empty `aiReason` renders no rationale line — just the name and chips
- [ ] An empty AI result (`results: []`) renders a plain empty-state message
      with a clear control that returns the screen to the deterministic list
- [ ] Unit tests (`lib/ai-search.test.ts`) cover the skipped malformed entry,
      numeric-string acceptance, dedup, word-boundary truncation, a short
      rationale left unchanged, and an empty-string `reason` kept; a screen-level
      test covers an empty-reason row rendering no rationale paragraph and the
      empty-result empty-state
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green

## Blocked by

- 15 — AI search: failure model and fallback
