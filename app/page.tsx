// The Tonight screen is the home route. Every data page is `force-dynamic`
// so `next build` can render with no live `DATABASE_URL` (the Drizzle
// client is lazy and only opens a socket on the first query).
export const dynamic = "force-dynamic";

import { getTonightData } from "@/db/queries";
import { epochDayFromSqlDate, today } from "@/lib/local-day";
import { rankTonight, type RankLogEntry } from "@/lib/ranking";

import { TonightScreen } from "./tonight-screen";

export default async function HomePage() {
  const todaySql = today();
  const data = await getTonightData(todaySql);
  const todayEpoch = epochDayFromSqlDate(todaySql);

  const entries: RankLogEntry[] = data.entries.map((entry) => ({
    optionId: entry.optionId,
    eatenOn: epochDayFromSqlDate(entry.eatenOn),
  }));

  const rows = rankTonight(data.options, entries, todayEpoch);
  return <TonightScreen rows={rows} />;
}
