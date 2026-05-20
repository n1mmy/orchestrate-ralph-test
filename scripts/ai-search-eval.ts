/**
 * Eval harness for AI search. Drives the same code path
 * `aiSearchAction` does — `getTonightData` + `getFullLogForSnapshot` +
 * `getRejections` → `buildSnapshot` →
 * `createAiSearchClient(...).searchOnSnapshot(...)` — but from the
 * command line, without the Tonight UI.
 *
 * Flags:
 *   --snapshot         Print the snapshot JSON for the query and exit.
 *   --mode=full|pithy|drop   Override AI_TAIL_MODE for this run.
 *   --compare          Sweep budget models over token budgets and Opus
 *                      over effort levels; run sequentially with --serial.
 *   --serial           When set with --compare, runs one model at a time
 *                      so per-call latencies are clean.
 *
 * The remaining positional argument is the query — an empty string is
 * an open query (the model returns the whole candidate Catalog).
 */
import {
  getFullLogForSnapshot,
  getRejections,
  getTonightData,
} from "@/db/queries";
import {
  buildSnapshot,
  createAiSearchClient,
  resolveTailMode,
  type SnapshotInput,
  type TailMode,
} from "@/lib/ai-search";
import { today } from "@/lib/local-day";

async function readSnapshotInputs(query: string): Promise<SnapshotInput> {
  const todaySql = today();
  const [tonight, log, rejections] = await Promise.all([
    getTonightData(todaySql),
    getFullLogForSnapshot(),
    getRejections(),
  ]);
  return {
    catalog: tonight.options.map((opt) => ({
      id: opt.id,
      name: opt.name,
      kind: opt.kind,
      tags: opt.tags,
      notes: opt.notes,
    })),
    log,
    rejections,
    today: todaySql,
    query,
  };
}

type CliArgs = {
  query: string;
  snapshotOnly: boolean;
  mode: TailMode | null;
  compare: boolean;
  serial: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  let snapshotOnly = false;
  let mode: TailMode | null = null;
  let compare = false;
  let serial = false;
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg === "--snapshot") snapshotOnly = true;
    else if (arg === "--compare") compare = true;
    else if (arg === "--serial") serial = true;
    else if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (value === "full" || value === "pithy" || value === "drop") {
        mode = value;
      }
    } else {
      positional.push(arg);
    }
  }
  return {
    query: positional.join(" "),
    snapshotOnly,
    mode,
    compare,
    serial,
  };
}

const COMPARE_MATRIX: Array<{ model: string; effort: string }> = [
  { model: "claude-haiku-4-5", effort: "low" },
  { model: "claude-haiku-4-5", effort: "medium" },
  { model: "claude-sonnet-4-6", effort: "low" },
  { model: "claude-sonnet-4-6", effort: "medium" },
  { model: "claude-opus-4-7", effort: "low" },
  { model: "claude-opus-4-7", effort: "medium" },
];

async function runOne(
  apiKey: string,
  model: string,
  effort: string,
  tail: TailMode,
  query: string,
): Promise<void> {
  const built = buildSnapshot(await readSnapshotInputs(query));
  const client = createAiSearchClient({
    apiKey,
    model,
    effort,
    tail,
  });
  const startedAt = Date.now();
  const result = await client.searchOnSnapshot(built, query);
  const elapsed = Date.now() - startedAt;
  if (result.ok) {
    // eslint-disable-next-line no-console
    console.log(
      `OK  ${model} effort=${effort} tail=${tail} latency=${elapsed}ms hits=${result.hits.length}`,
    );
    for (const hit of result.hits) {
      // eslint-disable-next-line no-console
      console.log(`  - ${hit.optionId}: ${hit.reason || "(no rationale)"}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `FAIL ${model} effort=${effort} tail=${tail} latency=${elapsed}ms (unavailable)`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error("ANTHROPIC_API_KEY is not set — set it before running the eval.");
    process.exit(1);
  }
  const tail = args.mode ?? resolveTailMode();

  if (args.snapshotOnly) {
    const built = buildSnapshot(await readSnapshotInputs(args.query));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(built.snapshot, null, 2));
    return;
  }

  if (args.compare) {
    if (args.serial) {
      for (const cell of COMPARE_MATRIX) {
        await runOne(apiKey, cell.model, cell.effort, tail, args.query);
      }
    } else {
      await Promise.all(
        COMPARE_MATRIX.map((cell) =>
          runOne(apiKey, cell.model, cell.effort, tail, args.query),
        ),
      );
    }
    return;
  }

  const model = process.env.AI_MODEL ?? "claude-opus-4-7";
  const effort = process.env.AI_EFFORT ?? "low";
  await runOne(apiKey, model, effort, tail, args.query);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
