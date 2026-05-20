/**
 * AI-search eval harness. Runs an AI search against the real dev database
 * from the command line — exactly the path `aiSearchAction` walks, minus the
 * Tonight UI — so an operator can sweep models / effort levels / tail modes
 * without the latency of clicking through the app.
 *
 * The harness reads exactly the same dated inputs as the server action:
 *
 *  - the active Catalog (`getTonightData`)
 *  - the full Log (`getTonightData`'s `fullLog`)
 *  - the Rejection history (`getRejections`)
 *  - today's calendar day (`lib/local-day`'s `today`)
 *
 * and builds the snapshot through `buildSnapshot`, so any divergence from
 * production behaviour is a real bug in the shared module, never in this
 * script.
 *
 * Flags:
 *
 *  - `--query "..."` — the search query (defaults to empty string, the
 *    open-query case).
 *  - `--snapshot` — dump the built `ModelSnapshot` to stdout as pretty JSON
 *    and exit; no model call, no token spend.
 *  - `--mode=full|pithy|drop` — override `AI_TAIL_MODE` for this run.
 *  - `--compare` — run the matrix sweep: each budget-API model
 *    (Sonnet, Haiku) over each token-budget level (off + the three canonical
 *    budgets), and Opus 4.7 over each canonical effort level. Each cell is
 *    one model call; the timing and result count is printed per cell.
 *  - `--serial` — pair with `--compare` for clean per-call latencies (each
 *    cell runs after the previous resolves, so the latency you read is the
 *    cell's own).
 *  - `--model <id>` — override `AI_MODEL` for a single-call run.
 *  - `--effort <level|N>` — override `AI_EFFORT` for a single-call run.
 *
 * Usage:
 *
 *     pnpm tsx scripts/ai-search-eval.ts --query "something light"
 *     pnpm tsx scripts/ai-search-eval.ts --snapshot
 *     pnpm tsx scripts/ai-search-eval.ts --compare --serial
 *
 * Loud failure on misconfiguration: an unset `ANTHROPIC_API_KEY` exits with a
 * non-zero code rather than silently falling back to the deterministic list
 * — the eval harness exists to exercise the model.
 */

import {
  MODEL_DEFAULT,
  aiSearchEnabled,
  buildSnapshot,
  createAiSearchClient,
  resolveEffortChoice,
  resolveModel,
  resolveTailMode,
  type AiSearchLogLine,
  type EffortChoice,
  type SearchResult,
  type TailMode,
} from "@/lib/ai-search";
import { getRejections, getTonightData } from "@/db/queries";
import { today as todaySqlDate } from "@/lib/local-day";

/** A parsed view of the harness's command-line flags. Everything optional. */
type Args = {
  query: string;
  snapshot: boolean;
  mode: TailMode | null;
  compare: boolean;
  serial: boolean;
  model: string | null;
  effort: string | null;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    query: "",
    snapshot: false,
    mode: null,
    compare: false,
    serial: false,
    model: null,
    effort: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--snapshot") out.snapshot = true;
    else if (arg === "--compare") out.compare = true;
    else if (arg === "--serial") out.serial = true;
    else if (arg === "--query") out.query = argv[++i] ?? "";
    else if (arg?.startsWith("--query=")) out.query = arg.slice("--query=".length);
    else if (arg?.startsWith("--mode=")) {
      const v = arg.slice("--mode=".length).toLowerCase();
      if (v === "full" || v === "pithy" || v === "drop") out.mode = v;
      else throw new Error(`unrecognised --mode value: ${v}`);
    } else if (arg === "--model") out.model = argv[++i] ?? null;
    else if (arg?.startsWith("--model=")) out.model = arg.slice("--model=".length);
    else if (arg === "--effort") out.effort = argv[++i] ?? null;
    else if (arg?.startsWith("--effort=")) out.effort = arg.slice("--effort=".length);
  }
  return out;
}

/** Load the same dated inputs `aiSearchAction` loads. */
async function loadInputs(query: string) {
  const todaySql = todaySqlDate();
  const [{ options, fullLog }, rejections] = await Promise.all([
    getTonightData(todaySql),
    getRejections(),
  ]);
  return {
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
  };
}

/** One row of the `--compare` matrix output. */
type CompareCell = {
  model: string;
  effort: EffortChoice;
  outcome: "ok" | "fallback";
  resultCount: number;
  latencyMs: number;
};

/** The matrix `--compare` sweeps: each budget model over off + the three
 * canonical levels (mapped to their budget tokens), plus Opus 4.7 over the
 * three canonical effort levels (no `off` — adaptive thinking is the whole
 * point of running Opus). */
const BUDGET_MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5"] as const;
const BUDGET_LEVELS: EffortChoice[] = [
  { kind: "level", effort: "off" },
  { kind: "level", effort: "low" },
  { kind: "level", effort: "medium" },
  { kind: "level", effort: "high" },
];
const ADAPTIVE_LEVELS: EffortChoice[] = [
  { kind: "level", effort: "low" },
  { kind: "level", effort: "medium" },
  { kind: "level", effort: "high" },
];

async function runCell(
  apiKey: string,
  model: string,
  effortChoice: EffortChoice,
  tailMode: TailMode,
  input: Awaited<ReturnType<typeof loadInputs>>,
): Promise<CompareCell> {
  const captured: AiSearchLogLine[] = [];
  const client = createAiSearchClient(apiKey, {
    model,
    effortChoice,
    tailMode,
    logger: (line) => {
      captured.push(line);
    },
  });
  const result: SearchResult = await client.search(input);
  return {
    model,
    effort: effortChoice,
    outcome: result.ok ? "ok" : "fallback",
    resultCount: result.ok ? result.results.length : 0,
    latencyMs: captured[0]?.latencyMs ?? 0,
  };
}

function effortLabel(choice: EffortChoice): string {
  return choice.kind === "budget"
    ? `budget:${choice.tokens}`
    : `effort:${choice.effort}`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (!aiSearchEnabled()) {
    process.stderr.write(
      "ANTHROPIC_API_KEY is not set — the eval harness has nothing to do.\n",
    );
    return 1;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const tailMode = args.mode ?? resolveTailMode();
  const input = await loadInputs(args.query);

  if (args.snapshot) {
    const { snapshot } = buildSnapshot(input);
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return 0;
  }

  if (args.compare) {
    const cells: CompareCell[] = [];
    const tasks: Array<() => Promise<CompareCell>> = [];
    for (const model of BUDGET_MODELS) {
      for (const level of BUDGET_LEVELS) {
        tasks.push(() => runCell(apiKey, model, level, tailMode, input));
      }
    }
    for (const level of ADAPTIVE_LEVELS) {
      tasks.push(() =>
        runCell(apiKey, MODEL_DEFAULT, level, tailMode, input),
      );
    }
    if (args.serial) {
      // Serial: each cell runs after the previous resolves, so the latency
      // each cell reports is its own (not a thundering-herd queue wait).
      for (const task of tasks) cells.push(await task());
    } else {
      const results = await Promise.all(tasks.map((t) => t()));
      cells.push(...results);
    }
    process.stdout.write(
      cells
        .map(
          (c) =>
            `${c.model.padEnd(22)} ${effortLabel(c.effort).padEnd(18)} ${c.outcome.padEnd(8)} ${String(c.resultCount).padStart(3)} rows  ${String(c.latencyMs).padStart(6)}ms`,
        )
        .join("\n") + "\n",
    );
    return 0;
  }

  // Single-call run: honour --model / --effort overrides, fall back to env.
  const model = args.model ?? resolveModel();
  let effortChoice: EffortChoice;
  if (args.effort !== null) {
    if (/^-?\d+$/.test(args.effort.trim())) {
      const n = Number(args.effort.trim());
      if (n <= 0) effortChoice = { kind: "level", effort: "off" };
      else effortChoice = { kind: "budget", tokens: Math.max(n, 1024) };
    } else {
      const v = args.effort.trim().toLowerCase();
      if (v === "off" || v === "low" || v === "medium" || v === "high") {
        effortChoice = { kind: "level", effort: v };
      } else {
        throw new Error(`unrecognised --effort value: ${args.effort}`);
      }
    }
  } else {
    effortChoice = resolveEffortChoice();
  }

  const capturedLines: AiSearchLogLine[] = [];
  const client = createAiSearchClient(apiKey, {
    model,
    effortChoice,
    tailMode,
    logger: (line) => {
      capturedLines.push(line);
    },
  });
  const result = await client.search(input);
  for (const line of capturedLines) {
    process.stdout.write(`${JSON.stringify(line)}\n`);
  }
  if (result.ok) {
    process.stdout.write(`${JSON.stringify(result.results, null, 2)}\n`);
    return 0;
  }
  process.stderr.write("AI search returned the fallback sentinel.\n");
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
