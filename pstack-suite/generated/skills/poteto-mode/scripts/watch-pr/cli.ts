import { setTimeout as delay } from "node:timers/promises";
import { parseArgs as parseOptions } from "node:util";
import {
  GhGitHubReader,
  WatcherQueryError,
  discoverStack,
  resolveContext,
} from "./github.ts";
import {
  runQueued,
  runSimple,
  statusQueryVerdict,
  verdictFactory,
  type WatchClock,
} from "./policy.ts";
import { renderJson, renderPretty } from "./render.ts";
import type * as T from "./types.ts";
import { nonEmpty, parsePrNumber } from "./types.ts";
export interface CliOptions {
  readonly owner: string | null;
  readonly repo: string | null;
  readonly pr: T.PrNumber | null;
  readonly mode: T.WatchMode;
  readonly stackPrs: readonly T.PrNumber[];
  readonly statusOnly: boolean;
  readonly pretty: boolean;
  readonly polling: T.PollingOptions;
}
const help = `Usage: bun cli.ts [options]

Read-only GitHub PR watcher. Output is JSON (NDJSON while polling); --pretty renders human text.

  --owner <owner> --repo <repo> --pr <number>   Explicit GitHub target (otherwise infer from Git/gh)
  --stack                                     Watch the connected open stack
  --queued-stack                              Observe a captured stack until all PRs merge
  --stack-prs <n,...>                          Frozen bottom-to-top list (queued mode only)
  --interval <seconds>                        Poll interval (default: 60)
  --sweep-interval <seconds>                  Whole-stack sweep interval (default: 300)
  --timeout <seconds>                         Polling deadline; 0 disables it (default: 0)
  --max-query-errors <count>                  Consecutive query-error budget (default: 5)
  --status-only                               Take one snapshot instead of polling
  --allow-draft                               Do not treat a draft as a merge gate
  --pretty                                    Render human text
  -h, --help                                  Show this help
`;

const optionTypes = {
  owner: { type: "string" }, repo: { type: "string" }, pr: { type: "string" },
  stack: { type: "boolean" }, "queued-stack": { type: "boolean" },
  "stack-prs": { type: "string" }, interval: { type: "string" },
  "sweep-interval": { type: "string" }, timeout: { type: "string" },
  "max-query-errors": { type: "string" }, "status-only": { type: "boolean" },
  "allow-draft": { type: "boolean" }, pretty: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

function numberOption(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  const valid = Number.isFinite(parsed) && (name === "timeout" ? parsed >= 0 : parsed > 0);
  if (!valid || !raw.trim() || (name === "max-query-errors" && !Number.isSafeInteger(parsed))) {
    throw new Error(`Invalid --${name}: ${raw}`);
  }
  return parsed;
}

export function parseArgs(argv: readonly string[], io: Pick<CliRuntime, "stdout" | "stderr">): CliOptions | null {
  const { values } = parseOptions({ args: [...argv], options: optionTypes });
  if (values.help) {
    io.stdout(help);
    return null;
  }
  const queued = values["queued-stack"];
  if (values.stack && queued) throw new Error("--stack conflicts with --queued-stack");
  const rawStack = values["stack-prs"];
  if (rawStack !== undefined && !queued) throw new Error("--stack-prs requires --queued-stack");
  const stackPrs = rawStack?.split(",").map(part => parsePrNumber(Number(part.trim().replace(/^#/, "")), "--stack-prs")) ?? [];
  if (new Set(stackPrs).size !== stackPrs.length) throw new Error("--stack-prs contains a duplicate PR");
  const pr = values.pr;
  return {
    owner: values.owner ?? null,
    repo: values.repo ?? null,
    pr: pr === undefined ? null : parsePrNumber(Number(pr.replace(/^#/, "")), "--pr"),
    mode: queued ? "queued-stack" : values.stack ? "stack" : "single",
    stackPrs,
    statusOnly: values["status-only"] ?? false,
    pretty: values.pretty ?? false,
    polling: {
      interval: numberOption("interval", values.interval, 60),
      sweepInterval: numberOption("sweep-interval", values["sweep-interval"], 300),
      timeout: numberOption("timeout", values.timeout, 0),
      maxQueryErrors: numberOption("max-query-errors", values["max-query-errors"], 5),
      allowDraft: values["allow-draft"] ?? false,
    },
  };
}
export interface CliRuntime {
  readonly reader: T.GitHubReader;
  readonly clock: WatchClock;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}
function realRuntime(): CliRuntime {
  return {
    reader: new GhGitHubReader(),
    clock: {
      now: () => performance.now() / 1_000,
      observedAt: () => new Date().toISOString(),
      sleep: async (seconds) => {
        await delay(seconds * 1_000);
      },
    },
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  };
}
export async function main(
  argv: readonly string[],
  runtime: CliRuntime = realRuntime()
): Promise<number> {
  let options: CliOptions | null;
  try {
    options = parseArgs(argv, runtime);
  } catch (error) {
    runtime.stderr(`watch-pr: ${error instanceof Error ? error.message : String(error)}\n`);
    return 64;
  }
  if (options === null) return 0;
  const render = options.pretty ? renderPretty : renderJson;
  const emit = (verdict: T.ProgressVerdict): void =>
    runtime.stdout(render(verdict));
  let contexts: T.NonEmpty<T.PrContext>;
  try {
    const seed = await resolveContext({
      reader: runtime.reader,
      owner: options.owner,
      repo: options.repo,
      pr: options.pr ?? options.stackPrs[0] ?? null,
    });
    contexts =
      nonEmpty(options.stackPrs.map((number) => ({ ...seed, number }))) ??
      (options.mode === "single"
        ? [seed]
        : await discoverStack(runtime.reader, seed));
  } catch (error) {
    if (!(error instanceof WatcherQueryError)) throw error;
    const verdict = statusQueryVerdict(
      verdictFactory(runtime.clock, options.mode),
      1,
      error.failure
    );
    runtime.stdout(render(verdict));
    return verdict.exitCode;
  }
  const dependencies = { reader: runtime.reader, clock: runtime.clock, emit };
  const verdict =
    options.mode === "queued-stack" && !options.statusOnly
      ? await runQueued({ dependencies, contexts, options: options.polling })
      : await runSimple({
          dependencies,
          contexts,
          mode: options.mode,
          statusOnly: options.statusOnly,
          options: options.polling,
        });
  runtime.stdout(render(verdict));
  return verdict.exitCode;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
