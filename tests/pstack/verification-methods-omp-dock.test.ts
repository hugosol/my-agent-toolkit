import { expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

test("P34 S3 reads verification guidance, its example, and a project skill outside the Suite catalog", async () => {
  // The approved seam is the installed OMP command and actual `read` result.
  // A catalog-only reader could attach the guidance but fail on a project file.
  // Supply a deterministic authored artifact, not a model-generated plan, and
  // keep the distinguishing bytes out of the scripted model's call and prompt.
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-verification-methods");
  const shipped = resolve(import.meta.dir, "../../pstack-suite/generated/skills");
  const projectSkill = join(run.workDir, "A Notes Project", "verification", "verify-notes", "SKILL.md");
  const proof = "The owned notes archive must contain release-check-73 after restart.";
  const reads = [
    ["Read the referenced feature map.", "skill://create-verification-skill/references/feature-map-example/README.md"],
    ["Read the project-owned skill by path.", projectSkill],
  ] as const;
  const issued = new Set<string>();
  const capture = startCaptureServer({
    dir: run.captureDir,
    respond: ({ raw }) => {
      const next = reads.find(([input]) => !issued.has(input) && raw.includes(input));
      if (!next) return undefined;
      const [input, path] = next;
      issued.add(input);
      return { toolCall: { name: "read", arguments: JSON.stringify({ path, i: "Reading verification resource" }) } };
    },
  });
  let session: ControlledSession | undefined;
  let commands: unknown;
  try {
    mkdirSync(dirname(projectSkill), { recursive: true });
    writeFileSync(projectSkill, `---\nname: verify-notes\ndescription: Check the owned Notes archive.\n---\n# Verify Notes\n\n${proof}\n`);
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(shipped)}\n`);
    session = await ControlledSession.start({
      harness,
      runRoot: run,
      extensions: [resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts")],
      model: DOCK_MODEL_SELECTOR,
      env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir },
      extraArgs: ["--offline"],
    });
    const completed = { agentInvoked: true, status: "completed" };
    expect(await session.prompt("/skill:create-verification-skill Read the authorship guidance.")).toMatchObject(completed);
    expect(capture.requests()[0]!.raw).toContain("Run its own instructions end to end once: launch, doctor, drive ONE mapped feature");

    const { data } = await session.request({ type: "get_available_commands" });
    if (!data || typeof data !== "object" || !("commands" in data) || !Array.isArray(data.commands)) {
      throw new Error("OMP did not return its available commands");
    }
    commands = data.commands;
    const namedSkills = data.commands.flatMap(command =>
      command?.source === "skill" && typeof command.name === "string" ? [command.name.replace(/^\//, "")] : [],
    );
    expect(namedSkills).toContain("skill:create-verification-skill");
    expect(namedSkills).not.toContain("skill:verify-notes");

    expect(await session.prompt("Read the referenced feature map.")).toMatchObject(completed);
    expect(await session.prompt("Read the project-owned skill by path.")).toMatchObject(completed);
    const results = session.frames().filter(frame => frame.type === "tool_execution_end" && frame.toolName === "read");
    expect(results.map(frame => frame.isError)).toEqual([false, false]);
    expect(JSON.stringify(results[0]!.result)).toContain("Report an unreachable path with the attempted command and the unmet precondition.");
    expect(JSON.stringify(results[1]!.result)).toContain(proof);
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
    } finally {
      capture.stop();
      run.dispose();
      const removed = !existsSync(run.path);
      const evidence = process.env.PSTACK_VERIFICATION_EVIDENCE_DIR;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        writeFileSync(join(evidence, "verification-methods-omp.json"), JSON.stringify({
          harness, argv: session?.argv, exit: session?.exited(), frames: session?.frames(), commands,
          requests: capture.requests().map(({ raw }) => raw), ownedRunRoot: run.path, removed,
        }, null, 2));
      }
      expect(removed).toBe(true);
    }
  }
}, 180_000);
