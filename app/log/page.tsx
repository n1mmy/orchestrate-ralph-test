// The Log is data, queried per request — `force-dynamic` keeps `next build`
// running with no live `DATABASE_URL` (the Drizzle client is lazy).
export const dynamic = "force-dynamic";

import { getAllOptionsForSelect, getLog } from "@/db/queries";
import { today } from "@/lib/local-day";

import { LogScreen } from "./log-screen";

export default async function LogPage() {
  const [entries, options] = await Promise.all([
    getLog(),
    getAllOptionsForSelect(),
  ]);
  return <LogScreen entries={entries} options={options} today={today()} />;
}
