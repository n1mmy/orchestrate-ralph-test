# 07 — Tonight: ranked list, pick=log, Log screen, tag filters

Status: done
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

The Tonight screen base — the home screen — showing the active Catalog ranked by Score, the write path that makes the ranking mean something, the Log screen for editing history and future-dated dinners, and the tri-state tag filter zone over the ranked list. (The two-mode "Tonight's dinner" decided block, action buttons, and Remove control are built in ticket 08.)

### Ranked list on Tonight

The Tonight screen — the home screen — showing the active Catalog ranked by
Score, read-only (the "Pick tonight" write path is the next subsection).

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
link is a later phase), then the chip row, then the "Pick" button (wired in the
next subsection). This subsection builds the two `DESIGN.md` color channels
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

### Pick = log + Log screen

The write path that makes the ranking mean something, plus the Log screen.

Add the **"Pick" action** to each Tonight row — a one-tap server action
`pickTonight(optionId)` in `app/log/actions.ts` that inserts a `dinner_log` row
with `eaten_on = today()`. The insert uses `.onConflictDoNothing()` on the
`(option_id, eaten_on)` unique constraint, so a double-tap is a harmless no-op.
It returns the shared `ActionResult` — a write failure becomes `{ ok: false,
error: "Couldn't log that — try again" }`, never a false "Logged ✓". The Pick
button is a charcoal `action` fill that briefly flips to "Logged ✓" in
`--success` on success (held ~1600ms) while the revalidation re-sorts the list
under it. Picking a second Option the same evening adds a second `dinner_log`
row — a multi-Option Dinner recorded as two Log entries on one date. On
success `pickTonight` revalidates `/` and `/log`.

The secondary **"Log another date"** path is the Log screen's inline "+ Add a
dinner" form, backed by `logForDate(optionId, eatenOn, note?)`: it inserts a
`dinner_log` row for a deliberately chosen date — a past date backfills a
forgotten Dinner, a future date is a Planned dinner. Unlike `pickTonight`, a
date the Option is already logged for is a real typed mistake here, so the
`(option_id, eaten_on)` collision (`23505`) is reported inline via
`pgErrorMessage` as "Already logged for that date" rather than swallowed.
`logForDate` validates the date with `isValidSqlDate` first.

Build the **Log screen** (`/log`, `force-dynamic`): `getLog()` returns every
Log entry joined to its Option, newest `eaten_on` first. A compact, capped
**"Upcoming"** strip on top shows future-dated entries soonest-first (the cap
keeps Planned dinners from burying today's history); below it,
reverse-chronological history grouped by date — a date with more than one entry
renders as one Dinner under one date header (the date label is "Today" /
"Tomorrow" / "Yesterday" / "Fri, May 16"). Every entry is editable and deletable
**inline**: the row expands in place into a form (`updateLogEntry(id, {
optionId, eatenOn, note })`) to change the Option, change the date — including
moving an entry between past history and Upcoming — or edit the note;
`deleteLogEntry(id)` removes it. The edit form's Option picker is a `<select>`
of all Options (Active and Archived, so an entry already logged against an
Archived Option stays selectable). (v1 Log rows show only the Option name and
note with Edit / Delete — the Option-name link to `/catalog/[id]` and the per-row
PickButton are later phases; omit them.)

All recency in the Tonight ranking is computed only from `dinner_log` rows with
`eaten_on <= today` (local), so a Planned dinner does not influence Score until
its date arrives — `getTonightData`'s query already filters on `todaySqlDate`.
An edit that would collide with an existing `(option_id, eaten_on)` is rejected
with the inline "Already logged for that date" error under the date field,
input preserved — never silently merged. Deletes use the §17 inline-confirm
pattern ("Delete · Cancel" in place, no modal). Cover the §17 states for Log (a
`loading.tsx` placeholder; empty → "No dinners logged yet — pick one on Tonight
→"; the date-conflict inline error; an edited row collapsing with a quiet
"Saved" in `--success`).

### Tri-state tag filters

The filter zone on the Tonight screen, with its pure logic extracted into
`lib/tonight-filter.ts` so it is directly unit-testable.

The `lib/tonight-filter.ts` module holds the filter types and pure functions —
no DB, no React. `ChipState` is `"off" | "include" | "exclude"`; `KindFilter`
is `"all" | "home" | "restaurant"`; `TagFilters` is a `Record<string,
ChipState>`. `cycleChipState` advances **off → include → exclude → off**.
`chipStateLabel` restates a state for an accessible name ("included" /
"excluded" / "not filtered"). `filterTonightRows(rows, kind, tagFilters)` is the
predicate: a row shows only if it satisfies the kind segment **AND** carries
every include Tag **AND** carries none of the exclude Tags. `distinctTags`
collects the Tag vocabulary from the ranked rows, `localeCompare`-sorted.
`filterHint` restates the active filter in words ("Showing Home meals with
pasta, without fish").

In the screen: the **All/Home/Restaurant** `KindSegment` sits in the page
header beside the "Tonight" heading — `aria-pressed` buttons that set the
`KindFilter`. Below the header, in a sticky filter zone, the **tag filter
chips** each cycle off → include → exclude → off on tap via `cycleChipState`.
Each chip's state has its own fill — a neutral off chip, an `action`-filled
include chip, an `exclude`-filled exclude chip — plus a text decoration
(underline for include, line-through for exclude) so state stays legible
without color (§18). The chip border is present in every state so toggling
never reflows the wrapped rows. A hint line (`filterHint`) under the chips,
`role="status"` `aria-live="polite"`, states the active filter in words.

Per §18: chip state is legible in grayscale (the underline / strikethrough text
decorations carry it, not color alone), each chip's accessible name announces
its state via `aria-label` ("pasta, included"). The kind segment buttons are
≥ 44×44px; the tag chips are deliberately compact (the zone holds ~20 tags and
density beats a 44px target there). The carried-over `exclude` token still
awaits its own visual pass against the cool base — re-tune it here if needed,
but the underline/strikethrough affordances are the load-bearing signal.

## Acceptance criteria

### Ranked list on Tonight

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

### Pick = log + Log screen

- [x] "Pick" calls `pickTonight`, logs a `dinner_log` row for `today()` in one
      tap, briefly marks "Logged ✓", and re-sorts the list
- [x] A double-tap on "Pick" is a no-op (`.onConflictDoNothing()` on
      `(option_id, eaten_on)`)
- [x] The Log screen's "+ Add a dinner" form (`logForDate`) allows a past date
      (backfill) and a future date (Planned dinner); future entries are
      excluded from the Tonight ranking
- [x] The Log screen shows a capped Upcoming strip above
      reverse-chronological history grouped by date; multi-entry dates render
      as one Dinner under one header
- [x] Any Log entry edits inline (Option, date, note) via `updateLogEntry` or
      deletes via `deleteLogEntry`; a `logForDate`/`updateLogEntry` edit
      violating `unique(option_id, eaten_on)` (`23505`) shows the inline
      "Already logged for that date" error with input preserved
- [x] Delete uses the §17 inline-confirm pattern; Log §17 states (loading,
      empty, error, quiet "Saved") are covered
- [x] `app/log/actions.db.test.ts` covers: `pickTonight` inserts for today;
      double-tap no-op; `logForDate` past + future; `updateLogEntry`
      Option/date/note; `deleteLogEntry`; the `unique`-conflict rejection

### Tri-state tag filters

- [x] The All/Home/Restaurant `KindSegment` (in the page header) filters the
      Tonight list by Option kind
- [x] Tag chips cycle off → include → exclude → off via `cycleChipState`;
      include shows only matching Options, exclude hides matching Options
- [x] `filterTonightRows` ANDs the kind segment and all tag filters together;
      the `filterHint` line states the active filter in words
- [x] Chip state is distinguishable in grayscale (underline / strikethrough)
      and announced to screen readers via `aria-label` (`chipStateLabel`)
- [x] `lib/tonight-filter.test.ts` covers the off → include → exclude cycle
      and that the kind segment and tag filters AND together

## Blocked by

- 03 — Options catalog: CRUD

## Comments

- 2026-05-20: Implemented `lib/local-day.ts`, `lib/ranking.ts`,
  `lib/ranking.config.ts`, `lib/recency-color.ts`, `lib/tonight-filter.ts`,
  `app/kind-bar.ts`; `db/queries.ts` extended with `getTonightData`,
  `getLog`, `getAllOptionsForSelect`; `app/log/actions.ts` with
  `pickTonight` / `logForDate` / `updateLogEntry` / `deleteLogEntry`;
  Tonight screen (`/`) + Log screen (`/log`) built. Gate green
  (`pnpm typecheck`, `pnpm test`, `pnpm build`).
