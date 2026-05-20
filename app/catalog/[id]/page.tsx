/**
 * Option detail page — the single tracer-bullet screen a Household member
 * lands on when they tap an Option's name on Catalog, Tonight, or the Log.
 * `force-dynamic` so the page is never prerendered; recency depends on the
 * Household's current calendar day.
 *
 * Stream-loads under the parent `app/catalog/loading.tsx` skeleton — no
 * dedicated `loading.tsx` here.
 *
 * This slice ships the route, header, Recency, Details, and the merged
 * History block (currently logged dinners only — the Rejection-row
 * variant rides on top in a later ticket, but `groupByDay` already
 * supports it).
 */
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { kindBarClass } from "@/app/kind-bar";
import { RowChips } from "@/app/tonight-row";
import { LogEntryRow } from "@/app/log/log-entry-row";
import { RejectionRow } from "@/app/log/rejection-row";
import {
  getAllOptionsForSelect,
  getAllTagNames,
  getOptionById,
  getOptionChoices,
  getOptionLog,
  getOptionRejections,
  getTonightData,
} from "@/db/queries";
import { formatDinnerDate, groupByDay } from "@/lib/dinner-grouping";
import { epochDayFromSqlDate, today } from "@/lib/local-day";
import { placesEnabled } from "@/lib/places";
import {
  rankOption,
  type RankLogEntry,
  type RankOption,
} from "@/lib/ranking";

import { OptionControls } from "./option-controls";

type Params = Promise<{ id: string }>;

export default async function OptionDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const option = await getOptionById(id);
  if (!option) {
    notFound();
  }

  const todaySql = today();
  const [
    tonightData,
    optionLog,
    optionRejections,
    selectableOptions,
    optionChoices,
    tagSuggestions,
  ] = await Promise.all([
    getTonightData(todaySql),
    getOptionLog(option.id),
    getOptionRejections(option.id),
    getAllOptionsForSelect(),
    getOptionChoices(),
    getAllTagNames(),
  ]);

  const todayEpoch = epochDayFromSqlDate(todaySql);
  const activeLog: RankLogEntry[] = tonightData.entries.map((entry) => ({
    optionId: entry.optionId,
    eatenOn: epochDayFromSqlDate(entry.eatenOn),
  }));

  // The target's own Log — feeds per-Option recency for an Archived
  // target too. `eatenOn` from `getOptionLog` is the SQL `date`; the
  // ranking engine takes integer epoch-days.
  const targetLog: RankLogEntry[] = optionLog.map((entry) => ({
    optionId: entry.option.id,
    eatenOn: epochDayFromSqlDate(entry.eatenOn),
  }));

  // The ranking engine works in `RankOption` (a slim shape) — build one
  // for the target and a list for `activeOptions`. `RankOption` carries
  // `url` and `phone` because the decided-block actions read them.
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
    activeLog,
    targetLog,
    today: todayEpoch,
    archived: !option.active,
  });

  // History — merged date-grouped activity. `groupByDay` collapses a
  // same-date Log entry + Rejection into one record. Future-dated groups
  // render first (reversed so the soonest sits closest to today), then
  // realised history newest-first.
  const { upcoming, history } = groupByDay(
    optionLog,
    optionRejections,
    todaySql,
  );
  const activity = [...upcoming].reverse().concat(history);

  const hasDetails =
    option.notes !== null ||
    option.url !== null ||
    (option.kind === "restaurant" &&
      (option.address !== null ||
        option.phone !== null ||
        option.mapsUrl !== null));

  const kindLabel = option.kind === "home" ? "Home meal" : "Restaurant";

  return (
    <main className="column">
      {/* Header — kind label above the Option name, carried by the
          meal-kind color channel via `kindBarClass`. */}
      <header
        className={`flex flex-col gap-2xs py-lg pl-md ${kindBarClass(
          option.kind,
        )}`}
      >
        <span className="text-meta uppercase tracking-wider text-muted">
          {kindLabel}
        </span>
        <h1 className="font-display text-h1 text-ink">
          {option.name}
          {option.active ? "" : " (archived)"}
        </h1>
      </header>

      {/* Recency — `RowChips` is the same chip row Tonight renders, fed
          from `rankOption`'s `TagRecency[]` + `recencyDays`/`neverEaten`. */}
      <section aria-label="Recency" className="flex flex-col gap-sm pb-md">
        <h2 className="text-meta font-semibold uppercase tracking-wider text-muted">
          Recency
        </h2>
        <RowChips
          row={{
            option: target,
            // `RowChips` reads `score` off the row but never renders it;
            // the page never shows a Score number anywhere.
            score: ranking.score ?? 0,
            tags: ranking.tags,
            recencyDays: ranking.recencyDays,
            neverEaten: ranking.neverEaten,
          }}
        />
      </section>

      {/* Actions — Edit, Archive/Un-archive, conditional Delete, Reject, and
          the shared PickButton. Delete only renders when the Hard-delete rule
          (ADR-0001) permits it, hence the `optionLog.length === 0` guard. */}
      <section aria-label="Actions" className="flex flex-col gap-sm pb-md">
        <h2 className="text-meta font-semibold uppercase tracking-wider text-muted">
          Actions
        </h2>
        <OptionControls
          option={option}
          tagSuggestions={tagSuggestions}
          placesEnabled={placesEnabled()}
          canDelete={optionLog.length === 0}
        />
      </section>

      {/* Details — conditional `<dl>` of hairline-separated labelled
          rows. Notes + URL for both kinds; address/phone/maps for
          Restaurant only. */}
      {hasDetails ? (
        <section aria-label="Details" className="flex flex-col gap-sm pb-md">
          <h2 className="text-meta font-semibold uppercase tracking-wider text-muted">
            Details
          </h2>
          <dl className="flex flex-col">
            {option.notes ? (
              <Field label="Notes">
                <p className="whitespace-pre-wrap text-body text-ink">
                  {option.notes}
                </p>
              </Field>
            ) : null}
            {option.url ? (
              <Field label="Website">
                <a
                  href={option.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-body text-ink underline underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  {option.url}
                </a>
              </Field>
            ) : null}
            {option.kind === "restaurant" && option.address ? (
              <Field label="Address">
                <p className="text-body text-ink">{option.address}</p>
              </Field>
            ) : null}
            {option.kind === "restaurant" && option.phone ? (
              <Field label="Phone">
                <a
                  href={`tel:${option.phone}`}
                  className="text-body text-ink underline underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
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
                  className="text-body text-ink underline underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  Google Maps
                </a>
              </Field>
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* History — single merged, date-grouped section. Future-dated
          groups render first (reversed so the soonest sits closest to
          today), then realised history newest-first. */}
      <section aria-label="History" className="flex flex-col gap-sm py-md">
        <h2 className="text-meta font-semibold uppercase tracking-wider text-muted">
          History
        </h2>
        {activity.length === 0 ? (
          <p className="text-body text-muted">
            Nothing logged or rejected yet for this Option.
          </p>
        ) : (
          activity.map((group) => (
            <div key={group.date}>
              <h3 className="pb-2xs pt-sm text-meta text-muted">
                {formatDinnerDate(group.date, todaySql)}
              </h3>
              <ul className="flex flex-col">
                {group.entries.map((entry) => (
                  <LogEntryRow
                    key={entry.id}
                    entry={entry}
                    options={selectableOptions}
                  />
                ))}
                {group.rejections.map((rejection) => (
                  <RejectionRow
                    key={rejection.id}
                    rejection={rejection}
                    optionChoices={optionChoices}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2xs border-b border-line py-sm">
      <dt className="text-meta text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
