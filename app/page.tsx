import Link from "next/link";
import { aiSearchEnabled } from "@/lib/ai-search";
import { getTodayRejections, getTonightData } from "@/db/queries";
import { today as todaySqlDate } from "@/lib/local-day";
import { epochDayFromSqlDate } from "@/lib/local-day";
import { rankTonight } from "@/lib/ranking";
import { splitTonight } from "@/lib/tonights-dinner";
import { TonightScreen } from "./tonight-screen";

/**
 * The Tonight screen — the home screen. Has two modes, decided server-side
 * from the Household's Log:
 *
 *  - **Picker mode** (no Log entry dated today) — the v1 ranked picker.
 *  - **Decided mode** (today has at least one Log entry) — a "Tonight's
 *    dinner" panel surfaces the Picked Options under a quiet sub-label; the
 *    picker stays open below in an "Add another option" section.
 *
 * The mode is never client state: this page calls `splitTonight` and hands
 * the two slices to `<TonightScreen>`. The day boundary needs no extra
 * logic — `getTonightData` returns only the Log entries dated *today*, so a
 * new calendar day naturally empties `tonightsDinner` and the screen falls
 * back to picker mode.
 *
 * The Catalog is ranked **twice**:
 *
 *  - `rows` — the live ranking over the full Log. Feeds the picker.
 *  - `decidedRows` — the same Catalog re-ranked over `entriesBeforeToday`
 *    (today's entries dropped). A decided-block row reads its chips from
 *    here, so a just-Picked Option's recency shows the value it stood at
 *    *before* tonight ("5d") rather than collapsed to "0d" by its own
 *    fresh Pick.
 *
 * `force-dynamic` matches `/catalog`'s pattern: no DB query fires at build
 * time, so a build with no `DATABASE_URL` still succeeds. The lazy
 * `postgres-js` client opens its socket on the first request. "Today" is
 * computed in the Household's time zone (`APP_TZ`) so the day cutoff is the
 * calendar day in the kitchen, not the server's UTC day.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const todaySql = todaySqlDate();
  const [{ options, entries, todayEntries }, todayRejections] =
    await Promise.all([getTonightData(todaySql), getTodayRejections(todaySql)]);

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

  // Re-rank the same Catalog over the Log with today's entries dropped, so a
  // decided-block row's chips show the Option's recency as it stood before
  // tonight's Pick — not collapsed to 0d by its own fresh entry.
  const entriesBeforeToday = entries.filter((e) => e.eatenOn < todayEpoch);
  const decidedRows = rankTonight(options, entriesBeforeToday, todayEpoch);

  const { tonightsDinner, picker } = splitTonight(
    rows,
    todayEntries,
    decidedRows,
  );

  // Suppression is a presentation filter only (ADR-0003, ADR-0006): the
  // Score and `lib/ranking.ts` are untouched. Today's rejected Option ids
  // are pulled from the dated `rejections` query, then filtered out of the
  // ranked picker after `rankTonight` runs — same shape as the existing
  // Tag filter. Because the query keys on `rejected_on = today`, a new
  // calendar day empties the result on its own and a rejected Option
  // reappears with no day-boundary code.
  const rejectedIds = new Set(todayRejections.map((r) => r.optionId));
  const visiblePicker = picker.filter((row) => !rejectedIds.has(row.option.id));
  // `allRejected` is the honest empty-list state: the picker would have
  // had rows, but every one has been rejected for tonight. Distinguishing
  // this from a genuinely empty Catalog keeps the screen from going blank.
  const allRejected = picker.length > 0 && visiblePicker.length === 0;

  // AI search is gated on **both** the Anthropic API key and a non-empty
  // Catalog. The key check mirrors `placesEnabled()` — when it's absent the
  // search box vanishes entirely so Tonight reads as v1, and the upstream
  // `aiSearchAction` short-circuits to `AI_SEARCH_UNAVAILABLE` without any
  // DB read or model call. An empty Catalog already redirects above; this
  // branch is reached only when `options.length > 0`, so `searchEnabled` is
  // really the API-key gate. `lib/check-env.ts` is intentionally unchanged —
  // `ANTHROPIC_API_KEY` is optional (absent → feature hidden) and does not
  // belong in the hard-required boot set.
  const searchEnabled = aiSearchEnabled() && options.length > 0;

  return (
    <main className="column">
      <TonightScreen
        tonightsDinner={tonightsDinner}
        pickerRows={visiblePicker}
        rejectedTonight={todayRejections}
        allRejected={allRejected}
        searchEnabled={searchEnabled}
      />
    </main>
  );
}
