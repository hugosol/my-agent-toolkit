import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { resolveInstalledOmp } from "../harness-dock/installed-omp";
import { createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

test("logs-audit P41 S3 reads the decision trail and explicit handoff resources in installed OMP", async () => {
  // The native slash command and read results are the approved seam. A catalog
  // that lists the skill but cannot fetch sibling playbooks or an explicit note
  // must fail. The controlled provider submits reads only, never the expected bytes.
  const harness = await resolveInstalledOmp();
  const run = createRunRoot("pstack-logs-audit");
  const skills = resolve(import.meta.dir, "../../pstack-suite/generated/skills");
  const note = join(run.workDir, "Release evidence-resume.md");
  const noteBytes = "# Checkpoint\nResume by reviewing the recorded parser failure, ticket pine-96.\n";
  const reads = [
    ["Read TSV format now.", "skill://show-me-your-work/references/decision-log-template.tsv", "ts\tphase\tdecision\twhy\tevidence\tresult"],
    ["Read the pause playbook now.", "skill://poteto-mode/playbooks/pause-safely.md", "Finish the current atomic step or back out of it."],
    ["Read the pickup playbook now.", "skill://poteto-mode/playbooks/session-pickup.md", "Use the supplied resume note, WIP commit, decision log, or branch."],
    ["Read the worktree audit playbook now.", "skill://poteto-mode/playbooks/worktree-cleanup.md", "`-` in `LAST_CHAT` or `PR` is not clearance."],
    ["Read the explicitly supplied resume note now.", note, "Resume by reviewing the recorded parser failure, ticket pine-96."],
  ] as const;
  const issued = new Set<string>();
  const capture = startCaptureServer({
    dir: run.captureDir,
    respond: ({ raw }) => {
      const next = reads.find(([input]) => !issued.has(input) && raw.includes(input));
      if (!next) return undefined;
      const [input, path] = next;
      issued.add(input);
      return { toolCall: { name: "read", arguments: JSON.stringify({ path, i: "Reading handoff resource" }) } };
    },
  });
  let session: ControlledSession | undefined;
  try {
    writeFileSync(note, noteBytes);
    writeFileSync(join(run.agentDir, "config.yml"), `skills:\n  customDirectories:\n    - ${JSON.stringify(skills)}\n`);
    session = await ControlledSession.start({
      harness,
      runRoot: run,
      extensions: [resolve(import.meta.dir, "../harness-dock/fixtures/extension-root/provider.ts")],
      model: DOCK_MODEL_SELECTOR,
      env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, HOME: run.agentDir, USERPROFILE: run.agentDir },
      extraArgs: ["--offline"],
    });
    const completed = { agentInvoked: true, status: "completed" };
    expect(await session.prompt("/skill:show-me-your-work Read the decision log format.")).toMatchObject(completed);
    expect(capture.requests()[0]!.raw).toContain("A wrong call gets a new row that supersedes it.");
    for (const [index, [input, , expected]] of reads.entries()) {
      expect(await session.prompt(input)).toMatchObject(completed);
      const results = session.frames().filter(frame => frame.type === "tool_execution_end" && frame.toolName === "read");
      expect(results).toHaveLength(index + 1);
      expect(results[index]!.isError).toBe(false);
      expect(JSON.stringify(results[index]!.result)).toContain(JSON.stringify(expected).slice(1, -1));
    }
    expect(readFileSync(note, "utf8")).toBe(noteBytes);
    expect(await session.stop()).toMatchObject({ exitCode: 0, timedOut: false });
  } finally {
    try {
      if (session && !session.exited()) await session.stop();
    } finally {
      capture.stop();
      run.dispose();
      const removed = !existsSync(run.path);
      const evidence = process.env.PSTACK_LOGS_AUDIT_EVIDENCE_DIR;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        writeFileSync(join(evidence, "logs-audit-omp.json"), JSON.stringify({
          harness, argv: session?.argv, exit: session?.exited(), frames: session?.frames(),
          requests: capture.requests().map(({ raw }) => raw), note, noteBytes, ownedRunRoot: run.path, removed,
        }, null, 2));
      }
      expect(removed).toBe(true);
    }
  }
}, 180_000);
