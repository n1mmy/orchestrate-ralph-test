"use server";

/**
 * Tonight server actions — currently just `aiSearchAction`.
 *
 * `aiSearchAction(query)` is the AI search entry point. It is
 * `authedAction`-wrapped (only an authenticated Household session may call
 * it), short-circuits when `ANTHROPIC_API_KEY` is unset (no DB read, no
 * model call), and builds the snapshot from three reads:
 *
 *   - `getTonightData(today)` — the active Catalog (with notes and tags).
 *   - `getFullLogForSnapshot()` — every Log row of an active Option,
 *     past *and* future-dated (Planned dinners), so the AI path sees the
 *     near future the deterministic ranking deliberately drops.
 *   - `getRejections()` — every Rejection joined to its active Option,
 *     past and future-dated alike; `buildSnapshot` partitions today's
 *     subset to suppress those Options from the candidate list, and
 *     hands the rest to the model as the Rejections block.
 *
 * Returns either the validated ordered result or the typed
 * `AI_SEARCH_UNAVAILABLE` outcome. Every failure mode — timeout, HTTP
 * error, network, no-tool-use, malformed input — collapses to the one
 * unavailable outcome inside `lib/ai-search`.
 */

import {
  getFullLogForSnapshot,
  getRejections,
  getTonightData,
} from "@/db/queries";
import {
  AI_SEARCH_UNAVAILABLE,
  aiSearchEnabled,
  buildSnapshot,
  createAiSearchClient,
  resolveTailMode,
  type AiSearchResult,
} from "@/lib/ai-search";
import { authedAction } from "@/lib/authed-action";
import { today } from "@/lib/local-day";

export const aiSearchAction = authedAction(
  async (query: string): Promise<AiSearchResult> => {
    // Config gate first — when no key is set we short-circuit without
    // touching the DB or the model.
    if (!aiSearchEnabled()) return AI_SEARCH_UNAVAILABLE;
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";

    const todaySql = today();
    const [tonight, fullLog, rejections] = await Promise.all([
      getTonightData(todaySql),
      getFullLogForSnapshot(),
      getRejections(),
    ]);

    const built = buildSnapshot({
      catalog: tonight.options.map((opt) => ({
        id: opt.id,
        name: opt.name,
        kind: opt.kind,
        tags: opt.tags,
        notes: opt.notes,
      })),
      log: fullLog,
      rejections,
      today: todaySql,
      query,
    });

    let client;
    try {
      client = createAiSearchClient({
        apiKey,
        model: process.env.AI_MODEL,
        effort: process.env.AI_EFFORT,
        tail: resolveTailMode(),
      });
    } catch {
      // Misconfiguration (e.g. numeric AI_EFFORT with Opus) — collapse to
      // unavailable so the Household can keep using the deterministic list.
      return AI_SEARCH_UNAVAILABLE;
    }

    return client.searchOnSnapshot(built, query);
  },
);
