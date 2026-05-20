"use server";

/**
 * Tonight server actions — currently just `aiSearchAction`.
 *
 * `aiSearchAction(query)` is the AI search entry point. It is
 * `authedAction`-wrapped (only an authenticated Household session may call
 * it), short-circuits when `ANTHROPIC_API_KEY` is unset (no DB read, no
 * model call), builds the snapshot from the active Catalog, the full Log,
 * and the Rejection history, and returns either the validated ordered
 * result or the typed `AI_SEARCH_UNAVAILABLE` outcome.
 *
 * Every failure mode — timeout, HTTP error, network, no-tool-use, malformed
 * input — collapses to the one unavailable outcome inside `lib/ai-search`.
 */

import { getAiSearchSnapshotInput } from "@/db/queries";
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

    const input = await getAiSearchSnapshotInput();

    const built = buildSnapshot({
      catalog: input.catalog,
      log: input.log,
      rejections: input.rejections,
      today: today(),
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
