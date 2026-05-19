import { getLog, getLogOptionChoices } from "@/db/queries";
import { today as todaySqlDate } from "@/lib/local-day";
import { LogScreen } from "./log-screen";

/**
 * `/log` is `force-dynamic` so no query fires at build time — the lazy
 * `postgres-js` client in `db/index.ts` opens no socket until the first
 * query, and this is the page that triggers it. Matches the `/catalog` and
 * `/` pattern.
 *
 * "Today" is computed in the Household's time zone (`APP_TZ`) so the
 * Upcoming/history split happens at the calendar day in the kitchen, not the
 * server's UTC day.
 */
export const dynamic = "force-dynamic";

export default async function LogPage() {
  const [entries, optionChoices] = await Promise.all([
    getLog(),
    getLogOptionChoices(),
  ]);
  return (
    <LogScreen
      entries={entries}
      optionChoices={optionChoices}
      todaySql={todaySqlDate()}
    />
  );
}
