// The Tonight screen is the home route. Every data page is `force-dynamic`
// so `next build` can render with no live `DATABASE_URL` (the Drizzle
// client is lazy and only opens a socket on the first query).
export const dynamic = "force-dynamic";

import { getTonightData } from "@/db/queries";
import { aiSearchEnabled } from "@/lib/ai-search";
import { epochDayFromSqlDate, today } from "@/lib/local-day";
import { rankTonight, type RankLogEntry } from "@/lib/ranking";
import { splitTonight, type TodayLogEntry } from "@/lib/tonights-dinner";

import { TonightScreen } from "./tonight-screen";

export default async function HomePage() {
  const todaySql = today();
  const data = await getTonightData(todaySql);
  const todayEpoch = epochDayFromSqlDate(todaySql);

  const entries: RankLogEntry[] = data.entries.map((entry) => ({
    optionId: entry.optionId,
    eatenOn: epochDayFromSqlDate(entry.eatenOn),
  }));

  // The live ranking, which feeds the picker. Includes today's Picks in
  // the recency math.
  const rows = rankTonight(data.options, entries, todayEpoch);

  // The pre-today ranking, which feeds the decided block. Drops today's
  // entries so a just-Picked Option's chips show its Recency and Tag
  // recency as they stood *before* tonight ("5d", not a collapsed "0d").
  const entriesBeforeToday = entries.filter(
    (entry) => entry.eatenOn < todayEpoch,
  );
  const decidedRows = rankTonight(
    data.options,
    entriesBeforeToday,
    todayEpoch,
  );

  const todayEntries: TodayLogEntry[] = data.todayEntries.map((entry) => ({
    id: entry.id,
    optionId: entry.optionId,
    createdAt: entry.createdAt,
  }));

  const { tonightsDinner, picker } = splitTonight(
    rows,
    todayEntries,
    decidedRows,
  );

  // The Option's url/phone live on the row already (carried through
  // `RankOption`), so the decided block can derive its action buttons
  // without a second lookup.
  return (
    <TonightScreen
      pickerRows={picker}
      tonightsDinner={tonightsDinner}
      searchEnabled={aiSearchEnabled()}
    />
  );
}
