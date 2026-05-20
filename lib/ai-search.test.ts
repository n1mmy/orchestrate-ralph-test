import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_SEARCH_UNAVAILABLE,
  MAX_RATIONALE_LENGTH,
  MODEL_DEFAULT,
  REQUEST_TIMEOUT_MS,
  aiSearchEnabled,
  buildSnapshot,
  buildSystemPrompt,
  createAiSearchClient,
  describeThinking,
  parseAndValidate,
  planThinking,
  resolveTailMode,
  type AiSearchLogLine,
  type SnapshotInput,
} from "./ai-search";

function baseInput(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    catalog: [
      {
        id: "uuid-banh-mi",
        name: "Banh mi",
        kind: "restaurant",
        tags: ["vietnamese"],
        notes: null,
      },
      {
        id: "uuid-arrabiata",
        name: "Arrabiata",
        kind: "home",
        tags: ["pasta"],
        notes: "Use Calabrian chili oil",
      },
    ],
    log: [
      { optionId: "uuid-banh-mi", eatenOn: "2026-05-18", note: null },
      { optionId: "uuid-arrabiata", eatenOn: "2026-05-22", note: "Planned" },
    ],
    rejections: [],
    today: "2026-05-20",
    query: "something light",
    ...overrides,
  };
}

describe("resolveTailMode", () => {
  it("defaults to pithy", () => {
    expect(resolveTailMode({})).toBe("pithy");
  });

  it("reads the env var when valid", () => {
    expect(resolveTailMode({ AI_TAIL_MODE: "full" })).toBe("full");
    expect(resolveTailMode({ AI_TAIL_MODE: "drop" })).toBe("drop");
    expect(resolveTailMode({ AI_TAIL_MODE: "pithy" })).toBe("pithy");
  });

  it("falls back to pithy on garbage", () => {
    expect(resolveTailMode({ AI_TAIL_MODE: "yolo" })).toBe("pithy");
  });
});

describe("aiSearchEnabled", () => {
  it("is false when the env var is unset", () => {
    expect(aiSearchEnabled({})).toBe(false);
  });

  it("is false when the env var is empty or whitespace", () => {
    expect(aiSearchEnabled({ ANTHROPIC_API_KEY: "" })).toBe(false);
    expect(aiSearchEnabled({ ANTHROPIC_API_KEY: "   " })).toBe(false);
  });

  it("is true when a non-empty key is set", () => {
    expect(aiSearchEnabled({ ANTHROPIC_API_KEY: "sk-test" })).toBe(true);
  });
});

describe("planThinking", () => {
  it("defaults to low", () => {
    expect(planThinking("claude-sonnet-4-6", undefined)).toEqual({
      kind: "budget",
      budgetTokens: 1024,
    });
    expect(planThinking(MODEL_DEFAULT, undefined)).toEqual({
      kind: "adaptive",
      effort: "low",
    });
  });

  it("maps budget levels for a budget model", () => {
    expect(planThinking("claude-haiku-4-5", "medium")).toEqual({
      kind: "budget",
      budgetTokens: 4000,
    });
    expect(planThinking("claude-sonnet-4-6", "high")).toEqual({
      kind: "budget",
      budgetTokens: 6144,
    });
  });

  it("uses adaptive shape for Opus", () => {
    expect(planThinking(MODEL_DEFAULT, "medium")).toEqual({
      kind: "adaptive",
      effort: "medium",
    });
  });

  it("accepts a bare integer budget for the budget family", () => {
    expect(planThinking("claude-sonnet-4-6", "2048")).toEqual({
      kind: "budget",
      budgetTokens: 2048,
    });
    expect(planThinking("claude-sonnet-4-6", "500")).toEqual({
      kind: "budget",
      budgetTokens: 1024, // floor
    });
    expect(planThinking("claude-sonnet-4-6", "0")).toEqual({ kind: "off" });
  });

  it("throws for a positive numeric effort paired with Opus", () => {
    expect(() => planThinking(MODEL_DEFAULT, "4000")).toThrow(/AI_EFFORT/);
  });

  it("accepts off", () => {
    expect(planThinking("claude-sonnet-4-6", "off")).toEqual({ kind: "off" });
    expect(planThinking(MODEL_DEFAULT, "off")).toEqual({ kind: "off" });
  });
});

describe("describeThinking", () => {
  it("produces a stable descriptor", () => {
    expect(describeThinking({ kind: "off" })).toBe("off");
    expect(describeThinking({ kind: "budget", budgetTokens: 1024 })).toBe(
      "budget:1024",
    );
    expect(describeThinking({ kind: "adaptive", effort: "medium" })).toBe(
      "effort:medium",
    );
  });
});

describe("buildSnapshot", () => {
  it("orders Options alphabetically and numbers them 1-based", () => {
    const { snapshot } = buildSnapshot(baseInput());
    expect(snapshot.options.map((o) => o.id)).toEqual([1, 2]);
    expect(snapshot.options.map((o) => o.name)).toEqual([
      "<household-text>Arrabiata</household-text>",
      "<household-text>Banh mi</household-text>",
    ]);
  });

  it("returns an idByIndex mapping integers back to UUIDs", () => {
    const { idByIndex } = buildSnapshot(baseInput());
    expect(idByIndex.get(1)).toBe("uuid-arrabiata");
    expect(idByIndex.get(2)).toBe("uuid-banh-mi");
    expect(idByIndex.size).toBe(2);
  });

  it("refers to Options by integer in log and rejections", () => {
    const { snapshot } = buildSnapshot(
      baseInput({
        rejections: [
          {
            optionId: "uuid-banh-mi",
            rejectedOn: "2026-05-18",
            reason: "closed",
            optionName: "Banh mi",
            kind: "restaurant",
            tags: ["vietnamese"],
          },
        ],
      }),
    );
    expect(snapshot.log.map((entry) => entry.id)).toEqual([1, 2]);
    // 2026-05-18 is earlier than today (2026-05-20) → notTodayRejections.
    expect(snapshot.rejections.notTodayRejections.map((r) => r.id)).toEqual([2]);
    expect(snapshot.rejections.rejectedTonight).toEqual([]);
  });

  it("sorts the log newest first including future-dated rows", () => {
    const { snapshot } = buildSnapshot(baseInput());
    expect(snapshot.log.map((entry) => entry.eatenOn)).toEqual([
      "2026-05-22",
      "2026-05-18",
    ]);
  });

  it("wraps household-authored text in delimiters", () => {
    const { snapshot } = buildSnapshot(baseInput());
    expect(snapshot.query).toBe("<household-text>something light</household-text>");
    expect(snapshot.options[0].tags).toEqual([
      "<household-text>pasta</household-text>",
    ]);
    expect(snapshot.options[0].notes).toBe(
      "<household-text>Use Calabrian chili oil</household-text>",
    );
  });

  it("carries today's weekday and each Log date's weekday", () => {
    const { snapshot } = buildSnapshot(baseInput());
    expect(snapshot.todayWeekday).toBe("Wed");
    expect(snapshot.log[0].weekday).toBe("Fri"); // 2026-05-22
    expect(snapshot.log[1].weekday).toBe("Mon"); // 2026-05-18
  });

  it("does not include any Places fields", () => {
    const { snapshot } = buildSnapshot(baseInput());
    const opt = snapshot.options[0] as Record<string, unknown>;
    expect(opt.address).toBeUndefined();
    expect(opt.phone).toBeUndefined();
    expect(opt.lat).toBeUndefined();
    expect(opt.lng).toBeUndefined();
    expect(opt.googlePlaceId).toBeUndefined();
    expect(opt.mapsUrl).toBeUndefined();
  });

  it("does not carry any pre-computed recency", () => {
    const { snapshot } = buildSnapshot(baseInput());
    expect(JSON.stringify(snapshot)).not.toMatch(/recency/i);
  });
});

describe("buildSnapshot — Rejections", () => {
  function withRejections(
    rejections: SnapshotInput["rejections"],
    today = "2026-05-20",
  ) {
    return buildSnapshot(baseInput({ rejections, today }));
  }

  it("drops today-rejected Options from candidate `options` and `idByIndex` (number gap)", () => {
    const { snapshot, idByIndex } = withRejections([
      {
        optionId: "uuid-arrabiata",
        rejectedOn: "2026-05-20",
        reason: "had it Sunday",
        optionName: "Arrabiata",
        kind: "home",
        tags: ["pasta"],
      },
    ]);
    // Arrabiata is alphabetically first → integer 1. After suppression,
    // candidate options only carries Banh mi at its number, which is 2.
    expect(snapshot.options.map((o) => o.id)).toEqual([2]);
    expect(snapshot.options.map((o) => o.name)).toEqual([
      "<household-text>Banh mi</household-text>",
    ]);
    expect(idByIndex.get(1)).toBeUndefined();
    expect(idByIndex.get(2)).toBe("uuid-banh-mi");
    // The Rejection block still carries the suppressed Option at its
    // stable integer (so the model can read why it was passed over).
    expect(snapshot.rejections.rejectedTonight.map((r) => r.id)).toEqual([1]);
  });

  it("an earlier-rejected Option remains a candidate", () => {
    const { snapshot, idByIndex } = withRejections([
      {
        optionId: "uuid-arrabiata",
        rejectedOn: "2026-05-10",
        reason: "too rich",
        optionName: "Arrabiata",
        kind: "home",
        tags: ["pasta"],
      },
    ]);
    expect(snapshot.options.map((o) => o.id)).toEqual([1, 2]);
    expect(idByIndex.get(1)).toBe("uuid-arrabiata");
    expect(snapshot.rejections.notTodayRejections.map((r) => r.id)).toEqual([1]);
    expect(snapshot.rejections.rejectedTonight).toEqual([]);
  });

  it("a future-dated rejection lands in notTodayRejections; its Option stays a candidate", () => {
    const { snapshot, idByIndex } = withRejections([
      {
        optionId: "uuid-banh-mi",
        rejectedOn: "2026-05-31",
        reason: "closed for a wedding",
        optionName: "Banh mi",
        kind: "restaurant",
        tags: ["vietnamese"],
      },
    ]);
    expect(snapshot.options.map((o) => o.id)).toEqual([1, 2]);
    expect(idByIndex.get(2)).toBe("uuid-banh-mi");
    expect(snapshot.rejections.rejectedTonight).toEqual([]);
    expect(snapshot.rejections.notTodayRejections).toHaveLength(1);
    expect(snapshot.rejections.notTodayRejections[0].id).toBe(2);
    expect(snapshot.rejections.notTodayRejections[0].date).toBe("Sun 2026-05-31");
  });

  it("carries both groups, with delimited reasons and weekday dates", () => {
    const { snapshot } = withRejections([
      {
        optionId: "uuid-arrabiata",
        rejectedOn: "2026-05-20",
        reason: "had pasta last night",
        optionName: "Arrabiata",
        kind: "home",
        tags: ["pasta"],
      },
      {
        optionId: "uuid-banh-mi",
        rejectedOn: "2026-05-10",
        reason: "noisy on weekends",
        optionName: "Banh mi",
        kind: "restaurant",
        tags: ["vietnamese"],
      },
    ]);
    const rt = snapshot.rejections.rejectedTonight;
    const nt = snapshot.rejections.notTodayRejections;
    expect(rt).toHaveLength(1);
    expect(nt).toHaveLength(1);
    expect(rt[0].reason).toBe(
      "<household-text>had pasta last night</household-text>",
    );
    expect(nt[0].reason).toBe(
      "<household-text>noisy on weekends</household-text>",
    );
    expect(rt[0].date).toBe("Wed 2026-05-20");
    expect(nt[0].date).toBe("Sun 2026-05-10");
  });

  it("carries a null reason as null", () => {
    const { snapshot } = withRejections([
      {
        optionId: "uuid-arrabiata",
        rejectedOn: "2026-05-10",
        reason: null,
        optionName: "Arrabiata",
        kind: "home",
        tags: ["pasta"],
      },
    ]);
    expect(snapshot.rejections.notTodayRejections).toHaveLength(1);
    expect(snapshot.rejections.notTodayRejections[0].reason).toBeNull();
  });

  it("includes future-dated Log entries with their real weekday dates, newest first", () => {
    // baseInput already has a 2026-05-22 (future) Log entry alongside a 2026-05-18 one.
    const { snapshot } = buildSnapshot(baseInput());
    expect(snapshot.log.map((e) => e.eatenOn)).toEqual([
      "2026-05-22",
      "2026-05-18",
    ]);
    expect(snapshot.log[0].weekday).toBe("Fri");
  });
});

describe("parseAndValidate", () => {
  const idByIndex = new Map<number, string>([
    [1, "uuid-a"],
    [2, "uuid-b"],
    [3, "uuid-c"],
  ]);

  it("returns null when results is missing", () => {
    expect(parseAndValidate({}, idByIndex)).toBeNull();
    expect(parseAndValidate({ results: "nope" }, idByIndex)).toBeNull();
    expect(parseAndValidate(null, idByIndex)).toBeNull();
  });

  it("returns [] for a valid genuinely empty result", () => {
    expect(parseAndValidate({ results: [] }, idByIndex)).toEqual([]);
  });

  it("maps each integer back to its UUID preserving order", () => {
    const out = parseAndValidate(
      {
        results: [
          { id: 2, reason: "good fit" },
          { id: 1, reason: "second" },
        ],
      },
      idByIndex,
    );
    expect(out).toEqual([
      { optionId: "uuid-b", reason: "good fit" },
      { optionId: "uuid-a", reason: "second" },
    ]);
  });

  it("drops a hallucinated id that is not a candidate", () => {
    const out = parseAndValidate(
      {
        results: [
          { id: 1, reason: "ok" },
          { id: 99, reason: "ghost" },
        ],
      },
      idByIndex,
    );
    expect(out).toEqual([{ optionId: "uuid-a", reason: "ok" }]);
  });

  it("skips a malformed entry but keeps valid rows around it", () => {
    const out = parseAndValidate(
      {
        results: [
          { id: 1, reason: 42 }, // non-string reason
          { id: 2, reason: "ok" },
          "garbage",
          { id: { nested: true }, reason: "nope" },
        ],
      },
      idByIndex,
    );
    expect(out).toEqual([{ optionId: "uuid-b", reason: "ok" }]);
  });

  it("accepts a numeric-string id and rejects a float", () => {
    const out = parseAndValidate(
      {
        results: [
          { id: "2", reason: "stringy" },
          { id: 1.5, reason: "floaty" },
        ],
      },
      idByIndex,
    );
    expect(out).toEqual([{ optionId: "uuid-b", reason: "stringy" }]);
  });

  it("dedupes a repeated Option keeping the first occurrence", () => {
    const out = parseAndValidate(
      {
        results: [
          { id: 1, reason: "first" },
          { id: 1, reason: "second" },
          { id: 2, reason: "other" },
        ],
      },
      idByIndex,
    );
    expect(out).toEqual([
      { optionId: "uuid-a", reason: "first" },
      { optionId: "uuid-b", reason: "other" },
    ]);
  });

  it("truncates an over-long rationale at a word boundary with an ellipsis", () => {
    const word = "abcde";
    const reason = Array(80).fill(word).join(" "); // way over the cap
    const out = parseAndValidate(
      { results: [{ id: 1, reason }] },
      idByIndex,
    );
    expect(out).not.toBeNull();
    const reasonOut = out![0].reason;
    expect(reasonOut.length).toBeLessThanOrEqual(MAX_RATIONALE_LENGTH + 1); // + ellipsis
    expect(reasonOut.endsWith("…")).toBe(true);
    expect(reasonOut.endsWith(" …")).toBe(false);
  });

  it("leaves a rationale within the cap unchanged", () => {
    const reason = "Light and fast — a soup, and it's been three weeks.";
    const out = parseAndValidate(
      { results: [{ id: 1, reason }] },
      idByIndex,
    );
    expect(out![0].reason).toBe(reason);
  });

  it("keeps an empty-string reason as-is", () => {
    const out = parseAndValidate(
      { results: [{ id: 1, reason: "" }] },
      idByIndex,
    );
    expect(out).toEqual([{ optionId: "uuid-a", reason: "" }]);
  });
});

describe("buildSystemPrompt", () => {
  it("mentions habit reasoning and the household-text rule for every mode", () => {
    for (const tail of ["full", "pithy", "drop"] as const) {
      const prompt = buildSystemPrompt(tail);
      expect(prompt).toMatch(/habit/i);
      expect(prompt).toMatch(/household-text/);
      expect(prompt).toMatch(/cadence/i);
      expect(prompt).toMatch(/rejection/i);
    }
  });

  it("explains the two Rejection groups and standing-vs-one-off self-judgment", () => {
    const prompt = buildSystemPrompt("pithy");
    expect(prompt).toMatch(/rejectedTonight/);
    expect(prompt).toMatch(/notTodayRejections/);
    expect(prompt).toMatch(/standing/i);
    expect(prompt).toMatch(/one-off/i);
    // The not-today group reads date-neutrally (rows may be future-dated).
    expect(prompt).toMatch(/future/i);
  });

  it("swaps the open-query instruction per tail mode", () => {
    expect(buildSystemPrompt("full")).toMatch(/give every Option a one-line rationale/);
    expect(buildSystemPrompt("pithy")).toMatch(/empty-string rationale/);
    expect(buildSystemPrompt("drop")).toMatch(/omit obviously-bad picks/);
  });
});

describe("createAiSearchClient", () => {
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    originalConsoleLog = console.log;
    // Swallow log lines emitted by default.
    console.log = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  function makeBuilt() {
    return buildSnapshot(baseInput());
  }

  function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    });
  }

  it("throws at construction when AI_EFFORT is numeric and the model is Opus", () => {
    expect(() =>
      createAiSearchClient({
        apiKey: "sk-test",
        model: MODEL_DEFAULT,
        effort: "4000",
      }),
    ).toThrow(/AI_EFFORT/);
  });

  it("returns hits on a well-formed tool_use response and emits an ok log line", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          content: [
            {
              type: "tool_use",
              name: "rank_options",
              input: {
                results: [
                  { id: 2, reason: "fits the query" },
                  { id: 1, reason: "" },
                ],
              },
            },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 50,
          },
        }),
      );
    const lines: AiSearchLogLine[] = [];
    const client = createAiSearchClient({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      effort: "low",
      tail: "pithy",
      fetchImpl: fetchMock,
      emitLog: (line) => lines.push(line),
    });
    const built = makeBuilt();
    const result = await client.searchOnSnapshot(built, "something light");
    expect(result).toEqual({
      ok: true,
      hits: [
        { optionId: "uuid-banh-mi", reason: "fits the query" },
        { optionId: "uuid-arrabiata", reason: "" },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(body.tools[0].name).toBe("rank_options");
    expect(body.tools[0].cache_control).toEqual({ type: "ephemeral" });
    // Snapshot body cached, query trailing uncached.
    expect(body.messages[0].content[0].cache_control).toEqual({
      type: "ephemeral",
    });
    expect(body.messages[0].content[1].cache_control).toBeUndefined();
    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 1024 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "ai_search",
      outcome: "ok",
      resultCount: 2,
      model: "claude-sonnet-4-6",
      tail: "pithy",
      thinking: "budget:1024",
      queryLength: "something light".length,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadInputTokens: 50,
    });
  });

  it("collapses an HTTP error to AI_SEARCH_UNAVAILABLE and logs a fallback line", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const lines: AiSearchLogLine[] = [];
    const client = createAiSearchClient({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      fetchImpl: fetchMock,
      emitLog: (line) => lines.push(line),
    });
    const result = await client.searchOnSnapshot(makeBuilt(), "x");
    expect(result).toEqual(AI_SEARCH_UNAVAILABLE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lines[0].outcome).toBe("fallback");
  });

  it("collapses a network throw to AI_SEARCH_UNAVAILABLE", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET"));
    const client = createAiSearchClient({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      fetchImpl: fetchMock,
      emitLog: () => {},
    });
    expect(await client.searchOnSnapshot(makeBuilt(), "x")).toEqual(
      AI_SEARCH_UNAVAILABLE,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collapses a response without a tool_use block to AI_SEARCH_UNAVAILABLE", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        content: [{ type: "text", text: "I don't know how to help." }],
      }),
    );
    const client = createAiSearchClient({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      fetchImpl: fetchMock,
      emitLog: () => {},
    });
    expect(await client.searchOnSnapshot(makeBuilt(), "x")).toEqual(
      AI_SEARCH_UNAVAILABLE,
    );
  });

  it("collapses malformed tool_use input (results missing) to AI_SEARCH_UNAVAILABLE", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        content: [
          { type: "tool_use", name: "rank_options", input: { bogus: 1 } },
        ],
      }),
    );
    const client = createAiSearchClient({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      fetchImpl: fetchMock,
      emitLog: () => {},
    });
    expect(await client.searchOnSnapshot(makeBuilt(), "x")).toEqual(
      AI_SEARCH_UNAVAILABLE,
    );
  });

  it("keeps a genuinely empty results: [] as ok: true", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        content: [
          { type: "tool_use", name: "rank_options", input: { results: [] } },
        ],
      }),
    );
    const client = createAiSearchClient({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      fetchImpl: fetchMock,
      emitLog: () => {},
    });
    expect(await client.searchOnSnapshot(makeBuilt(), "x")).toEqual({
      ok: true,
      hits: [],
    });
  });

  it("uses adaptive thinking shape for Opus", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        content: [
          { type: "tool_use", name: "rank_options", input: { results: [] } },
        ],
      }),
    );
    const client = createAiSearchClient({
      apiKey: "sk-test",
      model: MODEL_DEFAULT,
      effort: "medium",
      fetchImpl: fetchMock,
      emitLog: () => {},
    });
    await client.searchOnSnapshot(makeBuilt(), "anything");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "medium" });
  });

  it("aborts via the per-request timeout", async () => {
    const fetchMock: typeof fetch = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          (init as RequestInit | undefined)?.signal?.addEventListener(
            "abort",
            () => {
              const e = new Error("aborted") as Error & { name: string };
              e.name = "AbortError";
              reject(e);
            },
          );
        }),
    ) as unknown as typeof fetch;
    const client = createAiSearchClient({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      fetchImpl: fetchMock,
      timeoutMs: 5,
      emitLog: () => {},
    });
    const result = await client.searchOnSnapshot(makeBuilt(), "x");
    expect(result).toEqual(AI_SEARCH_UNAVAILABLE);
  });

  it("uses the documented 90s timeout by default", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(90_000);
  });
});
