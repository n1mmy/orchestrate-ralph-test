# 04 — Tonight: ranked list

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The Tonight screen — the home screen — showing the active Catalog ranked by
Score, read-only (the "Pick tonight" write path is ticket 05).

Build the **ranking engine** (`lib/ranking.ts`) as a deep, pure module per
ADR-0003 — no DB, no React, integer arithmetic only. Internals: `daysSince(day
| null, today)` → `CAP` when `day` is `null`, else `max(0, min(CAP, today −
day))` (the `max(0,…)` guards a future day); `lastEaten(entries, optionId,
today)` and `lastTagUse(entries, options, tag, today)` — the most-recent
`eatenOn` that is **not after `today`** (future Planned dinners excluded),
`null` when there is none; `optionScore(antiRepeat, tagDays)` = `W_OPTION·
antiRepeat + W_TAG·variety`, where `variety` is `mean(tagDays)` for a tagged
Option and equals `antiRepeat` for a tagless one. `rankTonight(options,
entries, today)` returns a `TonightRow[]` sorted descending by Score with an
alphabetical `localeCompare` tie-break — which also *is* the cold-start fallback
(with no non-future Log history every Score ties, so the list is alphabetical).
Constants live in `lib/ranking.config.ts`: `CAP = 60`, `W_OPTION = 1.0`,
`W_TAG = 1.0`, `OVERDUE_THRESHOLD = 14`.

**There is no Explanation chip and `lib/ranking.ts` computes no explanation
string.** A `TonightRow` is `{ option, score, tags: TagRecency[], recencyDays,
neverEaten }`: `recencyDays` is the Option's own per-Option recency in days
(capped at `CAP`, the `antiRepeat` term); `neverEaten` is `true` when the Option
has no non-future Log entry; each `TagRecency` is `{ tag, days, overdue }` where
`overdue` is `days >= OVERDUE_THRESHOLD`. `RankOption` carries `id`, `name`,
`kind`, `tags`, `url`, `phone` (the last two are passed through for later
phases; the ranking math ignores them).

Build the **local-day module** (`lib/local-day.ts`) — a deep, pure module
converting a SQL `date` and "now" into integer epoch-days in `APP_TZ`, so
"today" is the Household's calendar day, not the server's UTC day. It exports
`epochDayFromSqlDate(sqlDate)`, `isValidSqlDate(value)` (shape *and* a real
calendar day — `2026-02-30` is rejected), `todaySqlDate(now, timeZone)` (via
`Intl` `en-CA`), `todayEpochDay`, and the one impure convenience `today()` —
`todaySqlDate(new Date(), process.env.APP_TZ ?? "UTC")`. All recency subtraction
goes through epoch-days; the conversion must be correct across a DST boundary.

The `/catalog`-style `force-dynamic` `/` page loads `getTonightData(todaySql)`
from `db/queries.ts` — the active Options with their Tags, plus the Log entries
filtered to `eaten_on <= today` and joined to active Options only — converts
`eaten_on` to epoch-days, and calls `rankTonight`. The screen renders a **flat,
uniform list** as an `<ol>` (PRD §18): no lead-option prominence, no collapsed
long tail, no per-row background tint, every row the same shape, separated by a
1px `line` rule. Each row (`TonightRow` component) shows the rank number in
Geist Mono, the Option **name as plain text** (not a link — the `/catalog/[id]`
link is a later phase), then the chip row, then the "Pick" button placeholder
(wired in ticket 05). This ticket builds the two `DESIGN.md` color channels
against the ticket-01 tokens: add `lib/recency-color.ts` — `recencyColor(days)`
interpolates a `color-mix()` red→green heatmap over the `--color-recency-*`
variables (recent→mid below the midpoint, mid→overdue above), with
`recencyChipBg` (faint, transparent 86%) and `recencyChipBgStrong` (louder,
transparent 62%) — and render the per-row 3px solid meal-kind left bar via
`app/kind-bar.ts`'s `kindBarClass` (`kind-home` teal / `kind-restaurant` plum).

The chip row carries, first, the **Recency chip** — the Option's per-Option
recency: `Nd`, or `60d+` at the `CAP` ceiling, or the literal `new` when
`neverEaten` — on a `recencyChipBgStrong` heatmap fill, numerals in Geist Mono.
Then one **Tag chip** per Tag: the Tag name with its per-Tag recency (`Nd` /
`60d+`, numerals in Geist Mono) on a fainter `recencyChipBg` fill, each tinted
on the heatmap by that Tag's own recency — overdue tags greener at `days >=
OVERDUE_THRESHOLD`. The Recency chip always renders; Tag chips render only when
the Option carries Tags. Empty Catalog → "Your Catalog is empty. Add your first
meals →" linking to `/catalog`.

## Acceptance criteria

- [x] Tonight renders the active Catalog as a flat uniform `<ol>` ranked
      descending by Score, each row with the rank number, the 3px meal-kind
      left bar (`kindBarClass`), the Option name as plain text, the Recency
      chip, and the Tag chips
- [x] `lib/ranking.ts` and `lib/local-day.ts` are pure modules with no DB or
      React dependency; `TonightRow` carries `recencyDays` + `neverEaten` +
      `tags: TagRecency[]` and **no explanation string**
- [x] The Recency chip shows `Nd` / `60d+` / `new` on a `recencyChipBgStrong`
      heatmap fill; Tag chips show `tag Nd` on a fainter `recencyChipBg` fill,
      each tinted by its own recency via `lib/recency-color.ts`
- [x] Cold start (zero non-future Log entries) falls back to alphabetical
      order; an empty Catalog shows the "Add your first meals →" prompt
- [x] Overdue Tag chips render greener (the overdue heatmap end) at `days >=
      OVERDUE_THRESHOLD` (14)
- [x] `lib/ranking.test.ts` covers `daysSince` (null→CAP, normal, capped,
      future guard), `lastEaten`/`lastTagUse` (most-recent non-future, future
      excluded, null on no history), `optionScore` (tagged, tagless, cold
      start), the `overdue` threshold, and the `rankTonight` sort with its
      cold-start alphabetical fallback; `lib/local-day.test.ts` covers
      epoch-day conversion across a DST boundary; `lib/recency-color.test.ts`
      covers the heatmap interpolation. **No `explanationChip` tests** — there
      is no such function

## Blocked by

- 02 — Catalog: Options CRUD (extends `db/queries.ts`; the `tags` /
  `option_tags` schema is already in place from ticket 01)
