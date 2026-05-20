import { notFound } from "next/navigation";
import { getOptionById, getOptionLog, getTonightData } from "@/db/queries";
import { today as todaySqlDate, epochDayFromSqlDate } from "@/lib/local-day";
import { rankOption, type RankOption } from "@/lib/ranking";
import { kindBarClass } from "../../kind-bar";
import { RowChips } from "../../tonight-row";

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

  const [option, targetLog, tonightData] = await Promise.all([
    getOptionById(id),
    getOptionLog(id, todaySql),
    getTonightData(todaySql),
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

      <section aria-label="History" className="flex flex-col gap-xs">
        <h2 className="text-meta font-emphasis uppercase tracking-wide text-muted">
          History
        </h2>
        {/* Log & Rejection history — built in tickets 23/24. */}
      </section>
    </main>
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
