// The Log is data, queried per request — `force-dynamic` keeps `next build`
// running with no live `DATABASE_URL` (the Drizzle client is lazy).
export const dynamic = "force-dynamic";

import {
  getAllOptionsForSelect,
  getLog,
  getLogRejections,
  getOptionChoices,
} from "@/db/queries";
import { today } from "@/lib/local-day";

import { LogScreen } from "./log-screen";

export default async function LogPage() {
  const [entries, options, rejections, optionChoices] = await Promise.all([
    getLog(),
    getAllOptionsForSelect(),
    getLogRejections(),
    getOptionChoices(),
  ]);
  return (
    <LogScreen
      entries={entries}
      rejections={rejections}
      options={options}
      optionChoices={optionChoices}
      today={today()}
    />
  );
}
