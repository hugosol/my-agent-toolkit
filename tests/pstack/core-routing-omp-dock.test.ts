import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

// S3: use the whole shipped skill directory, not a filter that hides accidental
// inclusions. A deferred placeholder would be listed or return a real body.
test("installed OMP reads a delivered playbook but refuses deferred skill reads", async () => {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-core-routes");
  const delivered = resolve(import.meta.dir, "../../pstack-suite/generated/skills");
  const available = "skill://poteto-mode/playbooks/investigation.md";
  const deferred = ["recall", "automate-me", "reflect", "correct", "make-bot-ui", "benny"];
  const reads = [available, ...deferred.map(name => `skill://${name}`)];
  const capture = startCaptureServer({
    dir: run.captureDir,
    respond: ({ index }) => {
      if (index % 2 === 0) return undefined;
      const path = reads[(index - 1) / 2];
      if (!path) return undefined;
      return { toolCall: { name: "read", arguments: JSON.stringify({ path, i: "Reading pstack resource" }) } };
    },
  });
  let session: ControlledSession | undefined;
  try {
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(delivered)}\n`);
    session = await ControlledSession.start({
      harness,
      runRoot: run,
      extensions: [resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts")],
      model: DOCK_MODEL_SELECTOR,
      env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir },
      extraArgs: ["--offline"],
    });
    const response = await session.request({ type: "get_available_commands" });
    const { commands } = response.data as { commands: { name: string; source: string }[] };
    const names = commands.filter(command => command.source === "skill").map(command => command.name.replace(/^\//, ""));
    const shipped = readdirSync(delivered).filter(name => existsSync(join(delivered, name, "SKILL.md")));
    expect(names).toContain("skill:poteto-mode");
    expect(names).toContain("skill:poteto-help");
    expect(names.sort()).toEqual(shipped.map(name => `skill:${name}`).sort());
    for (const name of deferred) expect(names).not.toContain(`skill:${name}`);

    const investigation = "Investigation requests are read-only. They produce a cited explanation or a recommendation, not a code change.";
    expect(await session.prompt("Read the investigation playbook.")).toMatchObject({ agentInvoked: true, status: "completed" });
    expect(capture.requests()).toHaveLength(2);
    expect(capture.requests()[0]!.raw).not.toContain(investigation);
    expect(capture.requests()[1]!.raw).toContain(investigation);

    for (const [offset, name] of deferred.entries()) {
      expect(await session.prompt(`Read the pstack skill named ${name}.`)).toMatchObject({ agentInvoked: true, status: "completed" });
      const requests = capture.requests();
      expect(requests).toHaveLength(4 + offset * 2);
      // A completed assistant turn is not a successful invocation: require the
      // real native reader's unavailable result on the tool continuation.
      expect(requests[requests.length - 1]!.raw).toContain(`Unknown skill: ${name}`);
    }
    const readResults = session.frames().filter(frame => frame.type === "tool_execution_end" && frame.toolName === "read");
    expect(readResults.map(frame => frame.isError)).toEqual([false, ...deferred.map(() => true)]);
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
      const evidence = process.env.PSTACK_ROUTING_EVIDENCE_DIR;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        writeFileSync(join(evidence, "core-routing-omp-dock.json"), JSON.stringify({
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
