import { lstatSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { readFile, writeFile } from "./files";
import { parseJson, record, relativePath, type Manifest } from "./inputs";

const manifestPath = "manifest.json";
const versionPath = "pstack/.cursor-plugin/plugin.json";
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function localGit(local: string) {
  // Promisor repositories must fail on missing objects, not fetch them. Also
  // deny all transports for Git versions without GIT_NO_LAZY_FETCH.
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "" };
  for (const key of [
    "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_INDEX_FILE", "GIT_NAMESPACE",
  ]) delete env[key];
  return (args: string[], input?: Buffer): Buffer => {
    const result = Bun.spawnSync(["git", "--no-replace-objects", "--literal-pathspecs", ...args], {
      cwd: local, env, stdin: input ?? "ignore", stdout: "pipe", stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      throw new Error(`${local}: git ${args[0]} failed: ${result.stderr.toString("utf8").trim() || `exit ${result.exitCode}`}`);
    }
    return result.stdout;
  };
}

function readCommittedFiles(git: (args: string[], input?: Buffer) => Buffer, revision: string, sources: string[]): Map<string, Buffer> {
  const tree = git(["ls-tree", "--full-tree", "-z", revision, "--", ...sources]);
  const entries = new Map<string, string>();
  for (const entry of tree.toString("utf8").split("\0")) {
    if (!entry) continue;
    const tab = entry.indexOf("\t");
    entries.set(entry.slice(tab + 1), entry.slice(0, tab));
  }
  const objectIds = sources.map(source => {
    const entry = entries.get(source);
    if (!entry) throw new Error(`${source}: missing from Git commit ${revision}`);
    const match = /^100(?:644|755) blob ([0-9a-f]{40}|[0-9a-f]{64})$/.exec(entry);
    if (!match) throw new Error(`${source}: expected a regular Git blob at ${revision}, got ${entry}`);
    return match[1];
  });
  const batch = git(["cat-file", "--batch"], Buffer.from(`${objectIds.join("\n")}\n`));
  const blobs = new Map<string, Buffer>();
  let offset = 0;
  for (const [index, source] of sources.entries()) {
    // --batch uses <oid> blob <byte count> LF, raw bytes, and a final LF.
    const headerEnd = batch.indexOf(10, offset);
    if (headerEnd === -1) throw new Error(`${source}: missing Git blob response at ${revision}`);
    const header = batch.toString("ascii", offset, headerEnd);
    if (header === `${objectIds[index]} missing`) throw new Error(`${source}: missing Git blob at ${revision}`);
    const [oid, type, size, extra] = header.split(" ");
    const bytesStart = headerEnd + 1;
    const bytesEnd = bytesStart + Number(size);
    if (oid !== objectIds[index] || type !== "blob" || !/^\d+$/.test(size) || extra !== undefined || batch[bytesEnd] !== 10) {
      throw new Error(`${source}: invalid Git blob response at ${revision}`);
    }
    blobs.set(source, batch.subarray(bytesStart, bytesEnd));
    offset = bytesEnd + 1;
  }
  return blobs;
}

/** Preflight the pinned inputs and destination paths, then publish the manifest last.
 * Each file replacement is atomic, but the update as a whole is not. If publication
 * fails, effects records completed writes and directory creation; nothing is rolled back.
 */
export function updateUpstream(root: string, local: string, manifest: Manifest, effects: string[]): void {
  const checkout = resolve(local);
  const directory = lstatSync(checkout, { throwIfNoEntry: false });
  if (!directory?.isDirectory() || directory.isSymbolicLink()) {
    throw new Error(`${local}: expected a real local upstream directory`);
  }
  const git = localGit(checkout);
  const top = git(["rev-parse", "--show-toplevel"]).toString("utf8").replace(/\r?\n$/, "");
  if (relative(realpathSync(checkout), realpathSync(top))) throw new Error(`${local}: expected the Git worktree root (${top})`);
  const revision = git(["rev-parse", "--verify", "HEAD^{commit}"]).toString("ascii").trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision)) throw new Error(`${local}: expected a full Git commit ID for HEAD`);

  const sources = new Set<string>();
  const portable = new Map<string, string>();
  for (const { source, origin } of manifest.files) {
    if (origin === "runtime" || sources.has(source)) continue;
    relativePath(source, `${manifestPath}: upstream source`);
    const key = source.toLowerCase();
    const previous = portable.get(key);
    if (previous) throw new Error(`Ambiguous snapshot destinations: upstream/${previous} and upstream/${source}`);
    portable.set(key, source);
    sources.add(source);
  }
  for (const [key, source] of portable) {
    for (let end = key.lastIndexOf("/"); end !== -1; end = key.lastIndexOf("/", end - 1)) {
      const ancestor = portable.get(key.slice(0, end));
      if (ancestor) throw new Error(`Conflicting snapshot destinations: upstream/${ancestor} and upstream/${source}`);
    }
  }
  const blobs = readCommittedFiles(git, revision, [...new Set([...sources, versionPath])]);
  const plugin = record(parseJson(blobs.get(versionPath)!, versionPath), versionPath);
  if (typeof plugin.version !== "string" || semver.exec(plugin.version)?.[0] !== plugin.version) {
    throw new Error(`${versionPath}: expected a SemVer version`);
  }

  // Parse the original document, not the validated projection, so extra fields survive.
  const original = readFile(root, manifestPath);
  if (!original) throw new Error(`${manifestPath}: missing input file`);
  const doc = record(parseJson(original, manifestPath), manifestPath);
  const upstream = record(doc.upstream, `${manifestPath}: upstream`);
  const version = `pstack ${plugin.version}`;
  let updated: Buffer | undefined;
  if (upstream.revision !== revision || upstream.version !== version) {
    upstream.revision = revision;
    upstream.version = version;
    updated = Buffer.from(`${JSON.stringify(doc, null, 2)}\n`);
  }

  const writes: { path: string; bytes: Buffer }[] = [];
  for (const source of sources) {
    const path = `upstream/${source}`;
    const bytes = blobs.get(source)!;
    if (!readFile(root, path)?.equals(bytes)) writes.push({ path, bytes });
  }
  for (const { path, bytes } of writes) writeFile(root, path, bytes, effects);
  if (updated) writeFile(root, manifestPath, updated, effects);
}
