import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

// S3 consumer evidence for the real S1 adaptation: using the native slash
// command must read the shipped instructions without exposing them by default.
test("installed OMP attaches the generated hidden skill only when invoked explicitly", async () => {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-manual-skill");
  const capture = startCaptureServer({ dir: run.captureDir });
  let session: ControlledSession | undefined;
  try {
    const skills = resolve(import.meta.dir, "../../pstack-suite/generated/skills");
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(skills)}\n`);
    session = await ControlledSession.start({
      harness,
      runRoot: run,
      extensions: [resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts")],
      model: DOCK_MODEL_SELECTOR,
      env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir },
      extraArgs: ["--offline", "--skills=in-your-own-words"],
    });
    const body = "Restate in your own words what you think the user's goals are and what problem they're trying to solve.";
    expect(await session.prompt("An ordinary turn without a skill invocation.")).toMatchObject({ agentInvoked: true, status: "completed" });
    const ordinary = capture.requests();
    expect(ordinary).toHaveLength(1);
    expect(ordinary[0].raw).not.toContain(body);

    expect(await session.prompt("/skill:in-your-own-words Owned example input.")).toMatchObject({ agentInvoked: true, status: "completed" });
    const invoked = capture.requests();
    expect(invoked).toHaveLength(2);
    expect(invoked[1].raw).toContain(body);
    expect(invoked[1].raw).toContain("Owned example input.");
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
      const evidence = process.env.PSTACK_MAINTENANCE_EVIDENCE_DIR;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        writeFileSync(join(evidence, "native-omp-dock.json"), JSON.stringify({
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
