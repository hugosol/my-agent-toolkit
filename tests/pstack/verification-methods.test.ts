import { expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const delivered = join(root, "pstack-suite/generated/skills");
const authorship = [
  "create-verification-skill",
  "maintain-verification-skill",
  "create-formal-verification-skill",
  "maintain-formal-verification-skill",
];

test("P34/P35 S1 delivers named verification methods with readable references", () => {
  // The pinned upstream skill trees define these four entry points and the
  // three example documents. Publishing only SKILL.md or leaving a Cursor
  // command/link behind must fail here, independent of the delivery manifest.
  const preview = Bun.spawnSync([process.execPath, "run", "pstack:preview"], { cwd: root });
  expect(preview.exitCode, preview.stderr.toString()).toBe(0);
  const changes = preview.stdout.toString();
  for (const [name, edit] of [
    ...authorship.map(name => [name, "use-omp-manual-invocation"]),
    ["tdd", "name-native-invocation"],
    ["blast-radius", "name-native-invocation"],
    ["benchmark-checklist", "measure-host-load"],
  ]) {
    expect(changes).toMatch(new RegExp(`@@ skills/${name}/SKILL\\.md:\\d+ \\[${edit}\\] @@`));
  }

  const files = [
    ...authorship.map(name => `${name}/SKILL.md`),
    "tdd/SKILL.md", "blast-radius/SKILL.md", "benchmark-checklist/SKILL.md",
    "principle-explain-the-number/SKILL.md",
  ];
  const example = "create-verification-skill/references/feature-map-example";
  const headings = new Map([
    [`${example}/README.md`, "# Notes verification map"],
    [`${example}/create-note.md`, "# Create a note"],
    [`${example}/search.md`, "# Search notes"],
  ]);
  const followed = new Set<string>();
  for (const entry of [...files, ...headings.keys()]) {
    const file = join(delivered, entry);
    const body = readFileSync(file, "utf8");
    const heading = headings.get(entry);
    if (heading) expect(body.startsWith(`${heading}\n`)).toBe(true);
    for (const [, target] of body.matchAll(/\]\(((?:\.\.?\/|references\/)[^)\s#]+)(?:#[^)]+)?\)/g)) {
      const path = resolve(dirname(file), target);
      const referenced = statSync(path).isDirectory() ? join(path, "README.md") : path;
      expect(readFileSync(referenced, "utf8").trim(), `${entry} → ${target}`).not.toBe("");
      followed.add(referenced);
    }
    for (const [, invoked] of body.matchAll(/\/skill:([\w-]+)/g)) {
      expect(readFileSync(join(delivered, invoked, "SKILL.md"), "utf8")).toContain(`name: ${invoked}\n`);
    }
  }
  for (const entry of headings.keys()) expect(followed).toContain(join(delivered, entry));
});
