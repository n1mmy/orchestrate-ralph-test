# 05 — Pick = log and the Log screen

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

Models the shipped implementation in the reference build (`~/data/local/pick-me-a-dinner-2`). Background PRD: `.issues/pick-me-a-dinner-v1/PRD.md` in that repo — where it disagrees with the shipped code, the code wins. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

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

## Acceptance criteria

- [ ] "Pick" calls `pickTonight`, logs a `dinner_log` row for `today()` in one
      tap, briefly marks "Logged ✓", and re-sorts the list
- [ ] A double-tap on "Pick" is a no-op (`.onConflictDoNothing()` on
      `(option_id, eaten_on)`)
- [ ] The Log screen's "+ Add a dinner" form (`logForDate`) allows a past date
      (backfill) and a future date (Planned dinner); future entries are
      excluded from the Tonight ranking
- [ ] The Log screen shows a capped Upcoming strip above
      reverse-chronological history grouped by date; multi-entry dates render
      as one Dinner under one header
- [ ] Any Log entry edits inline (Option, date, note) via `updateLogEntry` or
      deletes via `deleteLogEntry`; a `logForDate`/`updateLogEntry` edit
      violating `unique(option_id, eaten_on)` (`23505`) shows the inline
      "Already logged for that date" error with input preserved
- [ ] Delete uses the §17 inline-confirm pattern; Log §17 states (loading,
      empty, error, quiet "Saved") are covered
- [ ] `app/log/actions.db.test.ts` covers: `pickTonight` inserts for today;
      double-tap no-op; `logForDate` past + future; `updateLogEntry`
      Option/date/note; `deleteLogEntry`; the `unique`-conflict rejection

## Blocked by

- 04 — Tonight: ranked list
