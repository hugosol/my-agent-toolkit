import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRunRoot } from "../harness-dock/run-root";
import { copyPstackPackage, runPstack, type CommandEvidence } from "./setup-fixture";

// S1 / P25: the command must not publish an unconfirmed or invalid proposal.
// The observed state is read from disk independently after each invocation;
// successful text or a generated persona alone cannot establish persistence.
test("pstack setup only saves and generates explicitly confirmed, available model bindings", () => {
  const run = createRunRoot("pstack-confirmation");
  const cwd = run.workDir;
  const commands: CommandEvidence[] = [];
  const saved = join(cwd, "pstack-suite/models.local.json");
  try {
    copyPstackPackage(cwd);
    const proposal = join(cwd, "proposal.json");
    const catalog = join(cwd, "catalog.json");
    const persona = join(cwd, "pstack-suite/generated/agents/poteto-agent.md");
    const global = join(run.agentDir, "config.yml");
    const globalBytes = "modelRoles:\n  default: other-suite/default:high\n";
    writeFileSync(global, globalBytes);
    const env = { ...process.env, HOME: run.agentDir, USERPROFILE: run.agentDir };
    const invoke = (command: string, ...args: string[]) => {
      const result = runPstack(cwd, env, command, ...args);
      commands.push(result);
      return result;
    };
    const confirmed = {
      "poteto-agent": { model: "models-a/known-a", thinking: "high" },
      "comment-sicko": { model: "inherit-parent", thinking: "inherit" },
    };
    writeFileSync(catalog, JSON.stringify({ models: [
      { selector: "models-a/known-a", kind: "chat", reasoning: true, thinking: ["off", "low", "high"] },
    ] }));
    const confirm = () => invoke("setup", "--confirm", proposal, "--catalog", catalog);
    writeFileSync(proposal, JSON.stringify(confirmed));
    expect(invoke("setup", "--catalog", catalog)).toMatchObject({ exit: 2 });
    expect(invoke("setup", "--cancel")).toMatchObject({ exit: 0, stdout: expect.stringContaining("no files changed") });
    expect(existsSync(saved)).toBe(false);
    expect(existsSync(persona)).toBe(false);

    // An unconfirmed proposal copied into the settings location is not a saved record.
    writeFileSync(saved, JSON.stringify(confirmed));
    expect(invoke("build")).toMatchObject({ exit: 2, stderr: expect.stringContaining("expected confirmed setup settings") });
    expect(existsSync(persona)).toBe(false);
    unlinkSync(saved);

    writeFileSync(proposal, JSON.stringify({ ...confirmed, "poteto-agent": { model: "models-a/unavailable", thinking: "high" } }));
    expect(confirm()).toMatchObject({ exit: 2, stderr: expect.stringContaining("poteto-agent: unavailable model models-a/unavailable") });
    expect(existsSync(saved)).toBe(false);
    expect(existsSync(persona)).toBe(false);

    writeFileSync(proposal, JSON.stringify(confirmed));
    expect(confirm()).toMatchObject({ exit: 0, stdout: expect.stringContaining("Start a new pstack session") });
    const prior = readFileSync(persona);
    expect(JSON.parse(readFileSync(saved, "utf8"))).toEqual({ confirmed: true, roles: confirmed });

    writeFileSync(proposal, JSON.stringify({ ...confirmed, "poteto-agent": { model: "models-a/known-a", thinking: "medium" } }));
    expect(confirm()).toMatchObject({ exit: 2, stderr: expect.stringContaining("poteto-agent: unsupported thinking level medium") });
    expect(invoke("setup", "--cancel")).toMatchObject({ exit: 0 });
    expect(JSON.parse(readFileSync(saved, "utf8"))).toEqual({ confirmed: true, roles: confirmed });
    expect(readFileSync(persona)).toEqual(prior);
    expect(readFileSync(global, "utf8")).toBe(globalBytes);
    expect(invoke("build")).toMatchObject({ exit: 0 });
    expect(readFileSync(persona)).toEqual(prior);
    expect(invoke("check")).toMatchObject({ exit: 0 });
  } finally {
    try {
      const evidence = process.env.PSTACK_SETUP_EVIDENCE_DIR;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        writeFileSync(join(evidence, "model-confirmation-cli.json"), JSON.stringify({
          commands, saved: existsSync(saved) ? readFileSync(saved, "utf8") : null,
        }, null, 2));
      }
    } finally {
      run.dispose();
    }
  }
});
