import { expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRunRoot } from "../harness-dock/run-root";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { ControlledSession } from "../harness-dock/session";

const skills = resolve(import.meta.dir, "../../pstack-suite/generated/skills");
const onWindows = process.platform === "win32" ? test : test.skip;

function readExample(body: string, fence: string): string {
  const text = body.match(new RegExp(`^\x60\x60\x60${fence}\\r?\\n([\\s\\S]*?)^\x60\x60\x60\\r?$`, "m"))?.[1];
  if (!text) throw new Error(`Missing executable skill example: ${fence}`);
  return text;
}

function keepEvidence(name: string, evidence: unknown) {
  const dir = process.env.PSTACK_EXTERNAL_DRIVERS_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(evidence, null, 2));
}

const cliFixture = `
import { createInterface } from "node:readline/promises";
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("A terminal is required");
const input = createInterface({ input: process.stdin, output: process.stdout });
try {
  const answer = await input.question("Inventory command> ");
  if (answer !== "stock R7") throw new Error("Unexpected inventory input: " + answer);
  console.log("Inventory R7: 23 available");
} finally { input.close(); }
`;

// S3 / P36: a pipe or a transcript that only echoes the keys cannot satisfy
// the owned CLI's TTY check and independent inventory response.
onWindows("external drivers: P36 control-cli delivers typed input to a real Windows terminal", () => {
  const run = createRunRoot("pstack-control-cli");
  const evidence: Record<string, unknown> = { root: run.path };
  try {
    const body = readFileSync(join(skills, "control-cli/SKILL.md"), "utf8");
    const driver = join(run.workDir, "terminal.mjs");
    const target = join(run.workDir, "inventory.mjs");
    writeFileSync(driver, readExample(body, "javascript pstack-terminal"));
    writeFileSync(target, cliFixture);
    const argv = [process.execPath, driver, "Inventory command>", "stock R7", process.execPath, target];
    const result = Bun.spawnSync(argv, { cwd: run.workDir, timeout: 25_000 });
    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();
    Object.assign(evidence, { argv, stdout, stderr, exit: result.exitCode, signal: result.signalCode });
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Inventory command>");
    expect(stdout).toContain("Inventory R7: 23 available");
    expect(stderr).toMatch(/terminal pid=\d+ exit=0/);

    const noPromptArgs = [process.execPath, driver, "Inventory command>", "stock R7", process.execPath, "-e", 'console.log("No interactive prompt")'];
    const noPrompt = Bun.spawnSync(noPromptArgs, { cwd: run.workDir, timeout: 25_000 });
    const noPromptStdout = noPrompt.stdout.toString();
    const noPromptStderr = noPrompt.stderr.toString();
    evidence.noPrompt = { argv: noPromptArgs, stdout: noPromptStdout, stderr: noPromptStderr, exit: noPrompt.exitCode };
    expect(noPrompt.exitCode).toBe(1);
    expect(noPromptStdout).toContain("No interactive prompt");
    expect(noPromptStdout).not.toContain("stock R7");
    expect(noPromptStderr).toContain("Terminal exited before readiness: Inventory command>");
  } finally {
    run.dispose();
    keepEvidence("windows-terminal", { ...evidence, rootRemoved: !existsSync(run.path) });
  }
});

async function until<T>(observe: () => T | undefined, failure: string): Promise<T> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = observe();
    if (value !== undefined) return value;
    await Bun.sleep(50);
  }
  throw new Error(failure);
}

interface BrowserControl {
  send<T>(method: string): Promise<T>;
  close(): void;
}

function browserControl(url: string): BrowserControl {
  const ws = new WebSocket(url);
  let nextId = 0;
  const opened = Promise.withResolvers<void>();
  ws.addEventListener("open", () => opened.resolve(), { once: true });
  ws.addEventListener("error", () => opened.reject(new Error(`Cannot connect to ${url}`)), { once: true });
  const connectDeadline = setTimeout(() => opened.reject(new Error(`No CDP connection to ${url}`)), 5_000);
  const connected = opened.promise.finally(() => clearTimeout(connectDeadline));
  return {
    async send<T>(method: string): Promise<T> {
      await connected;
      const id = ++nextId;
      const reply = Promise.withResolvers<T>();
      const listener = (event: MessageEvent) => {
        const message = JSON.parse(String(event.data)) as { id?: number; result: T; error?: { message: string } };
        if (message.id !== id) return;
        if (message.error) reply.reject(new Error(`${method}: ${message.error.message}`));
        else reply.resolve(message.result);
      };
      ws.addEventListener("message", listener);
      const timer = setTimeout(() => reply.reject(new Error(`No CDP response to ${method}`)), 5_000);
      try {
        ws.send(JSON.stringify({ id, method }));
        return await reply.promise;
      } finally {
        clearTimeout(timer);
        ws.removeEventListener("message", listener);
      }
    },
    close: () => ws.close(),
  };
}

async function runBrowserProbe(argv: string[], cwd: string) {
  const child = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe", timeout: 15_000 });
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { argv, pid: child.pid, exit, stdout, stderr };
}

// S3 / P36: the real Chromium form, not a synthetic DOM mutation or captured
// selector string, must post the literal fixture input and visibly show the receipt.
onWindows("external drivers: P36 control-ui submits an owned Chromium page and captures its visible receipt", async () => {
  const run = createRunRoot("pstack-control-ui");
  const profile = join(run.path, "chromium-profile");
  const evidence: Record<string, unknown> = { root: run.path, profile };
  const requests: { method: string; url: string; body: string }[] = [];
  const app = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const route = new URL(request.url).pathname;
    if (route !== "/receipt") return new Response("Not found", { status: 404 });
    const body = await request.text();
    requests.push({ method: request.method, url: request.url, body });
    const posted = request.method === "POST" && body === "shelf=Q4";
    return new Response(`<!doctype html><title>Owned warehouse</title><main id="warehouse">
      <h1>${posted ? "Receipt: Q4 confirmed" : "Warehouse queue"}</h1>
      <form method="post"><button name="shelf" value="Q4">Confirm shelf Q4</button></form>
    </main>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } });
  const pageUrl = `http://127.0.0.1:${app.port}/receipt`;
  let closeBrowser: (() => Promise<void>) | undefined;
  try {
    const driver = join(run.workDir, "page.py");
    writeFileSync(driver, readExample(readFileSync(join(skills, "control-ui/SKILL.md"), "utf8"), "python pstack-page"));
    const chrome = process.env.PSTACK_CHROMIUM ?? [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
      .filter(Boolean).flatMap(dir => [join(dir!, "Google/Chrome/Application/chrome.exe"), join(dir!, "Microsoft/Edge/Application/msedge.exe")])
      .find(existsSync);
    const python = process.env.PSTACK_PYTHON ?? Bun.which("python");
    if (!chrome || !python) throw new Error("Select installed Chromium and Python with PSTACK_CHROMIUM and PSTACK_PYTHON");
    const browserArgs = [chrome, "--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
      "--disable-breakpad", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, pageUrl];
    const browser = Bun.spawn(browserArgs, { cwd: run.workDir, stdout: "pipe", stderr: "pipe" });
    const stdout = new Response(browser.stdout).text();
    const stderr = new Response(browser.stderr).text();
    Object.assign(evidence, { browserArgs, browserPid: browser.pid, pageUrl, requests });
    let control: BrowserControl | undefined;
    let ownsEndpoint = false;
    closeBrowser = async () => {
      try {
        if (ownsEndpoint && browser.exitCode === null) await control!.send("Browser.close");
      } finally {
        control?.close();
        const deadline = setTimeout(() => browser.kill(), 5_000);
        if (!ownsEndpoint && browser.exitCode === null) browser.kill();
        try {
          Object.assign(evidence, { browserExit: await browser.exited, browserStdout: await stdout, browserStderr: await stderr });
        } finally { clearTimeout(deadline); }
      }
    };
    const portFile = join(profile, "DevToolsActivePort");
    const [port, socketPath] = await until(() => {
      if (browser.exitCode !== null) throw new Error(`Chromium exited at startup: ${browser.exitCode}`);
      if (!existsSync(portFile)) return;
      const [port, path] = readFileSync(portFile, "utf8").trim().split(/\r?\n/);
      if (/^\d+$/.test(port) && path?.startsWith("/devtools/browser/")) return [port, path];
    }, "Chromium did not publish its owned DevTools endpoint");
    const endpoint = `http://127.0.0.1:${port}`;
    control = browserControl(`ws://127.0.0.1:${port}${socketPath}`);
    evidence.debugEndpoint = endpoint;
    const browserInfo = await control.send<{ processInfo: { id: number; type: string }[] }>("SystemInfo.getProcessInfo");
    evidence.initialBrowserProcesses = browserInfo.processInfo;
    expect(browserInfo.processInfo).toContainEqual(expect.objectContaining({ id: browser.pid, type: "browser" }));
    ownsEndpoint = true;
    evidence.browserVersion = await control.send("Browser.getVersion");
    await until(() => requests.find(entry => entry.method === "GET"), "Chromium did not open the owned page");
    const argv = [python, driver, endpoint, pageUrl, "#warehouse", "Confirm shelf Q4", run.captureDir];
    const action = await runBrowserProbe(argv, run.workDir);
    evidence.action = action;
    if (action.exit !== 0) throw new Error(`Page probe exited ${action.exit}: ${action.stderr}`);
    expect(action.stdout).toContain("Warehouse queue");
    expect(action.stdout).toContain("Receipt: Q4 confirmed");
    expect(requests.filter(entry => entry.method === "POST").map(entry => entry.body)).toEqual(["shelf=Q4"]);
    const wrongMarkerOut = join(run.workDir, "wrong-marker-output");
    mkdirSync(wrongMarkerOut);
    const wrongMarkerArgs = [python, driver, endpoint, pageUrl, "#not-the-warehouse", "Confirm shelf Q4", wrongMarkerOut];
    const wrongMarker = await runBrowserProbe(wrongMarkerArgs, run.workDir);
    evidence.wrongMarker = wrongMarker;
    expect(wrongMarker.exit).toBe(1);
    expect(wrongMarker.stderr).toContain("#not-the-warehouse; found 0");
    expect(requests.filter(entry => entry.method === "POST").map(entry => entry.body)).toEqual(["shelf=Q4"]);
    const before = readFileSync(join(run.captureDir, "before.png"));
    const after = readFileSync(join(run.captureDir, "after.png"));
    for (const bytes of [before, after]) expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(before.equals(after)).toBe(false);
    const processes = await control.send<{ processInfo: { id: number; type: string }[] }>("SystemInfo.getProcessInfo");
    evidence.browserProcesses = processes.processInfo;
    expect(processes.processInfo).toContainEqual(expect.objectContaining({ id: browser.pid, type: "browser" }));
    const close = closeBrowser;
    closeBrowser = undefined;
    await close();
    expect(evidence.browserExit).toBe(0);
    const stopped = await until(() => {
      const alive = processes.processInfo.filter(({ id }) => {
        try { return process.kill(id, 0); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          return false;
        }
      });
      return alive.length === 0 ? processes.processInfo.map(({ id }) => id) : undefined;
    }, "A recorded Chromium process remained alive");
    evidence.exitedPids = stopped;
    await expect(fetch(endpoint, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
  } finally {
    try { await closeBrowser?.(); } finally {
      app.stop(true);
      const dir = process.env.PSTACK_EXTERNAL_DRIVERS_EVIDENCE_DIR;
      if (dir) {
        mkdirSync(dir, { recursive: true });
        for (const name of ["before.png", "after.png"]) {
          const source = join(run.captureDir, name);
          if (existsSync(source)) copyFileSync(source, join(dir, name));
        }
      }
      run.dispose();
      keepEvidence("windows-browser", { ...evidence, rootRemoved: !existsSync(run.path) });
    }
  }
}, 60_000);

// S3 / P33: installation alone is insufficient. Each slash invocation must
// attach the real method, and the actual host shell must invoke its dependency.
onWindows("external drivers: P33 installed OMP attaches the three external methods and reaches their tools", async () => {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-external-drivers");
  const python = process.env.PSTACK_PYTHON ?? Bun.which("python");
  const probes = [
    { name: "deslop", text: "Keep behavior unchanged unless fixing a clear bug.", command: "git --version", output: /^git version \d+\./ },
    { name: "control-cli", text: "Use a repeatable local harness to exercise an interactive CLI", command: "bun --version", output: /^1\.4\.4\s*$/ },
    { name: "control-ui", text: "Choose a target from the latest page structure.", command: "\"$PSTACK_DRIVER_PYTHON\" -m playwright --version", output: /^Version \d+\./ },
  ];
  const capture = startCaptureServer({
    dir: run.captureDir,
    respond: ({ index }) => {
      const probe = probes[(index - 1) / 2];
      return probe ? { toolCall: { name: "bash", arguments: JSON.stringify({ command: probe.command }) } } : {};
    },
  });
  let session: ControlledSession | undefined;
  try {
    if (!python) throw new Error("Python is not installed; set PSTACK_PYTHON to an existing installation");
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(skills)}\n`);
    session = await ControlledSession.start({
      harness, runRoot: run,
      extensions: [resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts")],
      model: DOCK_MODEL_SELECTOR,
      env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir,
        PSTACK_DRIVER_PYTHON: python.replace(/\\/g, "/") },
      extraArgs: ["--offline"],
    });
    const available = await session.request({ type: "get_available_commands" });
    const { commands } = available.data as { commands: { name: string; source: string }[] };
    const names = commands.filter(command => command.source === "skill").map(command => command.name.replace(/^\//, ""));
    expect(names).not.toContain("skill:check-compiler-errors");
    expect(names).not.toContain("skill:run-smoke-tests");
    for (const [index, probe] of probes.entries()) {
      expect(names).toContain(`skill:${probe.name}`);
      expect(await session.prompt(`/skill:${probe.name} Check only the availability of the named tool.`))
        .toMatchObject({ agentInvoked: true, status: "completed" });
      const requests = capture.requests();
      expect(requests).toHaveLength(index * 2 + 2);
      expect(requests[index * 2]!.raw).toContain(probe.text);
      const results = session.frames().filter(frame => frame.type === "tool_execution_end" && frame.toolName === "bash");
      expect(results).toHaveLength(index + 1);
      expect(results[index]).toMatchObject({ isError: false, result: { content: [{ type: "text", text: expect.stringMatching(probe.output) }] } });
    }
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
    } finally {
      capture.stop();
      run.dispose();
      keepEvidence("native-omp", { harness, argv: session?.argv, exit: session?.exited(), frames: session?.frames(),
        requests: capture.requests().map(({ raw }) => raw), rootRemoved: !existsSync(run.path) });
    }
  }
}, 60_000);
