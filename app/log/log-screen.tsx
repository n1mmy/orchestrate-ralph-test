import { AddDinnerForm } from "./add-dinner-form";
import { LogEntryRow } from "./log-entry-row";
import { dateLabel } from "./date-label";
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
  const { upcoming, history } = splitByDay(entries, todaySql);
  const upcomingShown = upcoming.slice(0, UPCOMING_CAP);
  const upcomingHidden = upcoming.length - upcomingShown.length;

  const upcomingGroups = groupByDate(upcomingShown);
  const historyGroups = groupByDate(history);

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
                key={group.eatenOn}
                group={group}
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
                key={group.eatenOn}
                group={group}
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

type DateGroupData = {
  eatenOn: string;
  entries: LogEntry[];
};

function DateGroup({
  group,
  todaySql,
  optionChoices,
}: {
  group: DateGroupData;
  todaySql: string;
  optionChoices: LogOptionChoice[];
}) {
  return (
    <li className="border-b border-line py-sm">
      <h3 className="pb-xs text-meta font-semibold tabular-nums text-muted">
        {dateLabel(group.eatenOn, todaySql)}
      </h3>
      <ul className="flex flex-col gap-xs">
        {group.entries.map((entry) => (
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

/**
 * Split a date-descending list of Log entries into Upcoming (after today) and
 * history (today and earlier). Upcoming is re-sorted ascending (soonest
 * first), per CONTEXT.md — the Planned dinner most near is the one the
 * Household most wants to see.
 */
function splitByDay(
  entries: LogEntry[],
  todaySql: string,
): { upcoming: LogEntry[]; history: LogEntry[] } {
  const upcoming: LogEntry[] = [];
  const history: LogEntry[] = [];
  for (const e of entries) {
    if (e.eatenOn > todaySql) upcoming.push(e);
    else history.push(e);
  }
  // The DB returns date-descending; reverse Upcoming so soonest comes first.
  upcoming.sort((a, b) => a.eatenOn.localeCompare(b.eatenOn));
  return { upcoming, history };
}

/**
 * Group entries by `eatenOn` into date-keyed buckets while preserving the
 * input order of dates — the caller has already sorted (history descending,
 * Upcoming ascending), so the bucket order matches.
 */
function groupByDate(entries: LogEntry[]): DateGroupData[] {
  const groups: DateGroupData[] = [];
  let current: DateGroupData | null = null;
  for (const e of entries) {
    if (!current || current.eatenOn !== e.eatenOn) {
      current = { eatenOn: e.eatenOn, entries: [e] };
      groups.push(current);
    } else {
      current.entries.push(e);
    }
  }
  return groups;
}
