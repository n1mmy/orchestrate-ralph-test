"use client";

import { useState } from "react";

import type {
  LogEntry,
  LogRejectionRow,
  OptionChoice,
  SelectableOption,
} from "@/db/queries";
import { formatDinnerDate, groupByDay } from "@/lib/dinner-grouping";

import { AddDinnerForm } from "./add-dinner-form";
import { LogEntryRow } from "./log-entry-row";
import { AddRejectionForm, RejectionRow } from "./rejection-row";

type Props = {
  entries: LogEntry[];
  rejections: LogRejectionRow[];
  options: SelectableOption[];
  optionChoices: OptionChoice[];
  today: string;
  /** Cap on the Upcoming strip — keeps the top of the screen compact. */
  upcomingCap?: number;
};

const UPCOMING_CAP = 5;

/**
 * Log screen — the Household's full nightly record. Future-dated groups
 * sit in a capped "Upcoming" strip on top (soonest-first), then realised
 * history newest-first. Each `DayRecord` renders one date — that date's
 * Log entries first, then its Rejections. A Rejection-only date forms
 * its own group.
 *
 * Two top-of-Log controls — "+ Add a dinner" and "+ Add a rejection" —
 * each opening its inline form. Each `DayGroup` also offers "+ Dinner"
 * / "+ Rejection" with the date pre-filled to the group's date, so the
 * Household never re-types a date it is already looking at.
 *
 * Grouping and date-label resolution come from the shared
 * `lib/dinner-grouping` module so the Log screen and the Option detail
 * page never disagree on what date a record belongs to or what its
 * header reads.
 */
export function LogScreen({
  entries,
  rejections,
  options,
  optionChoices,
  today,
  upcomingCap = UPCOMING_CAP,
}: Props) {
  const { upcoming, history } = groupByDay(entries, rejections, today);
  const cappedUpcoming = upcoming.slice(0, upcomingCap);
  const hiddenUpcoming = upcoming.length - cappedUpcoming.length;
  const empty = entries.length === 0 && rejections.length === 0;
  const hasBothStrips = cappedUpcoming.length > 0 && history.length > 0;

  return (
    <main className="column">
      <h1 className="py-lg font-display text-h1 text-ink">Log</h1>
      <TopAddControls
        options={options}
        optionChoices={optionChoices}
        today={today}
      />
      {empty ? (
        <p className="pt-md text-body text-muted">
          No dinners logged yet — pick one on Tonight →
        </p>
      ) : null}
      {cappedUpcoming.length > 0 ? (
        <section className="pt-lg">
          <h2 className="pb-xs font-display text-name text-planned">
            Upcoming
          </h2>
          {cappedUpcoming.map((group) => (
            <DayGroup
              key={group.date}
              date={group.date}
              today={today}
              entries={group.entries}
              rejections={group.rejections}
              options={options}
              optionChoices={optionChoices}
            />
          ))}
          {hiddenUpcoming > 0 ? (
            <p className="pt-xs text-meta text-muted">
              +{hiddenUpcoming} more planned
            </p>
          ) : null}
        </section>
      ) : null}
      {history.length > 0 ? (
        <section className="pt-lg">
          {hasBothStrips ? (
            <h2 className="pb-xs font-display text-name text-ink">History</h2>
          ) : null}
          {history.map((group) => (
            <DayGroup
              key={group.date}
              date={group.date}
              today={today}
              entries={group.entries}
              rejections={group.rejections}
              options={options}
              optionChoices={optionChoices}
            />
          ))}
        </section>
      ) : null}
    </main>
  );
}

type TopAddControlsProps = {
  options: SelectableOption[];
  optionChoices: OptionChoice[];
  today: string;
};

/**
 * Two top-of-Log inline-add buttons — separate "+ Add a dinner" /
 * "+ Add a rejection", each opening its own inline form below. Both
 * default their date to today.
 */
function TopAddControls({
  options,
  optionChoices,
  today,
}: TopAddControlsProps) {
  const [open, setOpen] = useState<"none" | "dinner" | "rejection">("none");

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-row flex-wrap gap-sm">
        <button
          type="button"
          onClick={() =>
            setOpen((current) => (current === "dinner" ? "none" : "dinner"))
          }
          aria-pressed={open === "dinner"}
          className="min-h-[44px] self-start rounded-control border border-line bg-surface px-lg text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          + Add a dinner
        </button>
        <button
          type="button"
          onClick={() =>
            setOpen((current) =>
              current === "rejection" ? "none" : "rejection",
            )
          }
          aria-pressed={open === "rejection"}
          className="min-h-[44px] self-start rounded-control border border-line bg-surface px-lg text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          + Add a rejection
        </button>
      </div>
      {open === "dinner" ? (
        <InlineAddDinner
          options={options}
          today={today}
          onClose={() => setOpen("none")}
        />
      ) : null}
      {open === "rejection" ? (
        <AddRejectionForm
          optionChoices={optionChoices}
          defaultDate={today}
          onCancel={() => setOpen("none")}
          onSaved={() => setOpen("none")}
        />
      ) : null}
    </div>
  );
}

/**
 * Thin wrapper around the existing `AddDinnerForm` so it renders as a
 * naked form (no leading "+ Add a dinner" toggle button — the
 * `TopAddControls` button already played that role).
 */
function InlineAddDinner({
  options,
  today,
  onClose,
}: {
  options: SelectableOption[];
  today: string;
  onClose: () => void;
}) {
  return <AddDinnerForm options={options} today={today} onClose={onClose} />;
}

type DayGroupProps = {
  date: string;
  today: string;
  entries: LogEntry[];
  rejections: LogRejectionRow[];
  options: SelectableOption[];
  optionChoices: OptionChoice[];
};

/**
 * One date's combined activity: a `formatDinnerDate` header, that date's
 * `EntryRow`s, then that date's `RejectionRow`s. The "+ Dinner" /
 * "+ Rejection" buttons under the header open the same inline forms
 * `TopAddControls` opens, with `defaultDate` pre-filled to this group's
 * date.
 */
function DayGroup({
  date,
  today,
  entries,
  rejections,
  options,
  optionChoices,
}: DayGroupProps) {
  const [open, setOpen] = useState<"none" | "dinner" | "rejection">("none");

  return (
    <div>
      <h3 className="pb-2xs pt-sm text-meta text-muted">
        {formatDinnerDate(date, today)}
      </h3>
      <ol className="flex flex-col">
        {entries.map((entry) => (
          <LogEntryRow key={entry.id} entry={entry} options={options} />
        ))}
        {rejections.map((rejection) => (
          <RejectionRow
            key={rejection.id}
            rejection={rejection}
            optionChoices={optionChoices}
          />
        ))}
      </ol>
      <div className="flex flex-row flex-wrap gap-sm pt-xs">
        <button
          type="button"
          onClick={() =>
            setOpen((current) => (current === "dinner" ? "none" : "dinner"))
          }
          aria-pressed={open === "dinner"}
          className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          + Dinner
        </button>
        <button
          type="button"
          onClick={() =>
            setOpen((current) =>
              current === "rejection" ? "none" : "rejection",
            )
          }
          aria-pressed={open === "rejection"}
          className="min-h-[44px] rounded-control border border-line bg-surface px-md text-meta text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          + Rejection
        </button>
      </div>
      {open === "dinner" ? (
        <AddDinnerForm
          options={options}
          today={date}
          onClose={() => setOpen("none")}
        />
      ) : null}
      {open === "rejection" ? (
        <AddRejectionForm
          optionChoices={optionChoices}
          defaultDate={date}
          onCancel={() => setOpen("none")}
          onSaved={() => setOpen("none")}
        />
      ) : null}
    </div>
  );
}
