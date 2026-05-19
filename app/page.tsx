import Link from "next/link";
import { getTonightData } from "@/db/queries";
import { today as todaySqlDate } from "@/lib/local-day";
import { epochDayFromSqlDate } from "@/lib/local-day";
import { rankTonight } from "@/lib/ranking";
import { TonightRow } from "./tonight-row";

/**
 * The Tonight screen — the home screen. Renders the active Catalog ranked by
 * Score, descending, as a flat uniform `<ol>` per DESIGN.md / PRD §18: every
 * row the same shape, separated by a 1px `line` rule, no per-row background
 * tint. This ticket is read-only — the "Pick tonight" write path lands in
 * ticket 05.
 *
 * `force-dynamic` matches `/catalog`'s pattern: no DB query fires at build
 * time, so a build with no `DATABASE_URL` still succeeds. The lazy
 * `postgres-js` client opens its socket on the first request.
 *
 * "Today" is computed in the Household's time zone (`APP_TZ`) so the day
 * cutoff is the calendar day in the kitchen, not the server's UTC day.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const todaySql = todaySqlDate();
  const { options, entries } = await getTonightData(todaySql);

  if (options.length === 0) {
    return (
      <main className="column">
        <h1 className="font-display text-h1 font-semibold">Tonight</h1>
        <p className="py-md text-body text-muted">
          Your Catalog is empty.{" "}
          <Link href="/catalog" className="underline">
            Add your first meals →
          </Link>
        </p>
      </main>
    );
  }

  const todayEpoch = epochDayFromSqlDate(todaySql);
  const rows = rankTonight(options, entries, todayEpoch);

  return (
    <main className="column">
      <h1 className="font-display text-h1 font-semibold">Tonight</h1>
      <ol className="flex flex-col">
        {rows.map((row, idx) => (
          <TonightRow key={row.option.id} rank={idx + 1} row={row} />
        ))}
      </ol>
    </main>
  );
}
