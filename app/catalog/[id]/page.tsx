import { notFound } from "next/navigation";
import {
  getLogOptionChoices,
  getOptionById,
  getOptionLog,
  getOptionLogEntries,
  getOptionRejections,
  getTonightData,
  type LogOptionChoice,
} from "@/db/queries";
import { today as todaySqlDate, epochDayFromSqlDate } from "@/lib/local-day";
import { rankOption, type RankOption } from "@/lib/ranking";
import { formatDinnerDate, groupByDay } from "@/lib/dinner-grouping";
import { kindBarClass } from "../../kind-bar";
import { RowChips } from "../../tonight-row";
import { LogEntryRow } from "../../log/log-entry-row";
import { RejectionRow } from "../../log/rejection-row";

/**
 * The Option detail page — `/catalog/[id]`. A `force-dynamic` server
 * component so it is never prerendered: its Recency depends on the
 * Household's current calendar day, and a build-time cache would freeze
 * "5 days ago" against whenever the page was rendered. The pattern
 * mirrors `/catalog` and `/` — the lazy `postgres-js` client opens its
 * socket on the first request.
 *
 * A request for an id matching no `options` row, or a malformed (non-UUID)
 * id, collapses to `notFound()` — `getOptionById` returns `null` for both
 * cases (the UUID screen avoids a Postgres cast error → 500). This is the
 * 404 a stale link to a hard-deleted Option lands on.
 *
 * The page renders five blocks in order: a header (kind label + the
 * Option name carried by the meal-kind colour channel), the **Recency**
 * section (the same `RowChips` a Tonight row carries — Recency chip
 * followed by Tag chips, fed from `rankOption`), an **Actions** section
 * (stubbed — `OptionControls` lands in ticket 25), a conditional
 * **Details** `<dl>`, and a single **History** section (built in ticket
 * 23). There is **no Score block**: the as-built page never shows a Score
 * number to the Household.
 */
export const dynamic = "force-dynamic";

export default async function OptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const todaySql = todaySqlDate();
  const todayEpoch = epochDayFromSqlDate(todaySql);

  const [
    option,
    targetLog,
    tonightData,
    optionLogEntries,
    optionRejections,
    optionChoices,
  ] = await Promise.all([
    getOptionById(id),
    getOptionLog(id, todaySql),
    getTonightData(todaySql),
    getOptionLogEntries(id),
    getOptionRejections(id),
    getLogOptionChoices(),
  ]);

  if (!option) notFound();

  const target: RankOption = {
    id: option.id,
    name: option.name,
    kind: option.kind,
    tags: option.tags,
    url: option.url,
    phone: option.phone,
  };

  const ranking = rankOption({
    target,
    activeOptions: tonightData.options,
    activeLog: tonightData.entries,
    targetLog,
    today: todayEpoch,
  });

  const kindLabel = option.kind === "home" ? "Home meal" : "Restaurant";

  const hasDetails =
    Boolean(option.notes) ||
    Boolean(option.url) ||
    (option.kind === "restaurant" &&
      (Boolean(option.address) ||
        Boolean(option.phone) ||
        Boolean(option.mapsUrl)));

  return (
    <main className="column flex flex-col gap-lg py-md">
      <header className={`flex flex-col gap-2xs pl-sm ${kindBarClass(option.kind)}`}>
        <p className="text-meta font-emphasis uppercase tracking-wide text-muted">
          {kindLabel}
        </p>
        <h1 className="font-display text-h1 font-semibold">{option.name}</h1>
      </header>

      <section aria-label="Recency" className="flex flex-col gap-xs">
        <h2 className="text-meta font-emphasis uppercase tracking-wide text-muted">
          Recency
        </h2>
        <RowChips
          recencyDays={ranking.recencyDays}
          neverEaten={ranking.neverEaten}
          tags={ranking.tags}
        />
      </section>

      <section aria-label="Actions" className="flex flex-col gap-xs">
        <h2 className="text-meta font-emphasis uppercase tracking-wide text-muted">
          Actions
        </h2>
        {/* OptionControls — wired in ticket 25. */}
      </section>

      {hasDetails ? (
        <section aria-label="Details" className="flex flex-col gap-xs">
          <h2 className="text-meta font-emphasis uppercase tracking-wide text-muted">
            Details
          </h2>
          <dl className="flex flex-col">
            {option.notes ? (
              <Field label="Notes">
                <span className="whitespace-pre-wrap">{option.notes}</span>
              </Field>
            ) : null}
            {option.url ? (
              <Field label="Link">
                <a
                  href={option.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  {option.url}
                </a>
              </Field>
            ) : null}
            {option.kind === "restaurant" && option.address ? (
              <Field label="Address">
                <span>{option.address}</span>
              </Field>
            ) : null}
            {option.kind === "restaurant" && option.phone ? (
              <Field label="Phone">
                <a
                  href={`tel:${option.phone}`}
                  className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  {option.phone}
                </a>
              </Field>
            ) : null}
            {option.kind === "restaurant" && option.mapsUrl ? (
              <Field label="Map">
                <a
                  href={option.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  Google Maps
                </a>
              </Field>
            ) : null}
          </dl>
        </section>
      ) : null}

      <HistorySection
        entries={optionLogEntries}
        rejections={optionRejections}
        optionChoices={optionChoices}
        todaySql={todaySql}
      />
    </main>
  );
}

/**
 * The merged **History** section — one date-grouped list interleaving the
 * Option's Log entries and its Rejections. Built from `groupByDay` so the
 * Log screen and the detail page share the same grouping and date-label
 * helpers. Future-dated (Planned) groups render first — the Household sees
 * "what's coming up for this Option" ahead of realized history — then the
 * past, newest-first.
 *
 * Within each date group, that day's logged dinners render first (one
 * `LogEntryRow` each), then its Rejections (one `RejectionRow` each). The
 * `RejectionRow` is the same component the Log screen renders (ticket 32), so
 * a Rejection is editable and deletable in place wherever it appears —
 * `updateRejection` / `deleteRejection` revalidate `/catalog/[id]`, so an
 * edit or delete refreshes this page in place. There is no separate
 * "Bring back" affordance on the detail page; bringing a Rejection back is
 * just deleting it through the row's §17 inline-confirm Delete.
 *
 * The empty state — no Log entries and no Rejections — reads as one quiet
 * line, matching the Log screen's "nothing here yet" copy register.
 */
function HistorySection({
  entries,
  rejections,
  optionChoices,
  todaySql,
}: {
  entries: Awaited<ReturnType<typeof getOptionLogEntries>>;
  rejections: Awaited<ReturnType<typeof getOptionRejections>>;
  optionChoices: LogOptionChoice[];
  todaySql: string;
}) {
  const { upcoming, history } = groupByDay({
    entries,
    rejections,
    todaySql,
  });
  const activity = [...upcoming].reverse().concat(history);
  const isEmpty = activity.length === 0;

  return (
    <section aria-label="History" className="flex flex-col gap-xs">
      <h2 className="text-meta font-emphasis uppercase tracking-wide text-muted">
        History
      </h2>
      {isEmpty ? (
        <p className="text-body text-muted">
          Nothing logged or rejected yet for this Option.
        </p>
      ) : (
        <ol className="flex flex-col">
          {activity.map((day) => (
            <li key={day.date} className="border-b border-line py-sm">
              <h3 className="pb-xs text-meta font-semibold tabular-nums text-muted">
                {formatDinnerDate(day.date, todaySql)}
              </h3>
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
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * One hairline-separated labelled row in the Details `<dl>`. The label is
 * a `<dt>` muted-meta caption; the value is a `<dd>` body line. The
 * border-b hairline is the row separator DESIGN.md's "no cards, no
 * shadows" calls for.
 */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2xs border-b border-line py-sm last:border-b-0">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="text-body text-ink">{children}</dd>
    </div>
  );
}
