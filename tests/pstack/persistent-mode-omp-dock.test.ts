import { expect, test } from "bun:test";
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { startCaptureServer, type CaptureServerOptions, type CapturedRequest } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession, type RpcFrame } from "../harness-dock/session";
import { customEntries, customMessages, spawnedSessionFiles } from "../harness-dock/session-log";

const suite = resolve(import.meta.dir, "../../pstack-suite");
const modeSource = join(suite, "generated", "skills", "poteto-mode", "SKILL.md");
const coreRule = "First message → restate the user's goal and the smallest change that meets it, then proceed.";
const hiddenBody = "Restate in your own words what you think the user's goals are and what problem they're trying to solve.";
const modeMarker = "◈ Poteto mode";

function isMarker(frame: RpcFrame): boolean {
  return frame.type === "extension_ui_request" && frame.method === "setWidget" && frame.widgetKey === "semantic-extensions";
}

function showsMode(frame: RpcFrame | undefined): boolean {
  return Array.isArray(frame?.widgetLines) && frame.widgetLines.includes(modeMarker);
}

async function startShowsMode(session: ControlledSession): Promise<boolean> {
  return showsMode(await session.awaitFrame(isMarker, "initial mode marker"));
}

async function sessionFile(session: ControlledSession): Promise<string> {
  const { data } = await session.request({ type: "get_state" });
  const file = (data as { sessionFile?: string } | undefined)?.sessionFile;
  if (!file) throw new Error("OMP did not report a native session file");
  return file;
}

async function turn(session: ControlledSession, text: string): Promise<void> {
  expect(await session.prompt(text)).toMatchObject({ agentInvoked: true, status: "completed" });
}

async function stop(session: ControlledSession): Promise<void> {
  expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
}

function journalState(session: ControlledSession, file: string) {
  const log = session.sessionLog(file);
  expect(log.unparsed).toEqual([]);
  return {
    values: customEntries(log.entries, "poteto-mode:state").map(entry => entry.data),
    contributions: [
      ...customMessages(log.entries, "poteto-mode:engineering"),
      ...customMessages(log.entries, "poteto-mode:reminder"),
    ],
  };
}

function gitOverrides(root: string): Record<string, string | undefined> {
  const overrides: Record<string, string | undefined> = {};
  for (const name of Object.keys(process.env)) if (/^GIT_/i.test(name)) overrides[name] = undefined;
  overrides.GIT_CONFIG_NOSYSTEM = "1";
  overrides.GIT_CONFIG_GLOBAL = join(root, ".unused-git-config");
  return overrides;
}

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd, env: { ...process.env, ...gitOverrides(cwd) },
  });
  if (result.exitCode !== 0) throw new Error(`Owned git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
}

function ownRepo(cwd: string): void {
  git(cwd, "init", "--quiet", "--template=");
  git(cwd, "-c", "user.name=Pstack Dock", "-c", "user.email=pstack-dock@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "Owned test baseline");
}

function repoEffects(cwd: string) {
  return {
    head: git(cwd, "rev-parse", "HEAD"),
    refs: git(cwd, "show-ref"),
    status: git(cwd, "status", "--porcelain=v1", "--untracked-files=all"),
    remotes: git(cwd, "remote", "-v"),
  };
}

async function nativeRun(label: string, respond?: CaptureServerOptions["respond"]) {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot(`pstack-${label}`);
  const capture = startCaptureServer({ dir: run.captureDir, respond });
  const sessions: ControlledSession[] = [];
  const evidenceRoot = process.env.PSTACK_MODE_EVIDENCE_DIR;
  const evidence = evidenceRoot && join(evidenceRoot, label);
  if (evidence) mkdirSync(evidence, { recursive: true });
  writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(join(suite, "generated", "skills"))}\n`);
  return {
    run, capture,
    async open(args: readonly string[] = []) {
      const session = await ControlledSession.start({
        harness, runRoot: run,
        extensions: [resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts"), join(suite, "omp.ts")],
        model: DOCK_MODEL_SELECTOR,
        env: {
          ...gitOverrides(run.path),
          [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl,
          HOME: run.agentDir,
          USERPROFILE: run.agentDir,
          PI_CONFIG_DIR: undefined,
        },
        extraArgs: ["--offline", ...args],
      });
      sessions.push(session);
      return session;
    },
    snapshot(label: string, value: unknown) {
      if (evidence) writeFileSync(join(evidence, `${label}.json`), JSON.stringify(value, null, 2));
    },
    journal(label: string, file: string) {
      if (evidence) copyFileSync(file, join(evidence, `${label}.jsonl`));
    },
    async close() {
      try {
        for (const session of sessions) if (!session.exited()) await session.stop();
        if (evidence) {
          const logs = join(run.agentDir, ".omp", "logs");
          if (existsSync(logs)) cpSync(logs, join(evidence, "native-logs"), { recursive: true });
          writeFileSync(join(evidence, "rpc.json"), JSON.stringify({
            harness, sessions: sessions.map(session => ({ argv: session.argv, exit: session.exited(), frames: session.frames() })),
            requests: capture.requests().map(({ raw }) => raw),
          }, null, 2));
          const mains = sessions[0]?.sessionFiles() ?? [];
          for (const [index, file] of mains.entries()) {
            copyFileSync(file, join(evidence, `session-${index + 1}.jsonl`));
            for (const [childIndex, child] of spawnedSessionFiles(file).entries()) {
              copyFileSync(child, join(evidence, `session-${index + 1}-child-${childIndex + 1}.jsonl`));
            }
          }
        }
      } finally {
        capture.stop();
        run.dispose();
      }
    },
  };
}

// S3 / P15: the approved initial state must affect the first actual provider
// request, not a later turn. A missing or late activation drops the core rule.
test("Pstack native mode / P15: a fresh pstack session contributes engineering guidance on its first request", async () => {
  const dock = await nativeRun("first-request");
  try {
    const session = await dock.open();
    expect(await session.prompt("First ordinary pstack turn.")).toMatchObject({ agentInvoked: true, status: "completed" });
    const requests = dock.capture.requests();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.raw).toContain(coreRule);
    expect(requests[0]!.raw.replace(/\\\\/g, "/")).toContain(modeSource.replace(/\\/g, "/"));
    expect(requests[0]!.raw).not.toContain(hiddenBody);
    expect(await startShowsMode(session)).toBe(true);
    await stop(session);
  } finally {
    await dock.close();
  }
}, 180_000);

// S3 / P16, P17, P40: losing either saved value or purging old guidance
// would change the on/off request and journal counts. The slash command itself
// must produce local feedback and no model request, tool call or repo changes.
test("Pstack native mode / P16/P17/P40: only new contributions stop when toggled off, and both values survive process exit", async () => {
  const dock = await nativeRun("toggle-and-restore");
  const cwd = dock.run.workDir;
  const stateValue = (enabled: boolean) => ({ enabled });
  const guidanceCounts = () => dock.capture.requests().map(({ raw }) => [
    raw.split(coreRule).length - 1,
    raw.split("Poteto mode remains active.").length - 1,
  ]);
  const toggle = async (session: ControlledSession, enabled: boolean) => {
    const before = repoEffects(cwd);
    const requestCount = dock.capture.requests().length;
    const frameCount = session.frames().length;
    expect(await session.prompt("/poteto-mode")).toMatchObject({ agentInvoked: false, status: "completed" });
    const commandFrames = session.frames().slice(frameCount);
    expect(commandFrames.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify").map(frame => frame.message))
      .toEqual([`Poteto mode ${enabled ? "enabled" : "disabled"}`]);
    const marker = commandFrames.filter(isMarker).pop();
    expect(marker).toBeDefined();
    expect(showsMode(marker)).toBe(enabled);
    expect(commandFrames.filter(frame => frame.type === "tool_execution_start" || frame.type === "tool_execution_end")).toEqual([]);
    expect(dock.capture.requests()).toHaveLength(requestCount);
    const after = repoEffects(cwd);
    dock.snapshot(`effects-${requestCount}`, { before, after, commandFrames });
    expect(after).toEqual(before);
  };
  try {
    ownRepo(cwd);
    const initial = await dock.open();
    await turn(initial, "An enabled pstack round.");
    const file = await sessionFile(initial);
    const first = journalState(initial, file);
    expect(first.values).toEqual([{ enabled: true }]);
    expect(first.contributions).toHaveLength(1);

    await toggle(initial, false);
    await turn(initial, "The first disabled round.");
    const disabled = journalState(initial, file);
    expect(disabled.values).toEqual([true, false].map(stateValue));
    expect(disabled.contributions).toEqual(first.contributions);
    expect(guidanceCounts()).toEqual([[1, 0], [1, 0]]);
    const offRequest = dock.capture.requests()[1]!.raw;
    expect(offRequest).toContain("An enabled pstack round.");
    expect(offRequest).toContain("The first disabled round.");
    dock.journal("after-first-off", file);

    await toggle(initial, true);
    await turn(initial, "An explicitly re-enabled round.");
    await stop(initial);
    const beforeOn = journalState(initial, file);
    expect(beforeOn.values).toEqual([true, false, true].map(stateValue));
    expect(beforeOn.contributions).toHaveLength(2);
    expect(guidanceCounts()).toEqual([[1, 0], [1, 0], [1, 1]]);
    dock.journal("before-on-resume", file);

    const on = await dock.open(["--resume", file]);
    expect(await sessionFile(on)).toBe(file);
    expect(await startShowsMode(on)).toBe(true);
    await turn(on, "The first request after restoring enabled.");
    const afterOn = journalState(on, file);
    expect(afterOn.values).toEqual(beforeOn.values);
    expect(afterOn.contributions).toHaveLength(3);
    expect(afterOn.contributions.slice(0, 2)).toEqual(beforeOn.contributions);
    expect(guidanceCounts()).toEqual([[1, 0], [1, 0], [1, 1], [1, 2]]);
    dock.journal("after-on-resume", file);

    await toggle(on, false);
    await stop(on);
    const beforeOff = journalState(on, file);
    expect(beforeOff.values).toEqual([true, false, true, false].map(stateValue));
    dock.journal("before-off-resume", file);

    const off = await dock.open(["--resume", file]);
    expect(await sessionFile(off)).toBe(file);
    expect(await startShowsMode(off)).toBe(false);
    await turn(off, "The first request after restoring disabled.");
    await stop(off);
    expect(journalState(off, file)).toEqual(beforeOff);
    expect(guidanceCounts()).toEqual([[1, 0], [1, 0], [1, 1], [1, 2], [1, 2]]);
    dock.journal("after-off-resume", file);
  } finally {
    await dock.close();
  }
}, 180_000);

// S3 / P18, P21: use the slash skill with the same name as the mode, not
// another command. Conflating the two would write enabled or add a contribution
// on this or the next turn. A visible control distinguishes hiding from a
// missing/default-disabled skill catalog.
test("Pstack native mode / P18/P21: a hidden skill is omitted from the model catalog but its manual command does not enable the mode", async () => {
  const dock = await nativeRun("one-shot-skill");
  try {
    const visible = join(dock.run.agentDir, "skills", "pstack-visible-control");
    mkdirSync(visible, { recursive: true });
    writeFileSync(join(visible, "SKILL.md"), "---\nname: pstack-visible-control\ndescription: Visible catalog control for the dock.\n---\n\nOnly read when asked.\n");
    const session = await dock.open();
    expect(await startShowsMode(session)).toBe(true);
    expect(await session.prompt("/poteto-mode")).toMatchObject({ agentInvoked: false, status: "completed" });
    await turn(session, "Ordinary pstack turn while disabled.");
    const file = await sessionFile(session);
    const prior = journalState(session, file);
    expect(prior).toEqual({ values: [{ enabled: true }, { enabled: false }], contributions: [] });
    const body = dock.capture.requests()[0]!.raw;
    expect(body).toContain("pstack-visible-control");
    expect(body).not.toContain("poteto-mode");
    expect(body).not.toContain(coreRule);

    const commands = (await session.request({ type: "get_available_commands" })).data as { commands: { name: string; source: string }[] };
    expect(commands.commands.filter(command => command.name.replace(/^\//, "") === "skill:poteto-mode").map(command => command.source)).toEqual(["skill"]);
    await turn(session, "/skill:poteto-mode One-shot pstack mode instructions only.");
    const invoked = dock.capture.requests()[1]!.raw;
    expect(invoked).toContain("One-shot pstack mode instructions only.");
    expect(invoked).toContain(coreRule);
    expect(invoked).toContain('User invoked the \\"poteto-mode\\" skill');
    expect(journalState(session, file)).toEqual(prior);

    await turn(session, "Ordinary follow-up after the one-shot command.");
    expect(journalState(session, file)).toEqual(prior);
    expect(showsMode(session.frames().filter(isMarker).pop())).toBe(false);
    await stop(session);
    dock.journal("before-resume", file);

    const resumed = await dock.open(["--resume", file]);
    expect(await sessionFile(resumed)).toBe(file);
    expect(await startShowsMode(resumed)).toBe(false);
    await turn(resumed, "First ordinary turn after one-shot recovery.");
    await stop(resumed);
    expect(journalState(resumed, file)).toEqual(prior);
    expect(dock.capture.requests().map(({ raw }) => raw.split(coreRule).length - 1)).toEqual([0, 1, 1, 1]);
    dock.journal("after-resume", file);
  } finally {
    await dock.close();
  }
}, 180_000);

function messages(request: CapturedRequest): { role: string; text: string }[] {
  const body = request.json;
  if (!body || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) {
    throw new Error(`Request ${request.index} does not carry OpenAI chat messages`);
  }
  return body.messages.map((message: unknown) => {
    if (!message || typeof message !== "object" || !("role" in message) || typeof message.role !== "string") {
      throw new Error(`Invalid chat message in request ${request.index}`);
    }
    const content = "content" in message && message.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((part: unknown) =>
      part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "").join("") : "";
    return { role: message.role, text };
  });
}

// S3 / P20, P21: wrong roots would surface either a relative decoy or an
// unavailable skill. The child starts in a native isolated cwd, with only the
// explicit assignment and resource pointers; the fixture supplies no tool results.
test("Pstack native mode / P20/P21: installed OMP resolves a hidden skill and its file from a spaced source in distinct native cwds", async () => {
  const mainInput = "Pstack parent reads only";
  const dispatchInput = "Dispatch the pstack reader child";
  const childInput = "Pstack child reads only";
  const workerRule = "You work for the operator, not the agent that wrote the kickoff.";
  const decoy = "Wrong file: cwd is not the generated worker's source base.";
  const uri = "skill://poteto-mode";
  const stages = new Map<string, number>();
  const observed = new Map<string, { cwd: string; requests: CapturedRequest[] }>();
  let sourceDir = "";
  const dock = await nativeRun("parent-child-read", request => {
    const text = messages(request).filter(message => message.role === "user").map(message => message.text).join("\n");
    const actor = text.includes(childInput) ? childInput : text.includes(dispatchInput) ? dispatchInput : text.includes(mainInput) ? mainInput : undefined;
    if (!actor) return;
    const previous = observed.get(actor);
    const cwd = /current working directory: '([^']+)'/.exec(text)?.[1];
    // The host may also submit the assignment to its title model. That is not a reader session.
    if (actor !== dispatchInput && !previous && !cwd) return { replyText: "<title>Read pstack resources</title>" };
    const stage = stages.get(actor) ?? 0;
    stages.set(actor, stage + 1);
    if (actor === dispatchInput) {
      if (stage !== 0) return;
      return { toolCall: { name: "task", arguments: JSON.stringify({
        context: "Only read the supplied resources; do not make changes.",
        tasks: [{ name: "PstackReader", task: `${childInput}: read ${uri}, then read worker.md relative to this known skill source: ${sourceDir}.`, solutionSpace: "Read only two supplied resources", isolated: true }],
      }) } };
    }
    if (previous) previous.requests.push(request);
    else if (cwd) observed.set(actor, { cwd, requests: [request] });
    if (stage === 0) return { toolCall: { name: "read", arguments: JSON.stringify({ path: uri, i: "Reading hidden pstack skill" }) } };
    if (stage === 1 && previous) return { toolCall: { name: "read", arguments: JSON.stringify({
      path: relative(previous.cwd, join(sourceDir, "worker.md")).replace(/\\/g, "/"), i: "Reading relative worker file",
    }) } };
  });
  try {
    ownRepo(dock.run.workDir);
    const spacedSkills = join(dock.run.path, "Generated Skills With Spaces");
    sourceDir = join(spacedSkills, "poteto-mode");
    cpSync(join(suite, "generated", "skills", "poteto-mode"), sourceDir, { recursive: true });
    writeFileSync(join(dock.run.workDir, "worker.md"), decoy);
    writeFileSync(join(dock.run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(spacedSkills)}\nasync:\n  enabled: false\ntask:\n  isolation:\n    enabled: true\n    apply: false\nisolation:\n  backend: rcopy\n`);
    const session = await dock.open();
    expect(await session.prompt("/poteto-mode")).toMatchObject({ agentInvoked: false, status: "completed" });
    await turn(session, `${mainInput}: read ${uri}, then read worker.md relative to this known skill source: ${sourceDir}.`);
    await turn(session, dispatchInput);
    const file = await sessionFile(session);
    await stop(session);

    const main = observed.get(mainInput);
    const child = observed.get(childInput);
    if (!main || !child) throw new Error(`Could not identify both native read sessions: ${[...observed.keys()].join(", ")}`);
    const reports = spawnedSessionFiles(file);
    expect(reports).toHaveLength(1);
    const childLog = session.sessionLog(reports[0]);
    const childCwd = childLog.entries.find(entry => entry.type === "session")?.cwd;
    expect(typeof childCwd).toBe("string");
    expect(resolve(child.cwd)).toBe(resolve(String(childCwd)));
    expect(resolve(main.cwd)).toBe(resolve(dock.run.workDir));
    expect(resolve(child.cwd)).not.toBe(resolve(main.cwd));
    for (const read of [main, child]) {
      expect(read.requests).toHaveLength(3);
      const toolText = (index: number) => messages(read.requests[index]!).filter(message => message.role === "tool").map(message => message.text).pop();
      expect(read.requests[0]!.raw).not.toContain(coreRule);
      expect(read.requests[0]!.raw).not.toContain(workerRule);
      const skill = toolText(1);
      const worker = toolText(2);
      expect(skill).toContain(coreRule);
      expect(skill?.replace(/\\/g, "/")).toStartWith(`[Skill file: ${join(sourceDir, "SKILL.md").replace(/\\/g, "/")}]`);
      expect(worker).toContain(workerRule);
      expect(worker?.replace(/\\/g, "/")).toStartWith(`[${join(sourceDir, "worker.md").replace(/\\/g, "/")}#`);
      expect(worker).not.toContain(decoy);
    }
    dock.snapshot("source-and-cwds", { sourceDir, parent: main.cwd, child: child.cwd, childJournal: reports[0] });
  } finally {
    await dock.close();
  }
}, 180_000);
