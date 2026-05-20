"use client";

import { useState } from "react";
import { AddDinnerForm } from "./add-dinner-form";
import { LogEntryRow } from "./log-entry-row";
import { AddRejectionForm, RejectionRow } from "./rejection-row";
import { TopAddControls } from "./top-add-controls";
import { formatDinnerDate, groupByDay } from "@/lib/dinner-grouping";
import type {
  DayRecord,
} from "@/lib/dinner-grouping";
import type {
  LogEntry,
  LogOptionChoice,
  LogRejectionRow,
  OptionChoice,
} from "@/db/queries";

/**
 * The Log screen — the Household's full nightly record. Two sections:
 *
 * - **Upcoming** (top, capped at `UPCOMING_CAP`) — future-dated `DayGroup`s
 *   (Planned dinners and Planned rejections), soonest first. A "+N more
 *   planned" line follows when the cap bites.
 * - **History** (below) — past + today, newest-first. A date with both a
 *   logged Dinner and a Rejection collapses under one date header (Log
 *   entries first, then Rejections). A Rejection-only date still forms its
 *   own group so the Household sees "we turned this down on Thursday" with
 *   nothing eaten.
 *
 * Two top-of-Log add controls — "+ Add a dinner" and "+ Add a rejection" —
 * each one direct action with no mode toggle (`TopAddControls`). Each
 * `DayGroup` also offers per-date "+ Dinner" and "+ Rejection" buttons that
 * open the same inline forms with `defaultDate` pre-filled to that group's
 * date, so the Household never re-types a date it is already looking at.
 *
 * Grouping lives in `lib/dinner-grouping.ts` (the same `groupByDay` the
 * Option detail page's merged History section consumes), so both views build
 * their per-date buckets the same way.
 *
 * §17 empty state: with no entries and no Rejections at all, copy nudges the
 * Household toward Tonight ("pick one on Tonight →"). A Log with Rejections
 * but no entries is not empty — the Rejections render and the empty line
 * stays hidden.
 */
const UPCOMING_CAP = 5;

export function LogScreen({
  entries,
  rejections,
  optionChoices,
  rejectionOptionChoices,
  todaySql,
}: {
  entries: LogEntry[];
  rejections: LogRejectionRow[];
  optionChoices: LogOptionChoice[];
  rejectionOptionChoices: OptionChoice[];
  todaySql: string;
}) {
  const { upcoming, history } = groupByDay({
    entries,
    rejections,
    todaySql,
  });
  const upcomingShown = upcoming.slice(0, UPCOMING_CAP);
  const upcomingHidden = upcoming.length - upcomingShown.length;

  const empty = entries.length === 0 && rejections.length === 0;
  const showHistoryHeading =
    upcomingShown.length > 0 && history.length > 0;

  return (
    <main className="column">
      <h1 className="font-display text-h1 font-semibold">Log</h1>

      <section className="py-md">
        <TopAddControls
          optionChoices={optionChoices}
          rejectionOptionChoices={rejectionOptionChoices}
          todaySql={todaySql}
        />
      </section>

      {empty ? (
        <p className="py-md text-body text-muted">
          No dinners logged yet — pick one on Tonight →
        </p>
      ) : null}

      {upcomingShown.length > 0 ? (
        <section className="py-md">
          <h2 className="text-meta font-semibold uppercase tracking-wide text-planned">
            Upcoming
          </h2>
          <ol className="flex flex-col">
            {upcomingShown.map((day) => (
              <DayGroup
                key={day.date}
                day={day}
                todaySql={todaySql}
                optionChoices={optionChoices}
                rejectionOptionChoices={rejectionOptionChoices}
              />
            ))}
          </ol>
          {upcomingHidden > 0 ? (
            <p className="pt-xs text-meta text-muted">
              +{upcomingHidden} more planned
            </p>
          ) : null}
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="py-md">
          {showHistoryHeading ? (
            <h2 className="text-meta font-semibold uppercase tracking-wide text-muted">
              History
            </h2>
          ) : null}
          <ol className="flex flex-col">
            {history.map((day) => (
              <DayGroup
                key={day.date}
                day={day}
                todaySql={todaySql}
                optionChoices={optionChoices}
                rejectionOptionChoices={rejectionOptionChoices}
              />
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

type AddOpen = "none" | "dinner" | "rejection";

function DayGroup({
  day,
  todaySql,
  optionChoices,
  rejectionOptionChoices,
}: {
  day: DayRecord<LogEntry, LogRejectionRow>;
  todaySql: string;
  optionChoices: LogOptionChoice[];
  rejectionOptionChoices: OptionChoice[];
}) {
  const [open, setOpen] = useState<AddOpen>("none");

  return (
    <li className="border-b border-line py-sm">
      <div className="flex items-center justify-between gap-sm pb-xs">
        <h3 className="text-meta font-semibold tabular-nums text-muted">
          {formatDinnerDate(day.date, todaySql)}
        </h3>
        <div className="flex gap-xs">
          <button
            type="button"
            onClick={() => setOpen(open === "dinner" ? "none" : "dinner")}
            aria-expanded={open === "dinner"}
            className="min-h-11 rounded-control border border-line bg-surface px-sm py-xs text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            + Dinner
          </button>
          <button
            type="button"
            onClick={() => setOpen(open === "rejection" ? "none" : "rejection")}
            aria-expanded={open === "rejection"}
            className="min-h-11 rounded-control border border-line bg-surface px-sm py-xs text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            + Rejection
          </button>
        </div>
      </div>
      <ul className="flex flex-col gap-xs">
        {day.entries.map((entry) => (
          <LogEntryRow
            key={entry.id}
            entry={entry}
            optionChoices={optionChoices}
          />
        ))}
        {day.rejections.map((rejection) => (
          <RejectionRow
            key={rejection.id}
            rejection={rejection}
            optionChoices={optionChoices}
          />
        ))}
      </ul>
      {open === "dinner" ? (
        <div className="pt-sm">
          <AddDinnerForm
            optionChoices={optionChoices}
            defaultDate={day.date}
            onCancel={() => setOpen("none")}
            onSaved={() => setOpen("none")}
          />
        </div>
      ) : null}
      {open === "rejection" ? (
        <div className="pt-sm">
          <AddRejectionForm
            optionChoices={rejectionOptionChoices}
            defaultDate={day.date}
            onCancel={() => setOpen("none")}
            onSaved={() => setOpen("none")}
          />
        </div>
      ) : null}
    </li>
  );
}
