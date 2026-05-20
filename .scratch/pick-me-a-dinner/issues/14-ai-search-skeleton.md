# 14 — AI search: end-to-end skeleton

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

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
rationale truncation, and the malformed-vs-empty distinction land in tickets 15
and 16.) The Anthropic call goes through `createAiSearchClient`, which builds
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
acceptable here and are addressed by the issues blocked on this one: minimal
error handling (a basic inline message is enough), and the filter zone need not
yet hide in AI mode.

## Acceptance criteria

- [ ] A search box on Tonight inside the Picker; submitting a query (Enter or a
      Search button, empty query allowed) swaps the deterministic list for an
      AI-ranked result in place
- [ ] `lib/ai-search` exposes pure `buildSnapshot` and `parseAndValidate`, plus
      `createAiSearchClient` that constructs the Anthropic client lazily so
      `pnpm build` needs no env vars
- [ ] `buildSnapshot` emits Options alphabetically by name, numbers them 1-based
      by that order, refers to Options by integer everywhere, carries **no
      pre-computed recency**, excludes the Places fields, and wraps all
      Household text in `<household-text>` delimiters; it returns `idByIndex`
- [ ] The snapshot `log` is the full Log (past and future-dated Planned
      dinners), newest dinner first; today and each Log date carry a weekday
- [ ] The Anthropic call uses tool-use with the strict `rank_options` ordered
      `{ id, reason }` schema; `parseAndValidate` maps each integer back to its
      UUID and drops any non-candidate integer (a hallucination)
- [ ] `getTonightData` returns Option `notes` and Log-entry `note`; the ranking
      input is unchanged and `rankTonight` still passes its tests
- [ ] `aiSearchAction` is `authedAction`-wrapped, builds the snapshot from the
      active Catalog, the full Log, and the Rejections, and returns the
      validated ordered result
- [ ] AI result rows show the AI rationale (`aiReason`) instead of the
      deterministic prose and are pickable; clearing the search or reloading
      restores the deterministic list
- [ ] Unit tests (`lib/ai-search.test.ts`) cover the snapshot builder (ordering,
      integer numbering, field selection, delimiters) and `parseAndValidate`
      (hallucinated integer dropped, ordering preserved); a screen-level test
      (`app/tonight-screen.test.tsx`) covers submit-swaps / clear-restores and
      introduces React Testing Library
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green, and
      `pnpm build` passes with no env vars set

## Blocked by

- 11 — Two-mode Tonight (the search box renders inside the decided-mode
  picker in `app/tonight-screen.tsx`; the action buttons of 12/13 are not
  on the AI-search path)

## Comments

- attempt 1: permission-denied on `env -i PATH="$PATH" HOME="$HOME" pnpm build 2>&1 | tail -30` — a compound shape (env-prefix + pipe + redirect) the matcher rejects as one pattern. To verify the "passes with no env vars" criterion, run a bare `pnpm build` in your worktree (a fresh worktree already has none of the runtime env vars set); do not try to clear the environment with an `env -i` prefix or pipe output through `tail`. Run each gate command bare, no compound shapes.
