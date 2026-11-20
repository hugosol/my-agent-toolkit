import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

const testOnWindows = test.skipIf(process.platform !== "win32");
const entry = resolve(import.meta.dir, "../../pstack-suite/generated/skills/statechart/scripts/statechart.ts");

const model = String.raw`---- MODULE Request ----
VARIABLE phase
Init == phase = "idle"
Send == /\ phase = "idle" /\ phase' = "pending"
Reset == /\ phase = "pending" /\ phase' = "idle"
Next == Send \/ Reset
KnownPhase == phase \in {"idle", "pending"}
NeverPending == phase /= "pending"
====
`;
const config = "INIT Init\nNEXT Next\nINVARIANT KnownPhase\n";
const view = `export const state = ({ phase }) => phase === "idle" ? "Ready" : "Waiting";
export const step = (action) => action === "Send" ? "submit request" : "reset request";
`;

function requiredJar() {
  const jar = process.env.TLA2TOOLS;
  if (!jar || !isAbsolute(jar) || !existsSync(jar)) {
    throw new Error("Windows statechart needs TLA2TOOLS set to the absolute path of the official TLA+ Tools 1.7.4 jar.");
  }
  return jar;
}

function keepEvidence(name: string, evidence: Record<string, unknown>) {
  const dir = process.env.PSTACK_STATECHART_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(evidence, null, 2));
}

function writeInputs(root: string, spec: string, cfg: string) {
  writeFileSync(join(root, "Request.tla"), spec);
  writeFileSync(join(root, "Request.cfg"), cfg);
  writeFileSync(join(root, "view.mjs"), view);
}

function runChart(name: string, spec: string, cfg: string, options: { jar?: string; emptyOutput?: boolean } = {}) {
  const jar = options.jar ?? requiredJar();
  const root = mkdtempSync(join(tmpdir(), "pstack statechart-"));
  const temp = join(root, "temporary files");
  const output = join(root, "statechart output");
  const java = process.env.JAVA || "java";
  const env = {
    ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp, TLA2TOOLS: jar, JAVA: java,
    PSTACK_STATECHART_PROCESS_TRACE: "1",
  };
  let evidence: Record<string, unknown> = { root, bun: Bun.version, platform: process.platform, jar, java, spec, cfg, view };
  try {
    mkdirSync(temp);
    if (options.emptyOutput) mkdirSync(output);
    writeInputs(root, spec, cfg);
    const argv = [process.execPath, entry, "Request.tla", "--view", "view.mjs", "--out", output];
    const run = (cmd: string[], environment = env) => {
      const child = Bun.spawnSync(cmd, { cwd: root, env: environment, timeout: 30_000, stdout: "pipe", stderr: "pipe" });
      return { cmd, pid: child.pid, exit: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
    };
    const probe = join(root, "java version probe");
    mkdirSync(probe);
    const javaVersion = run([java, "-version"], { ...env, TEMP: probe, TMP: probe, TMPDIR: probe });
    evidence.javaVersion = javaVersion;
    rmSync(probe, { recursive: true });
    expect(javaVersion.exit, javaVersion.stderr).toBe(0);
    const result = run(argv);
    const files = Object.fromEntries((existsSync(output) ? readdirSync(output) : []).map(
      (file) => [file, readFileSync(join(output, file), "utf8").replace(/\r\n/g, "\n")],
    ));
    const remainingTemp = readdirSync(temp);
    const remainingWork = readdirSync(root).filter((file) => file !== "statechart output");
    evidence = { ...evidence, result, files, remainingTemp, remainingWork, outputPublished: existsSync(output) };
    expect(remainingTemp).toEqual([]);
    expect(remainingWork).toEqual(["Request.cfg", "Request.tla", "temporary files", "view.mjs"]);
    const javaRuns = result.stderr.split(/\r?\n/).flatMap((line): {
      argv: string[];
      pid: number;
      exit: number;
      cwd: string;
    }[] => line.startsWith("statechart java: ") ? [JSON.parse(line.slice("statechart java: ".length))] : []);
    return { ...result, files, javaRuns, outputPublished: existsSync(output) };
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } finally {
      evidence.rootRemoved = !existsSync(root);
      keepEvidence(name, evidence);
    }
  }
}

// S1 generates the executable; this S3 business fixture checks the published chart
// and report. Independently: idle is initial, Send reaches pending, Reset returns.
// A converter that swaps or drops an edge cannot match these labelled transitions.
testOnWindows("P36 statechart publishes the two reachable states and both labelled edges on Windows", () => {
  const result = runChart("success", model, config, { emptyOutput: true });
  expect(result.exit, result.stderr).toBe(0);
  expect(result.files["chart.mmd"]).toBe(
    "stateDiagram-v2\n  s0: Ready\n  s1: Waiting\n  [*] --> s0\n  s0 --> s1: submit request\n  s1 --> s0: reset request\n",
  );
  expect(result.files["report.md"]).toContain("TLC reached 2 states and 2 steps. The chart draws 2 states and 2 arrows.");
  expect(result.files["report.md"]).toMatch(/## Rules that hold\n(?:[^\n]*, )?KnownPhase(?:,|\n)/);
  expect(result.files["tlc.out"]).toContain("Model checking completed. No error has been found.");
  expect(result.files["tlc.out"]).toMatch(/TLC2 Version 2\.19 .*rev: 5a47802/);
  expect(result.files["tlc.out"]).toMatch(/\[pid: \d+\].*Windows/);
  // The receipts must distinguish a real checker from a wrapper that only
  // republishes a graph or stale TLC output without running its Java phases.
  expect(result.javaRuns.map(({ argv, exit }) => [argv[argv.indexOf("-cp") + 2], exit])).toEqual([
    ["tla2sany.xml.XMLExporter", 0], ["tlc2.TLC", 0], ["tlc2.TLC", 0],
  ]);
  expect(result.files["tlc.out"]).toContain(`[pid: ${result.javaRuns[1].pid}]`);
}, 70_000);

// A checked rule fails on the first Send, not in Init. A report that calls the
// second state safe or loses the shortest path cannot pass even if the CLI exits 1.
testOnWindows("P36 statechart publishes the shortest violating path and exits 1", () => {
  const result = runChart("rule-violation", model, `${config}INVARIANT NeverPending\n`);
  expect(result.exit, result.stderr).toBe(1);
  expect(result.files["report.md"]).toContain(
    "## NeverPending breaks\nThe shortest path has 1 step:\n0. Ready\n1. submit request: Waiting\n",
  );
  expect(result.files["chart.mmd"]).toMatch(/\n  class s1 breaks\n/);
  expect(result.files["tlc.out"]).toContain("Invariant NeverPending is violated.");
}, 70_000);

// SANY must read the malformed input for real. Treating a checker failure as a
// broken rule would publish a chart or return the rule-violation exit code.
testOnWindows("P36 a real SANY parse error exits 2 and publishes no output", () => {
  const result = runChart("parse-error", model.replace('Init == phase = "idle"', 'Init == phase ='), config);
  expect(result.exit, result.stderr).toBe(2);
  expect(result.stderr).toMatch(/SANY could not read Request\.tla \(exit [1-9]\d*\)/);
  expect(result.stderr).toContain("Parse Error");
  expect(result.outputPublished).toBe(false);
  expect(result.javaRuns.some(({ argv, exit }) => argv.includes("tla2sany.xml.XMLExporter") && exit !== 0)).toBe(true);
}, 70_000);

testOnWindows("P36 missing TLC is a visible error, not a host installation or a published output", () => {
  const result = runChart("missing-tlc", model, config, { jar: "" });
  expect(result.exit, result.stderr).toBe(2);
  expect(result.stderr).toContain("Set TLA2TOOLS to the absolute path of an existing TLA+ Tools 1.7.4 tla2tools.jar.");
  expect(result.outputPublished).toBe(false);
  expect(result.javaRuns).toEqual([]);
}, 70_000);

// S3: the provider scripts one explicit shell action; the installed OMP reads
// the generated hidden skill and reports the actual tool result on the wire.
// Seeing the skill alone or returning canned prose cannot publish the real graph.
testOnWindows("P36 installed OMP loads statechart and returns the real shell result", async () => {
  const jar = requiredJar();
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-statechart");
  const temp = join(run.path, "tool-temp");
  const quote = (file: string) => `'${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
  const command = `${quote(process.execPath)} ${quote(entry)} Request.tla --view view.mjs --out native-chart`;
  let sentAction = false;
  const capture = startCaptureServer({
    dir: run.captureDir,
    respond: () => {
      if (sentAction) return {};
      sentAction = true;
      return { toolCall: { name: "bash", arguments: JSON.stringify({ command }) } };
    },
  });
  let session: ControlledSession | undefined;
  const evidence: Record<string, unknown> = { harness, command, jar, spec: model, cfg: config, view };
  try {
    mkdirSync(temp);
    writeInputs(run.workDir, model, config);
    const skills = resolve(entry, "../../..");
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(skills)}\n`);
    session = await ControlledSession.start({
      harness, runRoot: run,
      extensions: [resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts")],
      model: DOCK_MODEL_SELECTOR,
      env: {
        [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir,
        TLA2TOOLS: jar, TEMP: temp, TMP: temp, TMPDIR: temp, PSTACK_STATECHART_PROCESS_TRACE: "1",
      },
      extraArgs: ["--offline", "--skills=statechart"],
    });
    expect(await session.prompt("/skill:statechart Run the explicitly provided Request.tla and view.mjs.")).toMatchObject({
      agentInvoked: true, status: "completed",
    });
    const toolEnd = await session.awaitFrame(
      (frame) => frame.type === "tool_execution_end" && frame.toolName === "bash", "statechart bash result",
    );
    expect(toolEnd.isError).toBe(false);
    const requests = capture.requests();
    expect(requests).toHaveLength(2);
    expect(requests[0].raw).toContain("The chart shows how a system moves between states");
    expect(requests[1].raw).toContain("TLC reached 2 states and 2 steps. The chart draws 2 states and 2 arrows.");
    expect(requests[1].raw).toContain("Wrote native-chart");
    const output = join(run.workDir, "native-chart");
    const chart = readFileSync(join(output, "chart.mmd"), "utf8");
    evidence.chart = chart;
    evidence.report = readFileSync(join(output, "report.md"), "utf8");
    evidence.tlc = readFileSync(join(output, "tlc.out"), "utf8");
    expect(chart).toContain("s0 --> s1: submit request");
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
    const staging = [...readdirSync(run.workDir), ...readdirSync(temp)].filter((file) => file.includes("statechart-"));
    evidence.remainingChartTemps = staging;
    expect(staging).toEqual([]);
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
      Object.assign(evidence, { argv: session?.argv, exit: session?.exited(), frames: session?.frames(),
        requests: capture.requests().map(({ raw }) => raw) });
    } finally {
      capture.stop();
      run.dispose();
      keepEvidence("native-omp", { ...evidence, rootRemoved: !existsSync(run.path) });
    }
  }
}, 180_000);
