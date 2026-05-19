# Pick Me a Dinner

The shared language of a small personal web app that helps one household
decide what's for dinner each night. This glossary is the canonical
vocabulary: code, issues, tests, and docs should use these terms and avoid the
listed aliases.

## Language

### The catalog

**Option**:
A single thing the household could choose for dinner — either a home-cooked
meal or a restaurant. The unit of the Catalog and the unit ranked on Tonight.
_Avoid_: Item, dish, "meal" used as the unified term (a Restaurant is not a
meal).

**Home meal**:
An Option cooked at home (`kind = 'home'`).
_Avoid_: Recipe.

**Restaurant**:
An Option for eating out or ordering in (`kind = 'restaurant'`).
_Avoid_: Place, venue.

**Catalog**:
The full set of Options the household maintains.

**Option detail page**:
A screen showing everything about a single Option — its fields, its ranking
data (Score and recency), its Log history, and its Rejections — reached by
tapping the Option's name anywhere it appears, and carrying every control that
makes sense for that Option.
_Avoid_: Restaurant page (the page serves both kinds of Option, not only
Restaurants).

**Tag**:
A free-form, case-insensitive label attached to an Option (e.g. `pasta`,
`fish`, `helen: burger`). Drives the variety side of the ranking.

### The log

**Log entry**:
A single record that one Option was — or will be — eaten on one date (one
`dinner_log` row).
_Avoid_: "Dinner" for a single row (the prior app's `Dinner` table meant this;
v1 does not).

**Dinner**:
A whole evening's eating: one calendar date, composed of one or more Log
entries (e.g. takeout plus some home cooking). The app never stores a Dinner
as a row — it is the eating on a date. The Log screen groups by date and shows
each date's Dinner together with that date's Rejections.

**Log**:
The full history of Log entries — both the `dinner_log` table and the screen
that shows it.
_Avoid_: Choices (too close to Option — the Log is realized history, not
candidate options).

**Tonight's dinner**:
Today's Dinner — the Log entries dated today — as surfaced on the Tonight
screen once the Household has Picked. May be one Option or several.

**Pick** (verb):
To choose tonight's dinner. Picking creates a Log entry dated today —
"pick = log". A Pick *is* a Log entry; there is no separate "pick" entity.

**Planned dinner**:
A Log entry dated after today. Excluded from the ranking until its date
arrives; shown in the Log screen's "Upcoming" section.
_Avoid_: Plan, Upcoming entry (as the domain term — "Upcoming" is only the
screen section's heading).

**Rejection**:
A record that the Household passed an Option over for one night's dinner,
carrying an optional short reason ("closed on Sundays", "too heavy for
tonight"). It is created two ways: live on a Tonight row in the moment, or
entered by hand on the Log screen or the Option detail page for a deliberately
chosen date — a past date backfills a Rejection never recorded live, a future
date is a **Planned rejection**. On the date it carries, a Rejection removes
its Option from Tonight's list for that day (the Option returns on its own the
next day); it is also kept as dated history fed into future AI searches, where
the model judges from the reason which Rejections are a standing dislike and
which were one-off. A Rejection can be edited or deleted at any time from the
Log screen or the Option detail page. **Bring back** is the narrower same-day
quick-undo on Tonight's "Rejected tonight" disclosure. A Rejection is not a Log
entry and does not affect any Score.
_Avoid_: Archive (a Rejection covers one night; Archive removes an Option from
the Catalog until un-archived). Avoid "reject" for declining a whole AI result.

**Planned rejection**:
A Rejection dated after today — the mirror of a Planned dinner. Entered by hand
to turn an Option down in advance for a known future night ("Aji Ichi is closed
this coming Sunday"); when that date arrives it suppresses the Option from
Tonight just as a same-day Rejection does. Shown in the Log screen's "Upcoming"
section alongside Planned dinners. One specific date only — a recurring closure
is left for the AI model to infer from Rejection history.
_Avoid_: Recurring rejection (a Planned rejection is a single date).

### Ranking

**Tonight**:
The home screen. It ranks active Options by Score (descending) for the
Household to choose from, and once a Pick is made it surfaces **Tonight's
dinner** — the screen has both jobs, deciding and showing what was decided.

**Recency**:
How long since something was last eaten, measured only from non-future Log
entries of **active** Options — an Archived Option's history does not count
(archiving is rare and must not move the ranking). **Per-Option recency** is
days since that exact Option was last eaten; **per-Tag recency** is days since
any active Option carrying that Tag was last eaten.

**Score**:
The number that ranks an Option on Tonight, combining its per-Option recency
with the per-Tag recency of its Tags. Higher = more overdue = higher on the
list.
_Avoid_: Anti-repeat, variety enforcer (the two inputs are simply per-Option
recency and per-Tag recency).

**Recency chip**:
The small chip on each Tonight row showing the Option's own **per-Option
recency** — how long since the Household last had that exact Option ("18d",
"60d+" at the cap, "new" when it has never been eaten). It sits alongside the
Tag chips and surfaces one Score input as raw data; unlike the Explanation
chip it replaced, it does not narrate why the Option ranks where it does — the
Recency chip and the Tag chips together just show the numbers behind the
Score.
_Avoid_: Explanation chip (the retired prose line — Tonight no longer carries
a deterministic "why" sentence).

**Overdue**:
A Tag whose per-Tag recency has crossed the overdue threshold; rendered in the
accent color on Tonight.

**Cold start**:
Too little Log history to differentiate Options — every Score ties and Tonight
falls back to alphabetical order.

### AI search

**AI search**:
A triggered, query-driven re-ranking of Tonight by an AI model. The Household
types an intent ("something light", "we have guests") — or leaves the query
empty — and the model returns a ranked set of Options to fit it. The model
also reads the household's eating history for habits and rhythms — how often
something recurs, day-of-week tendencies, what tends to follow what — and lets
those shape the ranking, surfacing patterns the deterministic Score's pure
recency cannot; with an empty query, finding those patterns is the whole job.
Always a deliberate action; it never replaces the deterministic ranking as the
default Tonight view. The model decides how many Options to return, so a
narrowing query yields a subset of the Catalog, not the whole list.
_Avoid_: AI ranking (it is search — there is a query, even when empty).

**AI rationale**:
The model-generated line of prose on each AI search result row explaining why
that Option fits — naming the query intent and/or the habit the model found in
the Log ("Light and fast — a soup, and it's been three weeks"). Generative and
query-aware, and unique to AI search — the deterministic Tonight list has no
prose "why" line; it shows the Recency chip and Tag chips instead.
_Avoid_: Recency chip (the deterministic per-Option recency indicator is data,
not a rationale).

### Lifecycle & access

**Active**:
An Option that appears on Tonight and in the default Catalog list
(`active = true`).

**Archived**:
An Option set inactive (`active = false`): hidden from Tonight and the default
Catalog list, but still shown in Log history. The action of setting it so is
**Archive**.
_Avoid_: Inactive (as the state term).

**Hard-delete**:
Permanently removing an Option from the Catalog. Allowed only for an Option
with zero Log entries; an Option with Log history is Archived instead, never
hard-deleted.

**Household**:
The single group of people who share the app and its one password. The app is
single-household — no user accounts, no per-person identity.

## Relationships

- An **Option** is exactly one **kind**: a **Home meal** or a **Restaurant**.
- An **Option** carries zero or more **Tags**.
- The **Catalog** is the set of all **Options**.
- A **Log entry** records exactly one **Option** on one date.
- A **Dinner** is one or more **Log entries** sharing the same date.
- The **Log** is the set of all **Log entries**.
- **Picking** creates a **Log entry** dated today.
- A **Planned dinner** is a **Log entry** dated after today.
- **Tonight** ranks active **Options** by **Score**.
- **Tonight** surfaces **Tonight's dinner** once a **Pick** is made.
- An Option's **Score** combines its **per-Option recency** with the
  **per-Tag recency** of its **Tags**.
- Each **Tonight** row carries one **Recency chip**.
- An **Option** is either **Active** or **Archived**.
- A **Household** may **Reject** an Option for one night — live on **Tonight**,
  or entered by hand on the **Log** for any past, present, or future date.
- A **Rejection** is kept as dated history and feeds future **AI searches**; a
  **Rejection** dated after today is a **Planned rejection** and suppresses its
  Option from **Tonight** when that date arrives.
- An **Option** with any **Log entry** cannot be **hard-deleted** — only
  **Archived**.
- The **Household** shares one password; there are no user accounts.

## Example dialogue

> **Dev:** "If we Pick a Restaurant tonight and also Pick a Home meal, is that
> two Dinners?"
> **Domain expert:** "No — one Dinner, two Log entries. A Dinner is the
> evening; both entries just sit on today's date."
>
> **Dev:** "And if I add a Log entry for next Friday?"
> **Domain expert:** "That's a Planned dinner. It shows in Upcoming, but it
> doesn't touch any Score until Friday arrives — planning Friday shouldn't
> make Friday's dish look recently eaten today."
>
> **Dev:** "If the Household stops eating an Option, do we delete it?"
> **Domain expert:** "Only if it has no Log entries. If it's in the Log,
> Archive it — it leaves Tonight but its past Dinners stay intact."

## Flagged ambiguities

- "Meal" was used loosely for both the unified catalog entry and the
  home-cooked kind specifically. Resolved: **Option** is the unified term;
  **Home meal** is reserved for `kind = 'home'`. Friendly UI copy ("Add a meal
  or restaurant") may still say "meal" — the glossary governs code, issues,
  and tests.
- "Dinner" was used for both a single log row and a whole evening. Resolved:
  **Log entry** is the single row; **Dinner** is the evening (one or more Log
  entries on a date).
- "Tonight" was defined as only the ranked picker list. Resolved: the Tonight
  screen has two jobs — ranking Options to choose from, and showing
  **Tonight's dinner** once a Pick is made.
