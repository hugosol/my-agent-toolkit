import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot, type RunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

const suite = resolve(import.meta.dir, "../../pstack-suite");
const watcher = join(suite, "generated/skills/poteto-mode/scripts/watch-pr/cli.ts");
const bun = process.execPath;

interface Reply {
  view?: Record<string, unknown>;
  landing?: { mergeQueueEntry: { position: number } | null; autoMergeRequest: { enabledAt: string | null } | null };
  error?: string;
}

interface CommandEvidence {
  argv: string[];
  exit: number | null;
  stdout: string;
  stderr: string;
}

interface ForgeFixture {
  env: NodeJS.ProcessEnv;
  callsPath: string;
}

function runCommand(run: RunRoot, argv: string[], env?: NodeJS.ProcessEnv): CommandEvidence {
  const result = Bun.spawnSync(argv, { cwd: run.workDir, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  return { argv, exit: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function setupForge(run: RunRoot, replies: Record<string, Reply>) {
  const bin = join(run.path, "bin");
  mkdirSync(bin);
  const executable = join(bin, process.platform === "win32" ? "gh.exe" : "gh");
  const compiled = runCommand(run, [bun, "build", "--compile", resolve(import.meta.dir, "fixtures/forge-gh.ts"), "--outfile", executable]);
  expect(compiled.exit, compiled.stderr).toBe(0);
  const fixture = join(run.path, "forge.json");
  const callsPath = join(run.path, "forge.ndjson");
  writeFileSync(fixture, JSON.stringify(replies));
  const env = { PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, GH_TOKEN: undefined, GITHUB_TOKEN: undefined,
    GH_ENTERPRISE_TOKEN: undefined, GITHUB_ENTERPRISE_TOKEN: undefined, GH_CONFIG_DIR: run.agentDir,
    PSTACK_FORGE_FIXTURE: fixture, PSTACK_FORGE_CALLS: callsPath };
  return { env, callsPath };
}

function openPr(headRefName: string, baseRefName: string): Reply {
  return {
    view: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "APPROVED", headRefOid: "54abc", headRefName, baseRefName, state: "OPEN", mergedAt: null, isDraft: false },
    landing: { mergeQueueEntry: null, autoMergeRequest: null },
  };
}

function events(output: string) {
  return output.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
}

function expectReadOnlyForgeCalls(forge: ForgeFixture): void {
  const calls: string[][] = events(readFileSync(forge.callsPath, "utf8"));
  expect(calls.length).toBeGreaterThan(0);
  for (const args of calls) {
    const [group, action] = args;
    expect((group === "pr" && ["view", "checks"].includes(action)) ||
      (group === "api" && action === "graphql" && args.some(arg => /^query=\s*query\s/.test(arg)))).toBe(true);
  }
}

function recordEvidence(name: string, evidence: unknown) {
  const dir = process.env.PSTACK_FORGE_EVIDENCE_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(evidence, null, 2));
  }
}

function finishOwnedCase(run: RunRoot, name: string, result: CommandEvidence | undefined, forge?: ForgeFixture, commands?: CommandEvidence[]) {
  let calls: string | null = null;
  try {
    if (forge && existsSync(forge.callsPath)) calls = readFileSync(forge.callsPath, "utf8");
  } finally {
    run.dispose();
    const rootRemoved = !existsSync(run.path);
    recordEvidence(name, { result, commands, calls, rootRemoved });
    expect(rootRemoved).toBe(true);
  }
}

// Approved S3 action: execute the shipped watcher; observe its ordinary CLI
// results and real local repository, with only the external forge substituted.
// P38 violation: reporting every clean PR as enqueued, or losing real queue position.
// Independent inputs: #31 has a queue entry at 3; equally green #32 has none.
test("P38 reports a real queue entry without claiming the other clean PR is queued or merged", () => {
  const run = createRunRoot("pstack-forge-queue");
  let result: CommandEvidence | undefined;
  let forge: ForgeFixture | undefined;
  try {
    const queued = openPr("lower", "main");
    queued.landing!.mergeQueueEntry = { position: 3 };
    const scheduled = openPr("last", "upper");
    scheduled.landing!.autoMergeRequest = { enabledAt: null };
    forge = setupForge(run, { 31: queued, 32: openPr("upper", "lower"), 33: scheduled });
    for (const args of [["init", "--initial-branch=main"], ["remote", "add", "origin", "https://github.com/isolated/demo.git"]]) {
      const git = runCommand(run, ["git", ...args]);
      expect(git.exit, git.stderr).toBe(0);
    }
    result = runCommand(run, [bun, watcher, "--queued-stack", "--stack-prs", "31,32,33", "--status-only"], forge.env);
    expect(result.exit, result.stderr).toBe(0);
    const status = events(result.stdout);
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ kind: "STATUS", terminal: true, rows: [
      { kind: "open", context: { owner: "isolated", repo: "demo", number: 31 }, facts: { baseRefName: "main", landing: { kind: "queued", position: 3 } } },
      { kind: "open", context: { number: 32 }, facts: { baseRefName: "lower", landing: { kind: "not-queued" } } },
      { kind: "open", context: { number: 33 }, facts: { baseRefName: "upper", landing: { kind: "auto-merge-requested", enabledAt: null } } },
    ] });
    expectReadOnlyForgeCalls(forge);
  } finally {
    finishOwnedCase(run, "queue", result, forge);
  }
});

function makeGitStack(run: RunRoot, landUpperOnParent: boolean) {
  const commands: CommandEvidence[] = [];
  const git = (...args: string[]) => {
    const result = runCommand(run, ["git", ...args]);
    commands.push(result);
    expect(result.exit, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  git("init", "--initial-branch=main");
  git("config", "user.name", "pstack forge test");
  git("config", "user.email", "forge-test@example.invalid");
  const hooks = join(run.path, "no-hooks");
  mkdirSync(hooks);
  git("config", "core.hooksPath", hooks);
  git("config", "commit.gpgSign", "false");
  git("commit", "--allow-empty", "-m", "trunk seed");
  git("remote", "add", "origin", "https://github.com/isolated/demo.git");
  git("switch", "-c", "lower");
  writeFileSync(join(run.workDir, "lower.txt"), "accepted lower change\n");
  git("add", "lower.txt");
  git("commit", "-m", "lower change");
  const lower = git("rev-parse", "HEAD");
  git("switch", "-c", "upper");
  writeFileSync(join(run.workDir, "upper.txt"), "separate upper change\n");
  git("add", "upper.txt");
  git("commit", "-m", "upper change");
  const upper = git("rev-parse", "HEAD");
  git("switch", "main");
  git("merge", "--ff-only", "lower");
  if (landUpperOnParent) {
    git("switch", "lower");
    git("merge", "--ff-only", "upper");
    git("switch", "main");
  }
  return { git, lower, upper, commands };
}

// P38: #31 is already merged into main when the read of #32 errors.
// The terminal query failure cannot erase the acknowledged Git effect or become COMPLETE.
test("P38 keeps the observed partial landing when the next forge read fails", () => {
  const run = createRunRoot("pstack-forge-partial");
  let forge: ForgeFixture | undefined;
  let result: CommandEvidence | undefined;
  let commands: CommandEvidence[] | undefined;
  try {
    const { git, lower, commands: observations } = makeGitStack(run, false);
    commands = observations;
    const refs = git("show-ref", "--heads");
    const error = "fixture access revoked before reading #32";
    forge = setupForge(run, { 31: mergedPr("lower", "main", lower), 32: { error } });
    result = runCommand(run, [bun, watcher, "--queued-stack", "--stack-prs", "31,32", "--max-query-errors", "1"], forge.env);
    expect(result.exit, result.stderr).toBe(7);
    const verdicts = events(result.stdout);
    expect(verdicts.map(verdict => verdict.kind)).toEqual(["QUEUE", "MERGED", "BLOCKER"]);
    expect(verdicts[1]).toMatchObject({ terminal: false, merged: { context: { number: 31 }, baseRefName: "main", mergedAt } });
    expect(verdicts[2]).toMatchObject({ terminal: true, blocker: { kind: "status-query", failures: 1, failure: { kind: "command-exit", code: 1, detail: error } } });
    expect(git("show", "main:lower.txt")).toBe("accepted lower change");
    expect(git("ls-tree", "main", "upper.txt")).toBe("");
    expect(git("ls-tree", "lower", "upper.txt")).toBe("");
    expect(git("show-ref", "--heads")).toBe(refs);
    expectReadOnlyForgeCalls(forge);
    expect(git("status", "--porcelain")).toBe("");
  } finally {
    finishOwnedCase(run, "partial-failure", result, forge, commands);
  }
});

const mergedAt = "2026-01-20T06:30:00Z";

function mergedPr(headRefName: string, baseRefName: string, headRefOid: string): Reply {
  return { view: { ...openPr(headRefName, baseRefName).view, state: "MERGED", mergedAt, headRefOid } };
}

// P38: a missing gh executable is an independent failure, not empty or green status.
test("P38 reports a missing forge executable as a terminal status-query error", () => {
  const run = createRunRoot("pstack-forge-missing");
  let result: CommandEvidence | undefined;
  try {
    result = runCommand(run, [bun, watcher, "--owner", "isolated", "--repo", "demo", "--pr", "31", "--status-only"],
      { ...process.env, PATH: run.workDir });
    expect(result.exit, result.stderr).toBe(7);
    expect(events(result.stdout)).toMatchObject([
      { kind: "BLOCKER", terminal: true, exitCode: 7, blocker: { kind: "status-query", failures: 1,
        failure: { kind: "command-start", retryable: false, detail: expect.stringContaining("gh"), code: "ENOENT" } } },
    ]);
    expect(result.stderr).toBe("");
  } finally {
    finishOwnedCase(run, "missing-gh", result);
  }
});

// P38: GitHub's MERGED can mean landed into the parent branch, not trunk.
// Independently check actual Git contents alongside the watcher terminal output.
test("P38 names the destination of each completed merge and leaves the Git stack unchanged", () => {
  const run = createRunRoot("pstack-forge-merged");
  let forge: ForgeFixture | undefined;
  let result: CommandEvidence | undefined;
  let commands: CommandEvidence[] | undefined;
  try {
    const { git, lower, upper, commands: observations } = makeGitStack(run, true);
    commands = observations;
    const refs = git("show-ref", "--heads");
    forge = setupForge(run, { 31: mergedPr("lower", "main", lower), 32: mergedPr("upper", "lower", upper) });
    result = runCommand(run, [bun, watcher, "--queued-stack", "--stack-prs", "31,32", "--timeout", "3"], forge.env);
    expect(result.exit, result.stderr).toBe(0);
    const verdicts = events(result.stdout);
    expect(verdicts[verdicts.length - 1]).toMatchObject({ kind: "COMPLETE", terminal: true, merged: [
      { context: { number: 31 }, baseRefName: "main", mergedAt },
      { context: { number: 32 }, baseRefName: "lower", mergedAt },
    ] });
    expect(git("show", "main:lower.txt")).toBe("accepted lower change");
    expect(git("ls-tree", "main", "upper.txt")).toBe("");
    expect(git("show", "lower:upper.txt")).toBe("separate upper change");
    expect(git("show-ref", "--heads")).toBe(refs);
    expectReadOnlyForgeCalls(forge);
    expect(git("status", "--porcelain")).toBe("");
  } finally {
    finishOwnedCase(run, "merged", result, forge, commands);
  }
});

// P36/S3: explicit native file read + bash action. The scripted provider only
// supplies the named calls; the installed OMP and shipped watcher execute them.
test("P36 installed OMP reads Shipping and runs the actual watcher to report a merge", async () => {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-forge-native");
  const command = `"$PSTACK_FORGE_BUN" "$PSTACK_FORGE_WATCHER" --queued-stack --stack-prs 31 --pretty --timeout 5`;
  const capture = startCaptureServer({
    dir: run.captureDir,
    respond: ({ index }) => {
      if (index === 1) return { toolCall: { name: "read", arguments: JSON.stringify({ path: "skill://poteto-mode/playbooks/shipping.md", i: "Reading the delivery playbook" }) } };
      if (index === 3) return { toolCall: { name: "bash", arguments: JSON.stringify({ command, i: "Observing the test PR" }) } };
      return undefined;
    },
  });
  let session: ControlledSession | undefined;
  let forge: ForgeFixture | undefined;
  let commands: CommandEvidence[] | undefined;
  try {
    const { git, lower, commands: observations } = makeGitStack(run, false);
    commands = observations;
    const refs = git("show-ref", "--heads");
    forge = setupForge(run, { 31: mergedPr("lower", "main", lower) });
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(join(suite, "generated/skills"))}\n`);
    session = await ControlledSession.start({
      harness, runRoot: run,
      extensions: [resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts")],
      model: DOCK_MODEL_SELECTOR,
      env: { ...forge.env, [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir,
        PSTACK_FORGE_BUN: bun.replace(/\\/g, "/"), PSTACK_FORGE_WATCHER: watcher.replace(/\\/g, "/") },
      extraArgs: ["--offline"],
    });
    expect(await session.prompt("Read the local shipping playbook only; do not take any forge action.")).toMatchObject({ agentInvoked: true, status: "completed" });
    expect(capture.requests()[1]?.raw).toContain("Land only the contiguous verified run rooted at the bottom.");
    expect(await session.prompt("Explicitly run the read-only watcher for the isolated test PR #31.")).toMatchObject({ agentInvoked: true, status: "completed" });
    const shellReport = "COMPLETE: #31 merged into main";
    expect(capture.requests()[3]?.raw).toContain(shellReport);
    const results = session.frames().filter(frame => frame.type === "tool_execution_end");
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ toolName: "read", isError: false });
    expect(results[1]).toMatchObject({ toolName: "bash", isError: false,
      result: { content: [{ type: "text", text: expect.stringContaining(shellReport) }] } });
    expect(git("show", "main:lower.txt")).toBe("accepted lower change");
    expect(git("ls-tree", "main", "upper.txt")).toBe("");
    expect(git("show-ref", "--heads")).toBe(refs);
    expectReadOnlyForgeCalls(forge);
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
    } finally {
      const requests = capture.requests().map(({ raw }) => raw);
      const calls = forge && existsSync(forge.callsPath) ? readFileSync(forge.callsPath, "utf8") : null;
      capture.stop();
      run.dispose();
      const rootRemoved = !existsSync(run.path);
      recordEvidence("native-omp", { harness, command, commands, calls, argv: session?.argv, exit: session?.exited(),
        frames: session?.frames(), requests, rootRemoved });
      expect(rootRemoved).toBe(true);
    }
  }
}, 60_000);
