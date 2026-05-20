import type { LogEntry, SelectableOption } from "@/db/queries";
import { formatDinnerDate, groupByDay } from "@/lib/dinner-grouping";

import { AddDinnerForm } from "./add-dinner-form";
import { LogEntryRow } from "./log-entry-row";

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
 *
 * Grouping and date-label resolution come from the shared
 * `lib/dinner-grouping` module so the Log screen and the Option detail
 * page never disagree on what date a record belongs to or what its
 * header reads. The Log screen passes an empty Rejections list — the
 * Log itself shows only realised dinners, not Rejections.
 */
export function LogScreen({ entries, options, today, upcomingCap = 5 }: Props) {
  const { upcoming, history } = groupByDay(entries, [], today);
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
                {formatDinnerDate(group.date, today)}
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
      {history.length > 0 ? (
        <section className="pt-lg">
          <h2 className="pb-xs font-display text-name text-ink">History</h2>
          {history.map((group) => (
            <div key={group.date}>
              <h3 className="pb-2xs pt-sm text-meta text-muted">
                {formatDinnerDate(group.date, today)}
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
