import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const toolkit = join(import.meta.dir, "../..");
const upstream = "pstack-suite/upstream";
const generated = "pstack-suite/generated";
const manifest = "pstack-suite/manifest.json";
const mapping = "pstack-suite/mappings/example.json";

function fixture(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "pstack maintenance "));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function tree(root: string, base = ""): Map<string, Buffer | null> {
  const paths = new Map<string, Buffer | null>();
  for (const entry of readdirSync(join(root, base), { withFileTypes: true })) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      paths.set(relative, null);
      for (const [path, bytes] of tree(root, relative)) paths.set(path, bytes);
    } else {
      paths.set(relative, readFileSync(join(root, relative)));
    }
  }
  return paths;
}

function runAt(root: string, command: string, ...args: string[]) {
  const outcome = Bun.spawnSync([process.execPath, "run", `pstack:${command}`, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { exit: outcome.exitCode, out: outcome.stdout.toString(), err: outcome.stderr.toString() };
}

function workspace(root: string) {
  cpSync(join(toolkit, "package.json"), join(root, "package.json"));
  cpSync(join(toolkit, "pstack-suite/maintenance"), join(root, "pstack-suite/maintenance"), { recursive: true });
  function put(path: string, bytes: string | Uint8Array) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  function json(path: string, value: unknown) {
    put(path, JSON.stringify(value));
  }
  const files = [
    { source: "plugin/skill.md", output: "skills/example/SKILL.md", kind: "text", mapping: "example.json" },
    { source: "plugin/notes.txt", output: "skills/example/notes.txt", kind: "text" },
    { source: "plugin/stamp.bin", output: "skills/example/stamp.bin", kind: "binary" },
  ];
  function select(...selected: typeof files) {
    json(manifest, { upstream: { repository: "https://example.invalid/plugin", revision: "fixture-v1", version: "1.0" }, files: selected });
  }
  select(...files);
  put(`${upstream}/plugin/skill.md`, "# Example\r\nInvoke `/example` manually.\r\nKeep this.\n");
  put(`${upstream}/plugin/notes.txt`, "with accent: é\r\nlone\rCR and no final newline");
  put(`${upstream}/plugin/stamp.bin`, Uint8Array.of(0, 13, 10, 255, 128, 13));
  const op = {
    name: "use-omp-manual-command",
    reason: "Use the native OMP slash command for explicit skill invocation.",
    anchor: "Invoke `/example` manually.",
    find: "`/example`",
    replace: "`/skill:example`",
  };
  json(mapping, [op]);
  return {
    root, files, select, put, json, op,
    read: (path: string) => readFileSync(join(root, path)),
    run: (command: string, ...args: string[]) => runAt(root, command, ...args),
  };
}

// P5/P8/P12 (S1): a build that patches the snapshot in place or normalizes binary
// bytes would disagree with the before/after input reads and the literal delivered bytes.
test("build adapts text, preserves other bytes and never edits the upstream snapshot", () => fixture(root => {
  const f = workspace(root);
  const textBefore = f.read(`${upstream}/plugin/skill.md`);
  const notesBefore = f.read(`${upstream}/plugin/notes.txt`);
  const binaryBefore = f.read(`${upstream}/plugin/stamp.bin`);
  const build = f.run("build");
  expect(build).toMatchObject({ exit: 0 });
  expect(f.read(`${generated}/skills/example/SKILL.md`)).toEqual(Buffer.from("# Example\nInvoke `/skill:example` manually.\nKeep this.\n"));
  expect(f.read(`${generated}/skills/example/notes.txt`)).toEqual(Buffer.from("with accent: é\nlone\rCR and no final newline"));
  expect(f.read(`${generated}/skills/example/stamp.bin`)).toEqual(Buffer.from([0, 13, 10, 255, 128, 13]));
  expect(f.read(`${upstream}/plugin/skill.md`)).toEqual(textBefore);
  expect(f.read(`${upstream}/plugin/notes.txt`)).toEqual(notesBefore);
  expect(f.read(`${upstream}/plugin/stamp.bin`)).toEqual(binaryBefore);
}));

// P7 (S1): first-match replacement and sequential application would silently
// choose an edit. Each case supplies its own upstream and mapping literals.
test.each([
  {
    input: "No available command.\n",
    operations: [{ name: "missing-command", anchor: "Invoke `/example` manually.", replace: "Use OMP." }],
    name: "missing-command", diagnostic: "missing anchor",
  },
  {
    input: "aaaa\n",
    operations: [{ name: "duplicate-command", anchor: "aaa", replace: "bbb" }],
    name: "duplicate-command", diagnostic: "ambiguous anchor",
  },
  {
    input: "Run `/example` or `/example`.\n",
    operations: [{ name: "duplicate-find", anchor: "Run `/example` or `/example`.", find: "`/example`", replace: "`/skill:example`" }],
    name: "duplicate-find", diagnostic: "ambiguous find",
  },
  {
    input: "Invoke old command here.\n",
    operations: [
      { name: "rename-command", anchor: "Invoke old command", find: "old command", replace: "new command" },
      { name: "replace-invocation", anchor: "old command here.", find: "command here", replace: "shortcut here" },
    ],
    name: "replace-invocation", diagnostic: "conflicting edit with [rename-command]",
  },
])("invalid mapping $name fails before any delivery writes", ({ input, operations, name, diagnostic }) => fixture(root => {
  const f = workspace(root);
  const [skill, notes, stamp] = f.files;
  f.select(notes, stamp, skill); // earlier valid resources must not be published on a mapping failure
  f.put(`${upstream}/plugin/skill.md`, input);
  f.json(mapping, operations.map(op => ({ ...op, reason: "Port one invocation behavior to OMP." })));
  const result = f.run("build");
  expect(result).toMatchObject({ exit: 2 });
  expect(result.err).toContain(`example.json [${name}]`);
  expect(result.err).toContain(diagnostic);
  expect(result.err).toContain("No files changed");
  expect(existsSync(join(root, generated))).toBe(false);
  expect(f.read(`${upstream}/plugin/skill.md`)).toEqual(Buffer.from(input));
}));

// P7/P13 (S1): a later unowned collision must not overwrite user data or make
// an earlier publication disappear from diagnostics. The next build can resume.
test("build preserves an unowned destination and reports preceding file effects", () => fixture(root => {
  const f = workspace(root);
  const notes = `${generated}/skills/example/notes.txt`;
  const evidence = `${generated}/skills/example/evidence/proof.txt`;
  const skill = `${generated}/skills/example/SKILL.md`;
  f.put(notes, "Local notes at a new destination.\n");
  f.put(evidence, "Retain this observation.\n");
  const failed = f.run("build");
  expect(failed).toMatchObject({ exit: 2 });
  expect(failed.err).toContain("Refusing to overwrite unowned path generated/skills/example/notes.txt");
  expect(failed.err).toContain("File effects before failure:");
  expect(failed.err).toContain("Wrote generated/skills/example/SKILL.md");
  expect(f.read(skill)).toEqual(Buffer.from("# Example\nInvoke `/skill:example` manually.\nKeep this.\n"));
  expect(existsSync(join(root, generated, "skills/example/stamp.bin"))).toBe(false);
  expect(f.read(notes)).toEqual(Buffer.from("Local notes at a new destination.\n"));
  expect(f.read(evidence)).toEqual(Buffer.from("Retain this observation.\n"));

  const [skillInput, , stampInput] = f.files;
  f.select(skillInput, stampInput);
  expect(f.run("build")).toMatchObject({ exit: 0 });
  expect(f.read(notes)).toEqual(Buffer.from("Local notes at a new destination.\n"));
  expect(f.read(evidence)).toEqual(Buffer.from("Retain this observation.\n"));
}));

// P13 (S1): retire one intact output and one user-edited output in the same
// build. Pruning the parent or treating every prior name as disposable loses evidence.
test("cleanup deletes only intact expired outputs and relinquishes modified files", () => fixture(root => {
  const f = workspace(root);
  const base = `${generated}/skills/example`;
  f.put(`${base}/evidence/raw.txt`, "independent proof\n");
  expect(f.run("build")).toMatchObject({ exit: 0 });
  const stamp = `${base}/stamp.bin`;
  expect(f.read(stamp)).toEqual(Buffer.from([0, 13, 10, 255, 128, 13]));
  f.put(`${base}/notes.txt`, "user's edited record\n");
  f.put(`${base}/unowned.txt`, "local documentation\n");
  const [skill, notes] = f.files;
  f.select(skill);
  const expired = tree(root);
  expect(f.run("check")).toMatchObject({ exit: 1, err: expect.stringContaining("Expired ownership for generated/skills/example/stamp.bin") });
  expect(tree(root)).toEqual(expired);
  const result = f.run("build");
  expect(result).toMatchObject({ exit: 0 });
  expect(result.out).toContain("Removed expired generated/skills/example/stamp.bin");
  expect(result.out).toContain("Preserved modified expired generated/skills/example/notes.txt");
  expect(existsSync(join(root, stamp))).toBe(false);
  expect(f.read(`${base}/notes.txt`)).toEqual(Buffer.from("user's edited record\n"));
  expect(f.read(`${base}/unowned.txt`)).toEqual(Buffer.from("local documentation\n"));
  expect(f.read(`${base}/evidence/raw.txt`)).toEqual(Buffer.from("independent proof\n"));
  expect(f.read(`${upstream}/plugin/stamp.bin`)).toEqual(Buffer.from([0, 13, 10, 255, 128, 13]));

  f.select(skill, notes);
  expect(f.run("build")).toMatchObject({ exit: 2, err: expect.stringContaining("Refusing to overwrite unowned path") });
  expect(f.read(`${base}/notes.txt`)).toEqual(Buffer.from("user's edited record\n"));
}));

// P13 (S1): a formerly owned path can resolve through a replacement junction
// to a user file with the very same bytes. Hash comparison alone cannot protect it.
test("cleanup refuses to traverse a replaced generated directory", () => fixture(root => {
  const f = workspace(root);
  f.select(f.files[2]);
  expect(f.run("build")).toMatchObject({ exit: 0 });
  const original = join(root, generated, "skills/example");
  renameSync(original, join(root, "previous delivery"));
  f.put("user evidence/stamp.bin", Uint8Array.of(0, 13, 10, 255, 128, 13));
  symlinkSync(join(root, "user evidence"), original, "junction");
  f.select();
  expect(f.run("build")).toMatchObject({ exit: 2, err: expect.stringContaining("expected a real directory, not a file or link") });
  expect(f.read("user evidence/stamp.bin")).toEqual(Buffer.from([0, 13, 10, 255, 128, 13]));
  expect(f.read("previous delivery/stamp.bin")).toEqual(Buffer.from([0, 13, 10, 255, 128, 13]));
}));

// P8/P9 (S1): a check that rebuilds, creates bookkeeping, or returns success
// for a manually edited/missing output cannot preserve the before/after tree.
test("repeat builds are identical and check diagnoses drift without writing", () => fixture(root => {
  const f = workspace(root);
  expect(f.run("build")).toMatchObject({ exit: 0 });
  const built = tree(root);
  expect(f.run("build")).toMatchObject({ exit: 0 });
  expect(tree(root)).toEqual(built);
  expect(f.run("check")).toMatchObject({ exit: 0 });
  expect(tree(root)).toEqual(built);

  f.put(`${generated}/skills/example/SKILL.md`, "Hand-edited skill.\n");
  unlinkSync(join(root, generated, "skills/example/stamp.bin"));
  f.put(`${generated}/evidence/raw.txt`, "Keep this evidence\n");
  const drifted = tree(root);
  const check = f.run("check");
  expect(check).toMatchObject({ exit: 1 });
  expect(check.err).toContain("Changed generated/skills/example/SKILL.md");
  expect(check.err).toContain("Missing generated/skills/example/stamp.bin");
  expect(tree(root)).toEqual(drifted);

  expect(f.run("build")).toMatchObject({ exit: 0 });
  expect(f.read(`${generated}/skills/example/SKILL.md`)).toEqual(Buffer.from("# Example\nInvoke `/skill:example` manually.\nKeep this.\n"));
  expect(f.read(`${generated}/skills/example/stamp.bin`)).toEqual(Buffer.from([0, 13, 10, 255, 128, 13]));
  expect(f.read(`${generated}/evidence/raw.txt`)).toEqual(Buffer.from("Keep this evidence\n"));
}));

test("build refreshes the mapping report after an adaptation changes", () => fixture(root => {
  const f = workspace(root);
  expect(f.run("build")).toMatchObject({ exit: 0 });
  const source = f.read(`${upstream}/plugin/skill.md`);
  f.json(mapping, [{ ...f.op, replace: "`/skill:review`", reason: "Use the suite's review entry for this example." }]);
  expect(f.run("build")).toMatchObject({ exit: 0 });
  const html = f.read("pstack-suite/mapping.html").toString();
  expect(html).toContain("use-omp-manual-command");
  expect(html).toContain("/skill:review");
  expect(html).not.toContain("/skill:example");
  expect(f.read(`${upstream}/plugin/skill.md`)).toEqual(source);
}));

// P10 (S1): compare an actual local directory against the pinned snapshot,
// not against generated artifacts or mapped text. The expected lines are authored here.
test("upstream compares only the specified local baseline against raw snapshot sources", () => fixture(root => {
  const f = workspace(root);
  const local = join(root, "separate baseline");
  f.put("separate baseline/plugin/skill.md", "# Example\nInvoke `/example` manually.\nKeep this.\n");
  f.put("separate baseline/plugin/notes.txt", "with accent: é\nlone\rCR and no final newline");
  f.put("separate baseline/plugin/stamp.bin", Uint8Array.of(0, 13, 10, 255, 128, 13));
  f.put("separate baseline/plugin/unlisted.txt", "Not shipped and not compared\n");
  const same = f.run("upstream", "--", "--local", local);
  expect(same).toMatchObject({ exit: 0 });

  f.put("separate baseline/plugin/notes.txt", "with accent: é\nnew upstream paragraph\n");
  f.put("separate baseline/plugin/stamp.bin", Uint8Array.of(255, 0));
  f.json(mapping, [{ ...f.op, replace: "`/skill:new-local-behavior`" }]);
  const before = tree(root);
  const changed = f.run("upstream", "--", "--local", local);
  expect(changed).toMatchObject({ exit: 1 });
  expect(changed.out).toContain("fixture-v1");
  expect(changed.out).toContain(local);
  expect(changed.out).toContain("--- snapshot/plugin/notes.txt\n+++ local/plugin/notes.txt");
  expect(changed.out).toContain("-lone\rCR and no final newline\n\\ No newline at end of file\n+new upstream paragraph\n");
  expect(changed.out).toContain("plugin/stamp.bin: binary differs (snapshot 6 bytes, sha256 55ef120fedabc1e5a94743315396357e57c29457997cef58c7f5f61470839bac; local 2 bytes, sha256 ea5dbf9596d187e9500f23e9a680109475341cf4e81f7e043f7d97152c10772f)");
  expect(changed.out).not.toContain("/skill:new-local-behavior");
  expect(changed.out).not.toContain("skill.md");
  expect(changed.out).not.toContain("unlisted.txt");
  expect(tree(root)).toEqual(before);

  unlinkSync(join(local, "plugin/stamp.bin"));
  const removed = f.run("upstream", "--", "--local", local);
  expect(removed).toMatchObject({ exit: 1, out: expect.stringContaining("Missing from local baseline: plugin/stamp.bin") });
}));

test("help is read-only and invalid invocation exits 2 instead of building", () => fixture(root => {
  const f = workspace(root);
  unlinkSync(join(root, manifest)); // help and usage errors must not load inputs
  const before = tree(root);
  for (const command of ["build", "check", "update", "upstream"]) {
    const help = f.run(command, "--", "--help");
    expect(help).toMatchObject({ exit: 0 });
    expect(help.out).toContain(`bun run pstack:${command}`);
    expect(help.out).toContain("Exit codes:");
  }
  expect(f.run("upstream", "--", "--local", "relative/baseline")).toMatchObject({ exit: 2, err: expect.stringContaining("absolute upstream directory") });
  expect(f.run("build", "--", "--unknown")).toMatchObject({ exit: 2, err: expect.stringContaining("Unexpected arguments") });
  expect(tree(root)).toEqual(before);
}));

// P6 (S1): the actual hidden skill is a manual invocation. Porting the command
// must not alter its visibility or its method of restating the user's goals.
test("the shipped goal-restatement skill changes only the native invocation spelling", () => {
  expect(readFileSync(join(toolkit, generated, "skills/in-your-own-words/SKILL.md"), "utf8")).toBe([
    "---",
    "name: in-your-own-words",
    "description: \"Restate in your own words what you think the user's goals are and what problem they're trying to solve. Use for /skill:in-your-own-words.\"",
    "disable-model-invocation: true",
    "---",
    "",
    "Restate in your own words what you think the user's goals are and what problem they're trying to solve.",
    "",
  ].join("\n"));
});
