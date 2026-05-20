import {
  getLog,
  getLogOptionChoices,
  getLogRejections,
  getOptionChoices,
} from "@/db/queries";
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
 *
 * The page loads four datasets in parallel: every Log entry, every Rejection,
 * the `LogOptionChoice[]` the Log-entry edit `<select>` consumes (carrying
 * the `active` flag so an Archived Option's row stays editable), and the
 * leaner `OptionChoice[]` the new Rejection add-forms consume.
 */
export const dynamic = "force-dynamic";

export default async function LogPage() {
  const [entries, rejections, optionChoices, rejectionOptionChoices] =
    await Promise.all([
      getLog(),
      getLogRejections(),
      getLogOptionChoices(),
      getOptionChoices(),
    ]);
  return (
    <LogScreen
      entries={entries}
      rejections={rejections}
      optionChoices={optionChoices}
      rejectionOptionChoices={rejectionOptionChoices}
      todaySql={todaySqlDate()}
    />
  );
}
