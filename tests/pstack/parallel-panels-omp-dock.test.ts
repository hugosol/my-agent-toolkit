import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { VIEWED_CAPTURE_BASE_URL_ENV } from "../harness-dock/fixtures/viewed-session/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession, type RpcFrame } from "../harness-dock/session";
import { copyPstackPackage, runPstack, type CommandEvidence } from "./setup-fixture";

const provider = resolve(import.meta.dir, "../harness-dock/fixtures/viewed-session/provider.ts");
const alpha = "viewed-dock/viewed-model-a";
const beta = "viewed-dock/viewed-model-b";
const core = {
  "poteto-agent": { model: "inherit-parent", thinking: "inherit" },
  "comment-sicko": { model: "inherit-parent", thinking: "inherit" },
};
const tool = (name: string, args: object) => ({ toolCall: { name, arguments: JSON.stringify(args) } });

interface Completion {
  model: string;
  reasoning_effort?: string;
  messages: { role: string; content: unknown }[];
  tools?: { function: { name: string } }[];
}

function last<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((block: unknown) => block && typeof block === "object" && "text" in block
    && typeof block.text === "string" ? [block.text] : []).join("\n");
}

function lastUser({ messages }: Completion): string {
  const content = last(messages.filter(message => message.role === "user"))?.content;
  return contentText(Array.isArray(content) ? [last(content)] : content);
}

function lastTool({ messages }: Completion): string {
  return contentText(last(messages.filter(message => message.role === "tool"))?.content);
}

interface TaskRow {
  id: string;
  agent: string;
  output: string;
  exitCode: number;
  isolated?: boolean;
  patchPath?: string;
}

function taskRows(frame: RpcFrame): TaskRow[] {
  const { result } = frame;
  if (!result || typeof result !== "object" || !("details" in result)) throw new Error("No task result details");
  const { details } = result;
  if (!details || typeof details !== "object" || !("results" in details) || !Array.isArray(details.results)) {
    throw new Error("No native task result rows");
  }
  return details.results;
}

function evidenceFile(label: string, data: object): void {
  const dir = process.env.PSTACK_PANEL_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${label}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

// S1/S3: two confirmed seats must be independently callable, then produce two
// incompatible versions of the *same* relative file in one batched native task.
// Separate task IDs, absolute write destinations, or serial dispatch can't prove
// isolation: the controlled provider waits for both real writes before requesting
// either child readback, and the parent independently replays each native patch.
test("P23 P29 native task runs confirmed panel seats individually and in parallel isolated worktrees", async () => {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-panel-isolation");
  const cwd = run.workDir;
  const root = join(run.path, "suite package");
  const roster = join(root, "pstack-suite/generated/roles.local.json");
  const artifact = "answer.txt";
  const red = { agent: "arena-runner-red", model: alpha, thinking: "low", bytes: "red candidate: 845bf7\n" };
  const blue = { agent: "arena-runner-blue", model: beta, thinking: "high", bytes: "blue candidate: 34c18a\n" };
  const bindings = { ...core,
    [red.agent]: { model: alpha, thinking: "low" },
    [blue.agent]: { model: beta, thinking: "high" },
  };
  const batches = new Map([
    ["Dispatch only the red seat.", [{ seat: red, name: "SoloRed" }]],
    ["Dispatch only the blue seat.", [{ seat: blue, name: "SoloBlue" }]],
    ["Dispatch both confirmed seats concurrently.", [{ seat: red, name: "BatchRed" }, { seat: blue, name: "BatchBlue" }]],
  ]);
  const assignments = [...batches.values()].flat();
  const batchWrites = new Set<string>();
  const batchReady = Promise.withResolvers<void>();
  const readbacks: Record<string, string> = {};
  const commands: CommandEvidence[] = [];
  const capture = startCaptureServer({
    dir: run.captureDir,
    async respond({ json }) {
      const request = json as Completion;
      if (!request.tools?.length) return;
      const user = lastUser(request);
      const lastRole = last(request.messages)?.role;
      if (user === "Read the confirmed panel roster." && lastRole === "user") {
        return tool("read", { i: "Reading confirmed panel roster", path: roster });
      }
      const batch = batches.get(user);
      if (batch && lastRole === "user") {
        return tool("task", { context: "Exercise confirmed panel seats with isolated files.", tasks: batch.map(({ seat, name }) => ({
          agent: seat.agent, name, isolated: true, solutionSpace: "Use the specified literal file content.",
          task: `Owned proof ${name}: use ${join(root, "pstack-suite/generated/skills/poteto-mode/SKILL.md")}. Write ${artifact} in your worktree, independently read it, and report its result.`,
        })) });
      }
      const assignment = assignments.find(({ name }) => user.includes(`Owned proof ${name}:`));
      if (!assignment) return;
      const { seat, name } = assignment;
      const phase = request.messages.filter(message => message.role === "tool").length;
      if (phase === 0) return tool("write", { i: "Writing isolated candidate", path: artifact, content: seat.bytes });
      if (phase === 1) {
        if (name.startsWith("Batch")) {
          batchWrites.add(name);
          if (batchWrites.size === 2) batchReady.resolve();
          await batchReady.promise;
        }
        return tool("read", { i: "Reading isolated candidate", path: artifact });
      }
      if (phase === 2) return { replyText: `Result ${name}: ${seat.bytes.trimEnd()}` };
    },
  });
  const gitConfig = join(run.path, "gitconfig");
  const env = { HOME: run.agentDir, USERPROFILE: run.agentDir, [VIEWED_CAPTURE_BASE_URL_ENV]: capture.baseUrl,
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: gitConfig };
  let session: ControlledSession | undefined;
  const git = (from: string, ...args: string[]) => {
    const argv = ["git", ...args];
    const result = Bun.spawnSync(argv, { cwd: from, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
    const observed = { argv, exit: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
    commands.push(observed);
    expect(observed).toMatchObject({ exit: 0 });
    return observed.stdout.trim();
  };
  try {
    mkdirSync(root);
    const suite = copyPstackPackage(root);
    const proposal = join(root, "proposal.json");
    const catalog = join(root, "model-catalog.json");
    const invoke = (name: string, ...args: string[]) => {
      const result = runPstack(root, { ...process.env, ...env }, name, ...args);
      commands.push(result);
      return result;
    };
    writeFileSync(catalog, JSON.stringify({ models: [
      { selector: alpha, kind: "chat", thinking: ["low"] },
      { selector: beta, kind: "chat", thinking: ["high"] },
    ] }));
    expect(invoke("build")).toMatchObject({ exit: 0 });
    writeFileSync(proposal, JSON.stringify(bindings));
    expect(invoke("setup", "--confirm", proposal, "--catalog", catalog)).toMatchObject({ exit: 0 });
    expect(JSON.parse(readFileSync(roster, "utf8"))).toEqual(bindings);
    writeFileSync(proposal, JSON.stringify({ ...bindings, [red.agent]: { model: [alpha, beta], thinking: "low" } }));
    expect(invoke("setup", "--confirm", proposal, "--catalog", catalog)).toMatchObject({
      exit: 2, stderr: expect.stringContaining(`${red.agent}: choose an exact provider/model selector or inherit-parent`),
    });
    expect(JSON.parse(readFileSync(roster, "utf8"))).toEqual(bindings);

    writeFileSync(gitConfig, "[core]\n\tautocrlf = false\n");
    git(cwd, "init", "-q");
    git(cwd, "-c", "user.name=Panel Test", "-c", "user.email=panel@example.invalid", "commit", "-q", "--allow-empty", "-m", "Owned baseline");
    const baseline = git(cwd, "rev-parse", "HEAD");
    writeFileSync(join(run.agentDir, "config.yml"), "async:\n  enabled: false\ntask:\n  batch: true\n  isolation:\n    enabled: true\n    apply: false\n    merge: patch\nisolation:\n  backend: rcopy\n");
    session = await ControlledSession.start({ harness, runRoot: run, extensions: [provider, join(suite, "generated")],
      model: alpha, env, extraArgs: ["--offline"] });
    expect(await session.prompt("Read the confirmed panel roster.")).toMatchObject({ status: "completed" });
    const rosterContinuation = last(capture.requests())?.json as Completion;
    const rosterContent = lastTool(rosterContinuation);
    expect(rosterContent).toContain(red.agent);
    expect(rosterContent).toContain(blue.agent);

    for (const [prompt, batch] of batches) {
      const offset = capture.requests().length;
      const before = session.frames().length;
      expect(await session.prompt(prompt)).toMatchObject({ agentInvoked: true, status: "completed" });
      const frames = session.frames().slice(before).filter(frame => frame.type === "tool_execution_end" && frame.toolName === "task");
      expect(frames).toHaveLength(1);
      expect(frames[0]).toMatchObject({ isError: false });
      const rows = taskRows(frames[0]!);
      expect(rows).toHaveLength(batch.length);
      for (const { seat, name } of batch) {
        const childRequests = capture.requests().slice(offset).filter(({ json }) => {
          const request = json as Completion;
          return request.tools?.length && lastUser(request).includes(`Owned proof ${name}:`);
        }).map(({ json }) => json as Completion);
        expect(childRequests).toHaveLength(3);
        for (const request of childRequests) {
          expect(request).toMatchObject({ model: seat.model.split("/")[1], reasoning_effort: seat.thinking });
        }
        expect(lastTool(childRequests[2]!)).toContain(seat.bytes.trimEnd());
        expect(childRequests[0]!.messages.some(message => message.role === "system"
          && contentText(message.content).includes("Read the shipped poteto-mode SKILL.md in full before any work"))).toBe(true);
        const result = rows.find(row => row.id === name);
        expect(result).toMatchObject({ agent: seat.agent, isolated: true, exitCode: 0 });
        expect(result?.output).toContain(`Result ${name}: ${seat.bytes.trimEnd()}`);
        const patch = result?.patchPath;
        if (!patch) throw new Error(`No native patch was retained for ${name}`);
        const replay = join(run.path, `replay-${name}`);
        git(cwd, "clone", "-q", "--local", cwd, replay);
        git(replay, "apply", patch);
        readbacks[name] = readFileSync(join(replay, artifact), "utf8");
        expect(readbacks[name]).toBe(seat.bytes);
      }
      expect(existsSync(join(cwd, artifact))).toBe(false);
      expect(git(cwd, "status", "--porcelain")).toBe("");
      expect(git(cwd, "rev-parse", "HEAD")).toBe(baseline);
    }
    expect([...batchWrites].sort()).toEqual(["BatchBlue", "BatchRed"]);
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    batchReady.resolve();
    try {
      if (session && !session.exited()) await session.stop();
      evidenceFile("native-panel-isolation", { harness, commands, readbacks, batchWrites: [...batchWrites],
        argv: session?.argv, exit: session?.exited(), frames: session?.frames(), requests: capture.requests().map(({ raw }) => raw) });
    } finally {
      capture.stop();
      rmSync(run.path, { recursive: true, force: true, maxRetries: 5 });
    }
  }
}, 180_000);

// S3: an unavailable configured model can fall back at dispatch, and an
// operator may override an available one. The dispatched model requests and
// native task rows are independent of what the workflow actually sees next.
test("P30 native task exposes unavailable-model fallback and operator override to the workflow", async () => {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-panel-deviations");
  const alternateProvider = resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts");
  const retired = "viewed-dock/retired-model";
  const prompt = "Dispatch the two explicitly chosen judge seats.";
  const seats = [
    { name: "Retired", agent: "arena-judge-missing", model: retired, actual: alpha, selector: retired, provider: "viewed-dock" },
    { name: "Overridden", agent: "arena-judge-openai", model: beta, actual: DOCK_MODEL_SELECTOR, selector: DOCK_MODEL_SELECTOR, provider: "dock-gateway" },
  ];
  const commands: CommandEvidence[] = [];
  const capture = startCaptureServer({ dir: run.captureDir, respond({ json }) {
    const request = json as Completion;
    if (!request.tools?.length) return;
    const user = lastUser(request);
    if (user === prompt && last(request.messages)?.role === "user") {
      return tool("task", { context: "Verify evidence of actual judge identity.", tasks: seats.map(({ name, agent }) => ({
        agent, name, solutionSpace: "Return the requested literal, without claiming any model identity.",
        task: `Owned judge proof ${name}: report only the literal result.`,
      })) });
    }
    const seat = seats.find(({ name }) => user.includes(`Owned judge proof ${name}:`));
    if (seat) return { replyText: `Judge result ${seat.name}` };
  } });
  const env = { HOME: run.agentDir, USERPROFILE: run.agentDir, [VIEWED_CAPTURE_BASE_URL_ENV]: capture.baseUrl,
    [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl };
  let session: ControlledSession | undefined;
  try {
    const suite = copyPstackPackage(run.workDir);
    const proposal = join(run.workDir, "proposal.json");
    const historicalCatalog = join(run.workDir, "prior-model-catalog.json");
    writeFileSync(proposal, JSON.stringify({ ...core, ...Object.fromEntries(seats.map(({ agent, model }) => [agent, { model, thinking: "default" }])) }));
    writeFileSync(historicalCatalog, JSON.stringify({ models: [retired, beta].map(selector => ({ selector, kind: "chat" })) }));
    // The roster was confirmed before one model disappeared. Neither files
    // nor per-call model arguments are patched to force a native outcome.
    const invoke = (name: string, ...args: string[]) => {
      const result = runPstack(run.workDir, { ...process.env, ...env }, name, ...args);
      commands.push(result);
      return result;
    };
    expect(invoke("build")).toMatchObject({ exit: 0 });
    expect(invoke("setup", "--confirm", proposal, "--catalog", historicalCatalog)).toMatchObject({ exit: 0 });
    writeFileSync(join(run.agentDir, "config.yml"), `async:\n  enabled: true\ntask:\n  batch: true\n  agentModelOverrides:\n    arena-judge-openai: ${DOCK_MODEL_SELECTOR}\n`);
    const extensions = [provider, alternateProvider, join(suite, "generated")];
    session = await ControlledSession.start({ harness, runRoot: run, extensions, model: alpha, env });
    const argv = [harness.path, ...harness.argvPrefix, "models", "--json", "--no-extensions", ...extensions.flatMap(path => ["-e", path])];
    const catalog = Bun.spawnSync(argv, { cwd: run.workDir, env: session.env, stdout: "pipe", stderr: "pipe" });
    const observedCatalog = { argv, exit: catalog.exitCode, stdout: catalog.stdout.toString(), stderr: catalog.stderr.toString() };
    commands.push(observedCatalog);
    expect(observedCatalog.exit).toBe(0);
    const { models } = JSON.parse(observedCatalog.stdout);
    const available = models.map((model: { selector: string }) => model.selector);
    for (const model of [alpha, beta, DOCK_MODEL_SELECTOR]) expect(available).toContain(model);
    expect(available).not.toContain(retired);

    expect(await session.prompt(prompt)).toMatchObject({ agentInvoked: true, status: "completed" });
    const frame = session.frames().find(frame => frame.type === "tool_execution_end" && frame.toolName === "task");
    if (!frame) throw new Error("Native task did not execute");
    const rows = taskRows(frame);
    expect(rows).toHaveLength(seats.length);
    const requests = capture.requests().map(({ json }) => json as Completion);
    for (const { agent, name, actual, selector } of seats) {
      expect(rows.find(row => row.id === name)).toMatchObject({ agent, exitCode: 0, output: `Judge result ${name}`,
        resolvedModelIdentity: actual, modelOverride: [selector] });
      const calls = requests.filter(request => request.tools?.length && lastUser(request).includes(`Owned judge proof ${name}:`));
      expect(calls.map(request => request.model)).toEqual([actual.split("/")[1]]);
    }
    const continuation = last(requests.filter(request => lastUser(request) === prompt));
    const factPrefix = "pstack task facts: ";
    const factsLine = continuation && lastTool(continuation).split("\n").find(line => line.startsWith(factPrefix));
    if (!factsLine) throw new Error("Native task had resolved identities, but the workflow did not receive pstack task facts");
    expect(JSON.parse(factsLine.slice(factPrefix.length))).toMatchObject(seats.map(({ agent, name, model, actual, selector, provider }) => ({
      id: name, agent, configuredModel: model, nativeSelectors: [selector], actualModel: actual, provider,
      deviations: model === selector ? ["resolved-model-differs"] : ["effective-selector-differs", "resolved-model-differs"],
    })));
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
      evidenceFile("native-panel-model-deviations", { harness, commands, argv: session?.argv, exit: session?.exited(),
        frames: session?.frames(), requests: capture.requests().map(({ raw }) => raw) });
    } finally {
      capture.stop();
      rmSync(run.path, { recursive: true, force: true, maxRetries: 5 });
    }
  }
}, 180_000);
