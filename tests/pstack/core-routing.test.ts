import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const suite = resolve(import.meta.dir, "../../pstack-suite");
const skills = join(suite, "generated/skills");
const deferred = ["benny", "make-bot-ui", "recall", "automate-me", "reflect", "correct"];

test("generated default routing and help point to real resources, not deferred skills", () => {
  // S1 delivery: these core methods come from the approved routing scope, not from
  // the manifest. A copied upstream help table could point to recall or a missing playbook.
  const delivered = new Set(readdirSync(skills).filter(name => existsSync(join(skills, name, "SKILL.md"))));
  const manifest = JSON.parse(readFileSync(join(suite, "manifest.json"), "utf8")) as { files: { output: string }[] };
  const selected = manifest.files.flatMap(({ output }) => /^skills\/([^/]+)\/SKILL\.md$/.exec(output)?.[1] ?? []);
  expect([...delivered].sort()).toEqual(selected.sort());

  for (const name of deferred) expect(delivered.has(name)).toBe(false);

  const modeFile = join(skills, "poteto-mode/SKILL.md");
  const mode = readFileSync(modeFile, "utf8");
  const helpFile = join(skills, "poteto-help/SKILL.md");
  const help = readFileSync(helpFile, "utf8");
  for (const name of ["investigation", "feature", "refactoring", "bug-fix", "perf-issue", "prototype", "visual-parity", "runtime-forensics", "trace-forensics", "pause-safely", "session-pickup"]) {
    expect(mode).toContain(`](playbooks/${name}.md)`);
  }
  for (const name of ["how", "why", "teach", "in-your-own-words", "ketchup", "architect", "show-me-your-work"]) {
    expect(help).toContain(`](../${name}/SKILL.md)`);
  }

  const workerFile = join(skills, "poteto-mode/worker.md");
  const worker = readFileSync(workerFile, "utf8");
  expect(worker).toContain("](./SKILL.md)");
  const principles = mode.split("## Principles\n")[1]!.split("## Autonomy")[0]!;
  const principleNames = [...principles.matchAll(/^- \*\*(.+?)\*\*(?: \(\*\*(principle-[\w-]+)\*\*\))?/gm)].map(([, title, named]) =>
    named ?? `principle-${title!.toLowerCase().replace(/[^a-z -]/g, "").replace(/ /g, "-")}`);
  expect(principleNames).toContain("principle-prove-it-works");
  expect(principleNames.sort()).toEqual(
    [...delivered].filter(name => name.startsWith("principle-")).sort(),
  );

  for (const [file, body] of [[modeFile, mode], [helpFile, help], [workerFile, worker]]) {
    for (const [, path] of body.matchAll(/\]\(((?:\.\.?\/|playbooks\/|worker\.md)[^)\s#]+)(?:#[^)]+)?\)/g)) {
      expect(existsSync(resolve(dirname(file), path)), `${file} links to missing ${path}`).toBe(true);
    }
    for (const [, name] of body.matchAll(/\/skill:([a-z0-9]+(?:-[a-z0-9]+)*)\b/g)) {
      expect(delivered.has(name), `${file} recommends an unavailable skill: ${name}`).toBe(true);
    }
    for (const name of deferred) {
      expect(body).not.toContain(`../${name}/SKILL.md`);
      expect(body).not.toContain(`\`${name}\``);
      expect(body).not.toContain(`**${name}**`);
    }
  }
});
