import { expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

const skills = resolve(import.meta.dir, "../../pstack-suite/generated/skills");
const provider = resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts");
const completed = { agentInvoked: true, status: "completed" };

// S1 publishes the method and S3 reads it in the installed host. The pinned
// upstream method requires proof from rendered frames and inherits Ketchup's
// decision handoff. A registered name with a missing body or broken reference
// cannot return both independent pieces of guidance through the native seam.
test("P42 installed OMP loads the video method and its Ketchup reference", async () => {
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-video-method");
  let reference: string | undefined;
  const capture = startCaptureServer({
    dir: run.captureDir,
    respond: ({ index }) => index === 2 && reference ? {
      toolCall: { name: "read", arguments: JSON.stringify({ path: reference, i: "Reading Ketchup method" }) },
    } : undefined,
  });
  let session: ControlledSession | undefined;
  try {
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(skills)}\n`);
    session = await ControlledSession.start({
      harness, runRoot: run, extensions: [provider], model: DOCK_MODEL_SELECTOR,
      env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir },
      extraArgs: ["--offline"],
    });
    expect(await session.prompt("/skill:ketchup-video Read the video handoff method.")).toMatchObject(completed);
    const attached = capture.requests()[0]?.raw;
    expect(attached).toContain("Measure each hold by matching the file's frames to the slide");
    const linked = attached?.match(/\]\((\.\.\/ketchup\/SKILL\.md)\)/)?.[1];
    expect(linked).toBe("../ketchup/SKILL.md");
    reference = resolve(skills, "ketchup-video", linked!);

    expect(await session.prompt("Read the referenced Ketchup handoff method.")).toMatchObject(completed);
    const results = session.frames().filter(frame => frame.type === "tool_execution_end" && frame.toolName === "read");
    expect(results.map(frame => frame.isError)).toEqual([false]);
    expect(capture.requests()[2]?.raw).toContain("Ask the call the user owns, such as merge, approve, or pick, and give your pick.");
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
      const evidence = process.env.PSTACK_VIDEO_EVIDENCE_DIR;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        writeFileSync(join(evidence, "video-method-omp.json"), JSON.stringify({
          harness, argv: session?.argv, exit: session?.exited(), frames: session?.frames(),
          requests: capture.requests().map(({ raw }) => raw),
        }, null, 2));
      }
    } finally {
      capture.stop();
      run.dispose();
      expect(existsSync(run.path)).toBe(false);
    }
  }
}, 180_000);
