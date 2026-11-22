import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadManifest } from "../../pstack-suite/maintenance/inputs";
import { updateUpstream } from "../../pstack-suite/maintenance/upstream-update";

const skill = "pstack/skills/example/SKILL.md";
const asset = "pstack/assets/stamp.bin";
const versionPath = "pstack/.cursor-plugin/plugin.json";
const repository = "https://example.invalid/keep-this-repository";
const oldSkill = "old snapshot\n";

interface SelectedResource {
  source: string;
  output: string;
  kind: "text" | "binary";
  origin?: "runtime";
}

interface Workspace {
  local: string;
  root: string;
  git(...args: string[]): string;
  commit(): string;
  select(...extra: SelectedResource[]): string;
  effects: string[];
  putLocal(path: string, value: string | Uint8Array): void;
  snapshotPath(path: string): string;
  snapshot(path: string): Buffer;
  manifest(): string;
  update(from?: string): void;
}

function fixture(run: (f: Workspace) => void) {
  const dir = mkdtempSync(join(tmpdir(), "pstack update "));
  try {
    run(workspace(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function gitEnvironment(dir: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith("GIT_")) delete env[key];
  return {
    ...env,
    GIT_CONFIG_GLOBAL: join(dir, "no-global-config"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Pstack Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Pstack Fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  };
}

function workspace(dir: string): Workspace {
  const local = join(dir, "git checkout");
  const root = join(dir, "pstack-suite");
  const manifestPath = join(root, "manifest.json");
  mkdirSync(local);
  function put(target: string, value: string | Uint8Array) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  }
  const env = gitEnvironment(dir);
  function git(...args: string[]) {
    return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "gc.auto=0", ...args], {
      cwd: local, encoding: "utf8", env,
    }).trim();
  }
  git("init", "--quiet", "--template=");
  put(join(local, versionPath), JSON.stringify({ name: "pstack", version: "2.4.6-rc.1+build" }));
  put(join(local, skill), "committed skill\r\nno final newline");
  put(join(root, "upstream", skill), oldSkill);
  put(join(root, "runtime", "facts.ts"), "keep authored runtime");
  const effects: string[] = [];
  const skillEntry = { source: skill, kind: "text", output: "skills/example/SKILL.md", futureAnnotation: "keep this file metadata" };
  function select(...extra: SelectedResource[]) {
    const manifest = {
      upstream: { repository, revision: "old-revision", version: "pstack 1.0.0", futureProvenance: { note: "keep" } },
      files: [skillEntry, ...extra],
      futureTopLevel: ["keep"],
    };
    const original = `${JSON.stringify(manifest, null, 2)}\n`;
    put(manifestPath, original);
    return original;
  }
  function commit() {
    git("add", "--all");
    git("commit", "--quiet", "-m", "upstream fixture");
    return git("rev-parse", "--verify", "HEAD");
  }
  return {
    local, root, git, commit, select, effects,
    putLocal: (path: string, value: string | Uint8Array) => put(join(local, path), value),
    snapshotPath: (path: string) => join(root, "upstream", path),
    snapshot: (path: string) => readFileSync(join(root, "upstream", path)),
    manifest: () => readFileSync(manifestPath, "utf8"),
    update: (from = local) => updateUpstream(root, from, loadManifest(root), effects),
  };
}

// The public seam is updateUpstream; observe its snapshot, manifest, and reported filesystem effects.
test("publishes only listed HEAD blobs verbatim, then updates provenance without discarding metadata", () => fixture(f => {
  const binary = Buffer.from([0, 255, 128, 13, 10, 0, 254]);
  const original = f.select(
    { source: asset, output: "stamp.bin", kind: "binary" },
    { source: "facts.ts", output: "facts.ts", kind: "text", origin: "runtime" },
  );
  f.putLocal(asset, binary);
  f.putLocal("facts.ts", "do not copy this runtime impostor");
  f.putLocal("pstack/not-listed.txt", "do not expand the whitelist");
  const revision = f.commit();
  f.putLocal(skill, "staged skill");
  f.git("add", skill);
  f.putLocal(skill, "dirty skill");
  f.putLocal(asset, "dirty binary");
  f.putLocal(versionPath, JSON.stringify({ version: "9.9.9" }));

  f.update();

  expect(f.snapshot(skill)).toEqual(Buffer.from("committed skill\r\nno final newline"));
  expect(f.snapshot(asset)).toEqual(binary);
  expect(existsSync(f.snapshotPath("facts.ts"))).toBe(false);
  expect(existsSync(f.snapshotPath("pstack/not-listed.txt"))).toBe(false);
  expect(existsSync(f.snapshotPath(versionPath))).toBe(false);
  expect(readFileSync(join(f.root, "runtime", "facts.ts"), "utf8")).toBe("keep authored runtime");
  expect(JSON.parse(f.manifest())).toEqual({
    ...JSON.parse(original),
    upstream: { repository, revision, version: "pstack 2.4.6-rc.1+build", futureProvenance: { note: "keep" } },
  });
  expect(f.effects[f.effects.length - 1]).toBe("Wrote manifest.json");
}));

test("the update CLI changes the snapshot and version without rebuilding generated delivery", () => fixture(f => {
  const sourceToolkit = join(import.meta.dir, "../..");
  const toolkit = dirname(f.root);
  cpSync(join(sourceToolkit, "package.json"), join(toolkit, "package.json"));
  cpSync(join(sourceToolkit, "pstack-suite/maintenance"), join(f.root, "maintenance"), { recursive: true });
  const delivered = join(f.root, "generated", "skills", "example", "SKILL.md");
  mkdirSync(dirname(delivered), { recursive: true });
  writeFileSync(delivered, "previous delivery\n");
  f.select();
  const revision = f.commit();

  const result = Bun.spawnSync([process.execPath, "run", "pstack:update", "--", "--local", f.local], {
    cwd: toolkit, env: gitEnvironment(toolkit), stdout: "pipe", stderr: "pipe",
  });

  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(f.snapshot(skill)).toEqual(Buffer.from("committed skill\r\nno final newline"));
  expect(loadManifest(f.root).upstream).toEqual({ repository, revision, version: "pstack 2.4.6-rc.1+build" });
  expect(readFileSync(delivered, "utf8")).toBe("previous delivery\n");
}));

test("a selected source absent from HEAD blocks all publication even when present locally", () => fixture(f => {
  const original = f.select({ source: asset, output: "stamp.bin", kind: "binary" });
  f.commit();
  f.putLocal(asset, "untracked asset");

  expect(() => f.update()).toThrow(asset);
  expect(f.snapshot(skill).toString()).toBe(oldSkill);
  expect(existsSync(f.snapshotPath(asset))).toBe(false);
  expect(f.manifest()).toBe(original);
  expect(f.effects).toEqual([]);
}));

test("a missing blob object in the local Git database leaves the snapshot unchanged", () => fixture(f => {
  const original = f.select({ source: asset, output: "stamp.bin", kind: "binary" });
  f.putLocal(asset, Buffer.from([0, 255, 4]));
  f.commit();
  const blob = f.git("rev-parse", `HEAD:${asset}`);
  rmSync(join(f.local, ".git", "objects", blob.slice(0, 2), blob.slice(2)));

  expect(() => f.update()).toThrow(`${asset}: missing Git blob`);
  expect(f.snapshot(skill).toString()).toBe(oldSkill);
  expect(existsSync(f.snapshotPath(asset))).toBe(false);
  expect(f.manifest()).toBe(original);
  expect(f.effects).toEqual([]);
}));

test("rejects a Git symlink without following its target or writing other sources", () => fixture(f => {
  const original = f.select({ source: asset, output: "stamp.bin", kind: "binary" });
  f.putLocal(asset, skill);
  f.git("add", "--all");
  const linkBlob = f.git("hash-object", "-w", asset);
  // Insert a real Git symlink entry without needing host symlink privileges.
  f.git("update-index", "--cacheinfo", `120000,${linkBlob},${asset}`);
  f.git("commit", "--quiet", "-m", "symlink fixture");

  expect(() => f.update()).toThrow(/expected a regular Git blob/);
  expect(f.snapshot(skill).toString()).toBe(oldSkill);
  expect(f.manifest()).toBe(original);
  expect(f.effects).toEqual([]);
}));

test("rejects invalid committed metadata before updating snapshot files", () => fixture(f => {
  const original = f.select();
  f.putLocal(versionPath, JSON.stringify({ version: "01.2.3" }));
  f.commit();
  f.putLocal(versionPath, JSON.stringify({ version: "1.2.3" }));

  expect(() => f.update()).toThrow(/expected a SemVer version/);
  expect(f.snapshot(skill).toString()).toBe(oldSkill);
  expect(f.manifest()).toBe(original);
  expect(f.effects).toEqual([]);
}));

test("preflights later destination paths before writing earlier files", () => fixture(f => {
  const original = f.select({ source: asset, output: "stamp.bin", kind: "binary" });
  f.putLocal(asset, Buffer.from([0, 255]));
  f.commit();
  mkdirSync(f.snapshotPath(asset), { recursive: true });

  expect(() => f.update()).toThrow(/expected a regular file/);
  expect(f.snapshot(skill).toString()).toBe(oldSkill);
  expect(f.manifest()).toBe(original);
  expect(f.effects).toEqual([]);
}));

test("rejects an upstream directory inside the Git worktree rather than silently using the parent", () => fixture(f => {
  const original = f.select();
  f.commit();

  expect(() => f.update(join(f.local, "pstack"))).toThrow(/expected the Git worktree root/);
  expect(f.snapshot(skill).toString()).toBe(oldSkill);
  expect(f.manifest()).toBe(original);
  expect(f.effects).toEqual([]);
}));
