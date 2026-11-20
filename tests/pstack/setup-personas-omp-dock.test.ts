import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { VIEWED_CAPTURE_BASE_URL_ENV } from "../harness-dock/fixtures/viewed-session/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";
import { copyPstackPackage, runPstack } from "./setup-fixture";

const suite = resolve(import.meta.dir, "../../pstack-suite");
const provider = resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts");

// S3 / P24: a real OMP session with no suite settings must return the setup
// instructions, not a missing skill result or a fabricated delegated worker.
test("pstack setup works in OMP before any role bindings exist", async () => {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-empty-setup");
  const capture = startCaptureServer({ dir: run.captureDir });
  let session: ControlledSession | undefined;
  try {
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(join(suite, "generated/skills"))}\n`);
    session = await ControlledSession.start({
      harness, runRoot: run, extensions: [provider], model: DOCK_MODEL_SELECTOR,
      env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir },
      extraArgs: ["--offline"],
    });
    expect(await session.prompt("/skill:setup-pstack Show me the setup steps without saving.")).toMatchObject({
      agentInvoked: true, status: "completed",
    });
    expect(capture.requests()).toHaveLength(1);
    expect(capture.requests()[0]!.raw).toContain("Do not save or generate anything without explicit confirmation.");
    expect(session.frames().filter(frame => frame.type === "tool_execution_end")).toEqual([]);
    expect(existsSync(join(run.agentDir, "agents"))).toBe(false);
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
      const evidence = process.env.PSTACK_SETUP_EVIDENCE_DIR;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        writeFileSync(join(evidence, "empty-setup-omp-dock.json"), JSON.stringify({
          harness, argv: session?.argv, exit: session?.exited(), frames: session?.frames(),
          requests: capture.requests().map(({ raw }) => raw),
        }, null, 2));
      }
    } finally {
      capture.stop();
      run.dispose();
    }
  }
}, 180_000);

interface Completion {
  model: string;
  reasoning_effort?: string;
  messages: { role: string; content: unknown }[];
  tools: { function: { name: string } }[];
}

// S1/S3 / P26–P28, P31–P32. A mismatched model, stale output, or a reviewer with
// write built-ins is observable only after native task dispatch. The local
// provider scripts a task and a child tool call; OMP performs both operations.
test("pstack setup updates fresh native role resolution without affecting unrelated OMP sessions", async () => {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-role-lifecycle");
  const cwd = run.workDir;
  const launchProvider = resolve(import.meta.dir, "../harness-dock/fixtures/viewed-session/provider.ts");
  const alpha = "viewed-dock/viewed-model-a";
  const beta = "viewed-dock/viewed-model-b";
  const workerFile = join(cwd, "worker-output.txt");
  const reviewedFile = join(cwd, "owned-review.txt");
  const reviewMarker = "reviewed file uniquely contains 24d7c1";
  const taskCases = new Map<string, { agent: string; assignment: string; tool?: string; args?: object }>();
  const capture = startCaptureServer({
    dir: run.captureDir,
    respond: ({ json }) => {
      const { messages, tools } = json as Completion;
      if (!tools?.length) return undefined; // OMP may label the task via a separate tool-free request.
      const last = messages[messages.length - 1];
      if (!last || last.role !== "user") return undefined;
      const text = JSON.stringify(last.content);
      for (const [prompt, { agent, assignment, tool, args }] of taskCases) {
        if (text.includes(assignment)) {
          return tool ? { toolCall: { name: tool, arguments: JSON.stringify(args) } } : { replyText: assignment + " COMPLETE" };
        }
        const userText = Array.isArray(last.content) ? last.content[last.content.length - 1]?.text : last.content;
        if (userText === prompt) {
          return { toolCall: { name: "task", arguments: JSON.stringify({
            context: "Verify this explicit role dispatch.",
            tasks: [{ name: "Proof", agent, task: assignment, solutionSpace: "One explicit tool effect." }],
          }) } };
        }
      }
    },
  });
  const env = { HOME: run.agentDir, USERPROFILE: run.agentDir, [VIEWED_CAPTURE_BASE_URL_ENV]: capture.baseUrl };
  const processes: ControlledSession[] = [];
  const commands: unknown[] = [];
  try {
    const root = copyPstackPackage(cwd);
    const generated = join(root, "generated");
    const settings = join(root, "models.local.json");
    const roleIndex = join(generated, "roles.local.json");
    const global = join(run.agentDir, "config.yml");
    const globalBytes = `modelRoles:\n  default: ${alpha}\nasync:\n  enabled: false\n`;
    writeFileSync(global, globalBytes);
    mkdirSync(join(run.agentDir, "agents"));
    const controlPersona = join(run.agentDir, "agents", "other-suite-role.md");
    const controlBytes = "---\nname: other-suite-role\ndescription: Unrelated control role\nmodel: '@default'\n---\nAn unrelated native role.\n";
    writeFileSync(controlPersona, controlBytes);
    writeFileSync(reviewedFile, reviewMarker);
    const invoke = (command: string, ...args: string[]) => {
      const result = runPstack(cwd, { ...process.env, ...env }, command, ...args);
      commands.push(result);
      return result;
    };
    expect(invoke("build")).toMatchObject({ exit: 0 });
    expect(existsSync(settings)).toBe(false);
    expect(existsSync(roleIndex)).toBe(false);
    expect(existsSync(join(generated, "agents"))).toBe(false);

    async function start(model: string, suiteEnabled: boolean) {
      const session = await ControlledSession.start({
        harness, runRoot: run, extensions: suiteEnabled ? [launchProvider, generated] : [launchProvider],
        model, env, extraArgs: ["--offline"],
      });
      processes.push(session);
      return session;
    }
    async function dispatch(session: ControlledSession, assignment: string, agent: string, tool?: string, args?: object) {
      const offset = capture.requests().length;
      const prompt = `Dispatch explicit native task number ${taskCases.size + 1}.`;
      taskCases.set(prompt, { agent, assignment, tool, args });
      expect(await session.prompt(prompt)).toMatchObject({ agentInvoked: true, status: "completed" });
      const turn = capture.requests().slice(offset);
      const children = turn.filter(({ json }) => (json as Completion).tools?.length &&
        (json as Completion).messages.some(message => message.role === "user" && JSON.stringify(message.content).includes(assignment)));
      expect(children).toHaveLength(tool ? 2 : 1);
      const taskResults = session.frames().filter(frame => frame.type === "tool_execution_end" && frame.toolName === "task");
      const result = taskResults[taskResults.length - 1];
      expect(result).toMatchObject({ isError: false });
      return { request: children[0]!.json as Completion, raw: children[0]!.raw, continuation: children[1]?.raw };
    }
    async function checkControl(assignment: string) {
      const session = await start("@default", false);
      const result = await dispatch(session, assignment, "other-suite-role");
      expect(result.request.model).toBe("viewed-model-a");
      expect(result.raw).toContain("An unrelated native role.");
      expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
    }

    await checkControl("unrelated-baseline-native-task");
    const setup = await start(alpha, true);
    expect(await setup.prompt("/skill:setup-pstack Propose explicit bindings without saving.")).toMatchObject({ status: "completed" });
    const setupRequests = capture.requests();
    expect(setupRequests[setupRequests.length - 1]?.raw).toContain("Do not save or generate anything without explicit confirmation.");
    expect(await setup.stop()).toMatchObject({ exitCode: 0, timedOut: false });

    const catalog = join(cwd, "omp-models.json");
    const modelArgv = [harness.path, ...harness.argvPrefix, "models", "--json", "--no-extensions", "-e", launchProvider];
    const modelResult = Bun.spawnSync(modelArgv, { cwd, env: setup.env, stdout: "pipe", stderr: "pipe" });
    const catalogJson = modelResult.stdout.toString();
    commands.push({ argv: modelArgv, exit: modelResult.exitCode, stdout: catalogJson, stderr: modelResult.stderr.toString() });
    expect(modelResult.exitCode).toBe(0);
    expect(JSON.parse(catalogJson)).toMatchObject({ models: expect.arrayContaining([
      expect.objectContaining({ selector: alpha }), expect.objectContaining({ selector: beta }),
    ]) });
    writeFileSync(catalog, catalogJson);
    const proposal = join(cwd, "proposal.json");
    const reviewer = { model: "inherit-parent", thinking: "inherit" };
    function publish(model: string, thinking: string) {
      const confirmed = { "poteto-agent": { model, thinking }, "comment-sicko": reviewer };
      writeFileSync(proposal, JSON.stringify(confirmed));
      expect(invoke("setup", "--confirm", proposal, "--catalog", catalog)).toMatchObject({
        exit: 0, stdout: expect.stringContaining("Start a new pstack session"),
      });
      expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({ confirmed: true, roles: confirmed });
      expect(JSON.parse(readFileSync(roleIndex, "utf8"))).toEqual(confirmed);
      expect(readFileSync(join(generated, "agents", "comment-sicko.md"), "utf8")).toContain('model: "@default"');
      expect(readFileSync(global, "utf8")).toBe(globalBytes);
      expect(readFileSync(controlPersona, "utf8")).toBe(controlBytes);
    }
    async function checkRoles(parent: string, expectedWorker: string, thinking: string, expectedReviewer: string, marker: string) {
      const session = await start(parent, true);
      const worker = await dispatch(session, `execute-owned-worker-${marker}`, "poteto-agent", "write", {
        i: "Writing owned test result", path: workerFile, content: marker,
      });
      expect(worker.request).toMatchObject({ model: expectedWorker, reasoning_effort: thinking });
      expect(worker.raw).toContain("Read the shipped poteto-mode SKILL.md in full before any work");
      expect(readFileSync(workerFile, "utf8")).toBe(marker);
      expect(worker.request.tools.map(t => t.function.name)).toContain("write");
      const review = await dispatch(session, `inspect-owned-review-${marker}`, "comment-sicko", "read", {
        i: "Reading owned review input", path: reviewedFile,
      });
      expect(review.request.model).toBe(expectedReviewer);
      expect(review.raw).toContain("Stay read-only and report proposed deletions to the parent");
      const tools = review.request.tools.map(t => t.function.name);
      expect(tools).toContain("read");
      for (const tool of ["write", "edit", "bash"]) expect(tools).not.toContain(tool);
      expect(review.continuation).toContain(reviewMarker);
      expect(readFileSync(reviewedFile, "utf8")).toBe(reviewMarker);
      expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
    }

    publish(beta, "high");
    await checkRoles(alpha, "viewed-model-b", "high", "viewed-model-a", "first-config-result");
    publish(alpha, "medium");
    await checkRoles(beta, "viewed-model-a", "medium", "viewed-model-b", "second-config-result");
    await checkControl("unrelated-after-update-native-task");
    expect(invoke("check")).toMatchObject({ exit: 0 });
  } finally {
    try {
      for (const session of processes) if (!session.exited()) await session.stop();
      const evidence = process.env.PSTACK_SETUP_EVIDENCE_DIR;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        writeFileSync(join(evidence, "role-lifecycle-omp-dock.json"), JSON.stringify({ harness, commands,
          sessions: processes.map(session => ({ argv: session.argv, exit: session.exited(), frames: session.frames() })),
          requests: capture.requests().map(({ raw }) => raw),
        }, null, 2));
      }
    } finally {
      capture.stop();
      rmSync(run.path, { recursive: true, force: true, maxRetries: 5 });
    }
  }
}, 180_000);
