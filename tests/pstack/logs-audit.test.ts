import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const delivered = resolve(import.meta.dir, "../../pstack-suite/generated/skills");

function gitBash() {
  const selected = process.env.PSTACK_GIT_BASH;
  if (selected) return selected;
  if (process.platform !== "win32") return "bash";
  const git = Bun.which("git");
  const bash = git && join(dirname(dirname(git)), "bin", "bash.exe");
  if (!bash || !existsSync(bash)) throw new Error("Set PSTACK_GIT_BASH to the installed Git for Windows bin/bash.exe.");
  return bash;
}

function shell(root: string, script: string, args: string[], env = process.env) {
  // Send literal control characters as bytes, not through Windows argv quoting.
  // Git Bash then passes those exact arguments to the shipped script.
  const argv = [gitBash(), "--noprofile", "--norc", "-c", 'mapfile -d "" -t args; exec bash "$1" "${args[@]}"', "_", script];
  return { ...run(root, argv, env, Buffer.from(`${args.join("\0")}\0`)), scriptArgs: args };
}

function run(cwd: string, argv: string[], env = process.env, stdin?: Buffer) {
  const child = Bun.spawnSync(argv, { cwd, env, stdin, timeout: 30_000, stdout: "pipe", stderr: "pipe" });
  return { cwd, argv, pid: child.pid, exit: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

function evidence(name: string, facts: Record<string, unknown>) {
  const dir = process.env.PSTACK_LOGS_AUDIT_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ platform: process.platform, bun: Bun.version, ...facts }, null, 2));
}

test("logs-audit P37 P36-log P41 appends safe TSV bytes without rewriting prior decisions", () => {
  // S3: execute the delivered helper. The upstream TSV method specifies an
  // append-only file, one header and formula-safe single-line cells. A helper
  // that emits tabs/line breaks or truncates earlier decisions cannot pass the byte check.
  const root = mkdtempSync(join(tmpdir(), "pstack decision evidence-"));
  const log = join(root, "decision evidence", "run.tsv");
  const script = join(delivered, "show-me-your-work", "scripts", "log.sh");
  const observed: Record<string, unknown> = { root, log };
  try {
    const first = observed.first = shell(root, script, [log, "planning\tphase", "=1+2", "+理由\r\nsecond line", "-evidence\nfile", "@pending"]);
    expect(first.exit, first.stderr).toBe(0);
    const initial = readFileSync(log);
    const ts = String(initial).split("\n")[1]?.split("\t")[0];
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(initial.equals(Buffer.from(`ts\tphase\tdecision\twhy\tevidence\tresult\n${ts}\tplanning phase\t'=1+2\t'+理由  second line\t'-evidence file\t'@pending\n`))).toBe(true);

    observed.initialHex = initial.toString("hex");
    const second = observed.second = shell(root, script, [log, "start", "Continue", "checkpoint read", "owned:run-2", ""]);
    expect(second.exit, second.stderr).toBe(0);
    const appended = readFileSync(log);
    const nextTs = String(appended).split("\n")[2]?.split("\t")[0];
    expect(nextTs).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(appended.subarray(0, initial.length).equals(initial)).toBe(true);
    expect(appended.subarray(initial.length).equals(Buffer.from(`${nextTs}\tstart\tContinue\tcheckpoint read\towned:run-2\t\n`))).toBe(true);

    observed.appendedHex = appended.toString("hex");
    const invalid = observed.invalid = shell(root, script, [log, "start"]);
    expect(invalid.exit).toBe(1);
    expect(invalid.stderr).toContain("usage: log.sh");
    expect(readFileSync(log).equals(appended)).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    evidence("decision-log", { ...observed, removed: !existsSync(root) });
    expect(existsSync(root)).toBe(false);
  }
});

test("logs-audit P37 P36-log audits owned worktrees without deleting them and reports fetch and failures", () => {
  // S3: the shipped report and actual Git effects are observable. A report
  // using stale refs or whitespace-split worktree paths would misclassify this
  // fixture, even if it exited successfully or printed a plausible table.
  const root = mkdtempSync(join(tmpdir(), "pstack worktree evidence-"));
  const tree = (name: string) => join(root, name).replace(/\\/g, "/");
  const repo = tree("main repo");
  const origin = tree("origin repo.git");
  const temp = join(root, "temporary files");
  const fetchHead = join(repo, ".git", "FETCH_HEAD");
  const merged = tree("merged clean");
  const scratch = tree("merged with scratch");
  const wip = tree("merged with wip");
  const pending = tree("pending work");
  const detached = tree("detached head");
  const observed: Record<string, unknown> = { root, repo, origin };
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GIT_|BASH_ENV$)/i.test(key))),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "no-global-git"), GIT_ALLOW_PROTOCOL: "file",
    GIT_TERMINAL_PROMPT: "0", HOME: root, USERPROFILE: root, TEMP: temp, TMP: temp, TMPDIR: temp, LC_ALL: "C",
  };
  const git = (cwd: string, ...args: string[]) => {
    const result = run(cwd, ["git", ...args], env);
    expect(result.exit, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    return result.stdout.trimEnd();
  };
  const snapshot = () => ({
    refs: git(repo, "show-ref"), remoteRefs: git(origin, "show-ref"),
    fetchHead: existsSync(fetchHead) ? readFileSync(fetchHead, "utf8") : null,
    worktrees: git(repo, "worktree", "list", "--porcelain"),
    wip: readFileSync(join(wip, "tracked.txt"), "utf8"),
    scratch: readFileSync(join(scratch, "reviewer evidence.txt"), "utf8"),
    temp: readdirSync(temp),
  });
  const audit = (label: string, ...args: string[]) => {
    const result = shell(root, join(delivered, "poteto-mode", "scripts", "worktree-audit.sh"), ["--no-pr", ...args], env);
    observed[label] = result;
    return result;
  };
  const rows = (stdout: string) => Object.fromEntries(stdout.trimEnd().split("\n").slice(2).map(line => {
    const [size, age, merged, dirty, remote, pr, lastChat, bucket, path] = line.split("\t");
    expect(size).toMatch(/^\d/);
    expect(age).toMatch(/^\d+d$/);
    return [path, [merged, dirty, remote, pr, lastChat, bucket]];
  }));
  try {
    mkdirSync(temp);
    git(root, "init", "--bare", "--initial-branch=main", origin);
    git(root, "init", "--initial-branch=main", repo);
    git(repo, "config", "user.name", "Owned Audit Fixture");
    git(repo, "config", "user.email", "pstack-audit@example.invalid");
    git(repo, "config", "core.autocrlf", "false");
    writeFileSync(join(repo, "tracked.txt"), "base\n");
    git(repo, "add", "tracked.txt");
    git(repo, "commit", "-m", "Base");
    const base = git(repo, "rev-parse", "HEAD");
    git(repo, "remote", "add", "origin", origin);
    git(repo, "push", "origin", "main");
    git(repo, "worktree", "add", "-b", "merged", merged);
    git(repo, "worktree", "add", "-b", "scratch", scratch);
    git(repo, "worktree", "add", "-b", "wip", wip);
    git(repo, "worktree", "add", "-b", "pending", pending);
    git(repo, "worktree", "add", "--detach", detached, base);
    writeFileSync(join(wip, "tracked.txt"), "review this WIP\n");
    writeFileSync(join(scratch, "reviewer evidence.txt"), "keep this evidence\n");
    git(merged, "commit", "--allow-empty", "-m", "Landed after the clone's last fetch");
    const landed = git(merged, "rev-parse", "HEAD");
    git(merged, "push", "origin", "HEAD:refs/heads/main", "HEAD:refs/heads/merged");
    git(repo, "update-ref", "refs/remotes/origin/main", base, landed);
    const remoteHead = git(origin, "-c", "user.name=Owned Audit Fixture", "-c", "user.email=pstack-audit@example.invalid",
      "commit-tree", `${landed}^{tree}`, "-p", landed, "-m", "Created only at the owned remote");
    git(origin, "update-ref", "refs/heads/main", remoteHead, landed);
    git(pending, "commit", "--allow-empty", "-m", "Unmerged work");
    observed.gitVersion = git(repo, "--version");
    const before = observed.before = snapshot();
    expect(before.fetchHead).toBeNull();
    const objectBefore = observed.objectBefore = run(repo, ["git", "cat-file", "-e", remoteHead], env);
    expect(objectBefore.exit).not.toBe(0);

    const result = audit("audit", "-b", "origin/main", repo);
    expect(result.exit, result.stderr).toBe(0);
    expect(result.stdout).toStartWith("# base: origin/main\nSIZE\tAGE\tMERGED\tDIRTY\tREMOTE\tPR\tLAST_CHAT\tBUCKET\tWORKTREE\n");
    expect(rows(result.stdout)).toEqual({
      [merged]: ["YES", "clean", "pushed", "-", "-", "safe"],
      [scratch]: ["YES", "scratch:1", "no-remote", "-", "-", "safe"],
      [wip]: ["YES", "wip:1", "no-remote", "-", "-", "hold-wip"],
      [pending]: ["no", "clean", "no-remote", "-", "-", "review"],
      [detached]: ["YES", "clean", "detached", "-", "-", "safe"],
    });
    const after = observed.after = snapshot();
    expect(after.fetchHead).toStartWith(`${remoteHead}\t`);
    expect(after).toEqual({ ...before, refs: before.refs.replace(`${base} refs/remotes/origin/main`, `${remoteHead} refs/remotes/origin/main`), fetchHead: after.fetchHead });
    const objectAfter = observed.objectAfter = run(repo, ["git", "cat-file", "-p", remoteHead], env);
    expect(objectAfter.exit, objectAfter.stderr).toBe(0);
    expect(objectAfter.stdout).toEndWith("\nCreated only at the owned remote\n");

    const local = audit("localBase", "--base", "main", repo);
    expect(local.exit, local.stderr).toBe(0);
    expect(rows(local.stdout)[merged]).toEqual(["no", "clean", "pushed", "-", "-", "review"]);
    expect(snapshot()).toEqual(after);

    const invalid = audit("invalid", "--base");
    expect(invalid.exit).toBe(2);
    expect(invalid.stderr).toContain("--base needs a ref");
    expect(invalid.stdout).toBe("");
    expect(snapshot()).toEqual(after);
    const missing = audit("missing", "--base", "missing-base", repo);
    expect(missing.exit).toBe(1);
    expect(missing.stderr).toContain("base ref not found: missing-base");
    expect(missing.stdout).toBe("");
    expect(snapshot()).toEqual(after);

    git(repo, "remote", "set-url", "origin", tree("missing origin.git"));
    const stale = audit("stale", "-b", "origin/main", repo);
    expect(stale.exit, stale.stderr).toBe(0);
    expect(stale.stderr).toContain("could not fetch origin/main; merged column may be stale");
    expect(rows(stale.stdout)).toEqual(rows(result.stdout));
    const afterFailedFetch = observed.afterFailedFetch = snapshot();
    // FETCH_HEAD can be rewritten even on a failed fetch; preserve the raw
    // observation without asserting a Git-version-specific failed-fetch format.
    expect(afterFailedFetch).toEqual({ ...after, fetchHead: afterFailedFetch.fetchHead });
  } finally {
    rmSync(root, { recursive: true, force: true });
    evidence("worktree-audit", { ...observed, removed: !existsSync(root) });
    expect(existsSync(root)).toBe(false);
  }
}, 60_000);
