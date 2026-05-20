"use server";

import {
  AI_SEARCH_UNAVAILABLE,
  aiSearchEnabled,
  createAiSearchClient,
  type SearchResult,
} from "@/lib/ai-search";
import { authedAction } from "@/lib/authed-action";
import {
  getFullLogForSnapshot,
  getRejections,
  getTonightData,
} from "@/db/queries";
import { today as todaySqlDate } from "@/lib/local-day";

/**
 * The AI-search server action — the thin entrypoint the Tonight screen calls
 * to swap the deterministic ranked list for an AI-ranked result. Wrapped in
 * `authedAction` so only an authenticated Household session can drive the
 * billed Anthropic API through a stolen `Next-Action` id.
 *
 * The action is deliberately thin: read the active Catalog (from
 * `getTonightData`) plus the full Log (from `getFullLogForSnapshot`, which
 * includes future-dated Planned dinners) plus the Rejection history (from
 * `getRejections`, which already includes future-dated Rejections), hand them
 * all to `createAiSearchClient(...).search`, and return the typed result.
 * `getTonightData`'s non-future `entries` feed the deterministic ranking only —
 * never this AI path; the AI snapshot is the one place that sees the
 * Household's near future. Every snapshot decision (alphabetical ordering,
 * integer ids, `<household-text>` delimiters, no pre-computed recency, etc.)
 * lives in `lib/ai-search` — the action does not know any of that, it just
 * passes the dated raw inputs through.
 *
 * An unset `ANTHROPIC_API_KEY` collapses to the same `AI_SEARCH_UNAVAILABLE`
 * sentinel as any network failure — the form upstream has one fallback path,
 * matching the `lib/places.ts` pattern. The `pnpm build` step requires no env
 * vars because the Anthropic client is constructed lazily inside `search`.
 */
export const aiSearchAction = authedAction(
  async (query: string): Promise<SearchResult> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!aiSearchEnabled() || typeof apiKey !== "string" || apiKey.trim() === "") {
      return AI_SEARCH_UNAVAILABLE;
    }

    const todaySql = todaySqlDate();
    const [{ options }, fullLog, rejections] = await Promise.all([
      getTonightData(todaySql),
      getFullLogForSnapshot(),
      getRejections(),
    ]);

    const client = createAiSearchClient(apiKey);
    return client.search({
      options: options.map((o) => ({
        id: o.id,
        name: o.name,
        kind: o.kind,
        tags: o.tags,
        notes: o.notes,
      })),
      log: fullLog,
      rejections,
      today: todaySql,
      query,
    });
  },
);
