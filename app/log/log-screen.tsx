import { AddDinnerForm } from "./add-dinner-form";
import { LogEntryRow } from "./log-entry-row";
import {
  formatDinnerDate,
  groupByDate,
  splitDinners,
} from "@/lib/dinner-grouping";
import type { LogEntry, LogOptionChoice } from "@/db/queries";

/**
 * The Log screen. Two sections, both grouped by date (a Dinner is "one or
 * more Log entries on a date" — CONTEXT.md):
 *
 * - **Upcoming** (top, capped) — future-dated entries (Planned dinners),
 *   soonest first. The cap keeps a long Planned queue from burying today's
 *   history.
 * - **History** (below) — past + today entries, reverse-chronological. A date
 *   with more than one entry renders as one Dinner under one date header.
 *
 * The "+ Add a dinner" form sits at the top of the screen so the secondary
 * "log another date" path is one tap away, the same way Pick is one tap away
 * on Tonight.
 *
 * §17 empty state: with no entries at all, copy nudges the Household toward
 * Tonight ("pick one on Tonight →"). Editing and deleting are per-row,
 * inline — see `LogEntryRow`.
 *
 * The cap on Upcoming is high enough to comfortably show a normal week or
 * two of planning. Once the Household has more than that planned, the strip
 * truncates with a small remainder count rather than scrolling forever.
 *
 * Grouping and the date label live in `lib/dinner-grouping.ts` — the same
 * module the Option detail page's merged History section consumes, so both
 * views build their per-date buckets the same way.
 */
const UPCOMING_CAP = 14;

export function LogScreen({
  entries,
  optionChoices,
  todaySql,
}: {
  entries: LogEntry[];
  optionChoices: LogOptionChoice[];
  todaySql: string;
}) {
  // `splitDinners` preserves input order within each bucket. The query
  // returns the entries newest-first, which is the order History needs; for
  // Upcoming the Household wants soonest-first, so we re-sort ascending.
  const split = splitDinners(entries, (entry) => entry.eatenOn, todaySql);
  const upcoming = [...split.upcoming].sort((a, b) =>
    a.eatenOn.localeCompare(b.eatenOn),
  );
  const history = split.history;
  const upcomingShown = upcoming.slice(0, UPCOMING_CAP);
  const upcomingHidden = upcoming.length - upcomingShown.length;

  const upcomingGroups = groupByDate(upcomingShown, (e) => e.eatenOn);
  const historyGroups = groupByDate(history, (e) => e.eatenOn);

  const empty = entries.length === 0;

  return (
    <main className="column">
      <h1 className="font-display text-h1 font-semibold">Log</h1>

      <section className="py-md">
        <AddDinnerForm optionChoices={optionChoices} todaySql={todaySql} />
      </section>

      {empty ? (
        <p className="py-md text-body text-muted">
          No dinners logged yet — pick one on Tonight →
        </p>
      ) : null}

      {upcomingGroups.length > 0 ? (
        <section className="py-md">
          <h2 className="text-meta font-semibold uppercase tracking-wide text-planned">
            Upcoming
          </h2>
          <ol className="flex flex-col">
            {upcomingGroups.map((group) => (
              <DateGroup
                key={group.date}
                date={group.date}
                entries={group.items}
                todaySql={todaySql}
                optionChoices={optionChoices}
              />
            ))}
          </ol>
          {upcomingHidden > 0 ? (
            <p className="pt-xs text-meta text-muted">
              +{upcomingHidden} more upcoming
            </p>
          ) : null}
        </section>
      ) : null}

      {historyGroups.length > 0 ? (
        <section className="py-md">
          <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">
            History
          </h2>
          <ol className="flex flex-col">
            {historyGroups.map((group) => (
              <DateGroup
                key={group.date}
                date={group.date}
                entries={group.items}
                todaySql={todaySql}
                optionChoices={optionChoices}
              />
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

function DateGroup({
  date,
  entries,
  todaySql,
  optionChoices,
}: {
  date: string;
  entries: LogEntry[];
  todaySql: string;
  optionChoices: LogOptionChoice[];
}) {
  return (
    <li className="border-b border-line py-sm">
      <h3 className="pb-xs text-meta font-semibold tabular-nums text-muted">
        {formatDinnerDate(date, todaySql)}
      </h3>
      <ul className="flex flex-col gap-xs">
        {entries.map((entry) => (
          <LogEntryRow
            key={entry.id}
            entry={entry}
            optionChoices={optionChoices}
          />
        ))}
      </ul>
    </li>
  );
}
