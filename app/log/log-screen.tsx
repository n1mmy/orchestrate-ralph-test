import type { LogEntry, SelectableOption } from "@/db/queries";

import { AddDinnerForm } from "./add-dinner-form";
import { LogEntryRow } from "./log-entry-row";
import { dayHeader, groupLog } from "./log-day-grouping";

type Props = {
  entries: LogEntry[];
  options: SelectableOption[];
  today: string;
  /** Cap on the Upcoming strip — keeps the top of the screen compact. */
  upcomingCap?: number;
};

/**
 * Log screen — a compact "Upcoming" strip on top showing future-dated
 * entries soonest-first, then reverse-chronological history grouped by
 * date. A date carrying more than one entry renders as one Dinner under
 * one header.
 */
export function LogScreen({ entries, options, today, upcomingCap = 5 }: Props) {
  const { upcoming, past } = groupLog(entries, today);
  const cappedUpcoming = upcoming.slice(0, upcomingCap);
  const empty = entries.length === 0;

  return (
    <main className="column">
      <h1 className="py-lg font-display text-h1 text-ink">Log</h1>
      <AddDinnerForm options={options} today={today} />
      {empty ? (
        <p className="pt-md text-body text-muted">
          No dinners yet. Add one above to get started.
        </p>
      ) : null}
      {cappedUpcoming.length > 0 ? (
        <section className="pt-lg">
          <h2 className="pb-xs font-display text-name text-planned">
            Upcoming
          </h2>
          {cappedUpcoming.map((group) => (
            <div key={group.date}>
              <h3 className="pb-2xs pt-sm text-meta text-muted">
                {dayHeader(group.date, today)}
              </h3>
              <ol className="flex flex-col">
                {group.entries.map((entry) => (
                  <LogEntryRow
                    key={entry.id}
                    entry={entry}
                    options={options}
                  />
                ))}
              </ol>
            </div>
          ))}
        </section>
      ) : null}
      {past.length > 0 ? (
        <section className="pt-lg">
          <h2 className="pb-xs font-display text-name text-ink">History</h2>
          {past.map((group) => (
            <div key={group.date}>
              <h3 className="pb-2xs pt-sm text-meta text-muted">
                {dayHeader(group.date, today)}
              </h3>
              <ol className="flex flex-col">
                {group.entries.map((entry) => (
                  <LogEntryRow
                    key={entry.id}
                    entry={entry}
                    options={options}
                  />
                ))}
              </ol>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
