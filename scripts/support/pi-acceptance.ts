import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PiCli } from "../../tests/harness-dock/pi-session";

export interface PiAcceptanceOptions {
	readonly repoRoot?: string;
	readonly recordPath?: string;
	readonly evidenceDir?: string;
	readonly lockTimeoutMs?: number;
}

export interface PiAcceptanceResult {
	readonly status: "passed" | "failed" | "blocked";
	readonly checks: readonly string[];
	readonly complete: boolean;
	readonly detail?: string;
}

export interface PiAcceptanceRun {
	readonly version: string;
	finish(result: PiAcceptanceResult): Promise<void>;
}

type JsonRecord = Record<string, unknown>;
interface AcceptanceEntry {
	version: string;
	scope: string;
	checks: readonly string[];
	acceptedAt: string;
	[key: string]: unknown;
}
interface AcceptanceRecord {
	schemaVersion: 1;
	scopes: Record<string, AcceptanceEntry>;
}

/** Strict SemVer 2.0.0, including numeric prerelease identifiers without leading zeros. */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseVersion(version: string): RegExpExecArray {
	const parsed = SEMVER.exec(version);
	if (!parsed || parsed[0] !== version) throw new Error(`Invalid Pi version ${JSON.stringify(version)}: expected strict SemVer (for example 1.2.3 or 1.2.3-rc.1).`);
	return parsed;
}

/** Build metadata identifies the exercised artifact but does not affect SemVer precedence. */
export function comparePiVersions(left: string, right: string): number {
	const a = parseVersion(left);
	const b = parseVersion(right);
	for (let index = 1; index <= 3; index++) {
		const x = BigInt(a[index]!);
		const y = BigInt(b[index]!);
		if (x !== y) return x < y ? -1 : 1;
	}
	if (a[4] === b[4]) return 0;
	if (a[4] === undefined) return 1;
	if (b[4] === undefined) return -1;
	const x = a[4].split(".");
	const y = b[4].split(".");
	for (let index = 0; index < Math.max(x.length, y.length); index++) {
		const l = x[index];
		const r = y[index];
		if (l === undefined) return -1;
		if (r === undefined) return 1;
		if (l === r) continue;
		const ln = /^\d+$/.test(l);
		const rn = /^\d+$/.test(r);
		if (ln && rn) return BigInt(l) < BigInt(r) ? -1 : 1;
		if (ln !== rn) return ln ? -1 : 1;
		return l < r ? -1 : 1;
	}
	return 0;
}

export function rejectLegacyPiVersionArgument(args: readonly string[] = process.argv.slice(2)): void {
	if (args.some((arg) => arg === "--expect-pi-version" || arg.startsWith("--expect-pi-version="))) {
		throw new Error("--expect-pi-version has been removed. Select the actual locally installed Pi with --pi, PI_CLI, or PATH; acceptance compares its reported version against the highest passed version for this scope.");
	}
}

async function metadataProcess(argv: readonly string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
	const child = Bun.spawn([...argv], { cwd, stdout: "pipe", stderr: "pipe" });
	const timeout = Promise.withResolvers<never>();
	const timer = setTimeout(() => {
		child.kill("SIGKILL");
		timeout.reject(new Error(`Pi acceptance metadata command timed out after 4000ms: ${argv.join(" ")}`));
	}, 4_000);
	try {
		return await Promise.race([
			Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]).then(([stdout, stderr, code]) => ({ stdout, stderr, code })),
			timeout.promise,
		]);
	} finally {
		clearTimeout(timer);
	}
}

async function command(argv: readonly string[], cwd: string): Promise<string> {
	const { stdout, stderr, code } = await metadataProcess(argv, cwd);
	if (code !== 0) throw new Error(`${argv[0]} exited ${code}: ${stderr.trim()}`);
	return stdout;
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

async function sourceState(repoRoot: string, recordPath: string, evidenceDir: string): Promise<JsonRecord> {
	const exclusions = [recordPath, `${recordPath}.*`, evidenceDir].flatMap((file) => {
		const relative = path.relative(repoRoot, file).replace(/\\/g, "/");
		return relative.startsWith("../") || path.isAbsolute(relative) ? [] : [`:(exclude)${relative}`];
	});
	const paths = ["--", ".", ...exclusions];
	const [head, status, diff, untracked] = await Promise.all([
		command(["git", "rev-parse", "HEAD"], repoRoot),
		command(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all", ...paths], repoRoot),
		command(["git", "diff", "HEAD", "--binary", "--no-ext-diff", ...paths], repoRoot),
		command(["git", "ls-files", "--others", "--exclude-standard", "-z", ...paths], repoRoot),
	]);
	const untrackedFiles = await Promise.all(untracked.split("\0").filter(Boolean).sort().map(async (file) => ({ path: file, sha256: sha256(await readFile(path.join(repoRoot, file))) })));
	return { repoRoot, head: head.trim(), status: status.split("\0").filter(Boolean), diffSha256: sha256(diff), untrackedFiles, sha256: sha256(JSON.stringify([head.trim(), status, sha256(diff), untrackedFiles])) };
}

async function lockfiles(repoRoot: string): Promise<JsonRecord[]> {
	const result: JsonRecord[] = [];
	for (const name of ["bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]) {
		try {
			const bytes = await readFile(path.join(repoRoot, name));
			result.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return result;
}

async function runtime(cli: PiCli, repoRoot: string): Promise<JsonRecord> {
	const artifact = await readFile(cli.path);
	let cliRuntime: unknown;
	let interpreter = cli.command.length >= 2 && /\.(?:c|m)?js$/i.test(cli.command[1]!) ? cli.command[0] : undefined;
	if (!interpreter && cli.command.length === 1) {
		const firstLine = artifact.subarray(0, 512).toString("utf8").split("\n", 1)[0]!.trim();
		const shebang = /^#!\s*(\S+)(?:\s+(.*))?$/.exec(firstLine);
		if (shebang && /(?:^|[/\\])(?:node|bun)(?:\.exe)?$/.test(shebang[1]!)) interpreter = shebang[1];
		if (shebang && /(?:^|\/)env$/.test(shebang[1]!) && /^(?:node|bun)$/.test(shebang[2] ?? "")) interpreter = shebang[2];
	}
	// Never substitute the driver's Node compatibility version for a hidden CLI runtime.
	if (interpreter) {
		try {
			cliRuntime = JSON.parse(await command([interpreter, "-p", "JSON.stringify({execPath:process.execPath,node:process.versions.node,bun:process.versions.bun??null})"], repoRoot));
		} catch (error) {
			cliRuntime = { known: false, detail: String(error) };
		}
	} else {
		cliRuntime = { known: false, detail: "Selected executable does not expose its interpreter in the CLI argv prefix." };
	}
	return { driver: { executable: process.execPath, node: process.versions.node, bun: Bun.version }, cli: cliRuntime, artifact: { path: cli.path, bytes: artifact.length, sha256: sha256(artifact) }, platform: process.platform, arch: process.arch };
}

async function readRecord(recordPath: string): Promise<AcceptanceRecord> {
	let parsed: AcceptanceRecord;
	try {
		parsed = JSON.parse(await readFile(recordPath, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, scopes: {} };
		throw error;
	}
	if (!parsed || parsed.schemaVersion !== 1 || !parsed.scopes || typeof parsed.scopes !== "object" || Array.isArray(parsed.scopes)) throw new Error(`Invalid Pi acceptance record: ${recordPath}`);
	for (const [scope, entry] of Object.entries(parsed.scopes)) {
		if (!entry || typeof entry.version !== "string" || entry.scope !== scope) throw new Error(`Invalid Pi acceptance scope: ${scope}`);
		parseVersion(entry.version);
	}
	return parsed;
}

async function atomicJson(destination: string, value: unknown): Promise<void> {
	await mkdir(path.dirname(destination), { recursive: true });
	const temporary = `${destination}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
		await rename(temporary, destination);
	} finally {
		await rm(temporary, { force: true });
	}
}

async function withRecordLock<T>(recordPath: string, timeoutMs: number, action: () => Promise<T>): Promise<T> {
	await mkdir(path.dirname(recordPath), { recursive: true });
	const lock = `${recordPath}.lock`;
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			await mkdir(lock);
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			if (Date.now() >= deadline) throw new Error(`Timed out waiting for Pi acceptance record lock: ${lock}`);
			await Bun.sleep(Math.min(25, Math.max(1, deadline - Date.now())));
		}
	}
	try {
		return await action();
	} finally {
		await rm(lock, { recursive: true, force: true });
	}
}

export async function beginPiAcceptance(scope: string, cli: PiCli, options: PiAcceptanceOptions = {}): Promise<PiAcceptanceRun> {
	const repoRoot = path.resolve(options.repoRoot ?? path.join(import.meta.dir, "../.."));
	const recordPath = path.resolve(options.recordPath ?? path.join(repoRoot, "framework/docs/pi-acceptance.json"));
	const evidenceDir = path.resolve(options.evidenceDir ?? path.join(repoRoot, ".scratch/pi-version-acceptance/evidence"));
	const timeoutMs = options.lockTimeoutMs ?? 5_000;
	if (!scope.trim()) throw new Error("Pi acceptance scope must not be empty.");
	if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error("Pi acceptance lock timeout must be finite and nonnegative.");
	const startedAt = new Date().toISOString();
	const evidencePath = path.join(evidenceDir, `${startedAt.replace(/[:.]/g, "-")}-${randomUUID()}.json`);
	const evidence: JsonRecord = { schemaVersion: 1, scope, startedAt, cli: { ...cli, command: [...cli.command] } };
	let version: string;
	try {
		[evidence.source, evidence.lockfiles, evidence.runtime] = await Promise.all([sourceState(repoRoot, recordPath, evidenceDir), lockfiles(repoRoot), runtime(cli, repoRoot)]);
		rejectLegacyPiVersionArgument();
		const { stdout, stderr, code } = await metadataProcess([...cli.command, "--version"], repoRoot);
		version = stdout.trim() || stderr.trim();
		evidence.version = version;
		if (code !== 0) throw new Error(`Could not read Pi version from ${cli.path}: exit ${code}, output ${version || "<empty>"}`);
		parseVersion(version);
		const scopes = (await readRecord(recordPath)).scopes;
		const previous = Object.prototype.hasOwnProperty.call(scopes, scope) ? scopes[scope] : undefined;
		if (previous && comparePiVersions(version, previous.version) < 0) throw new Error(`Pi ${version} at ${cli.path} is below the highest passed version ${previous.version} for scope ${scope}. Select a qualifying local CLI with --pi, PI_CLI, or PATH.`);
		await atomicJson(evidencePath, { ...evidence, status: "running" });
	} catch (error) {
		await atomicJson(evidencePath, { ...evidence, status: "blocked", complete: false, checks: [], finishedAt: new Date().toISOString(), detail: String(error) });
		throw error;
	}
	let finished: Promise<void> | undefined;
	return {
		version,
		finish(result) {
			if (finished) return finished;
			finished = (async () => {
				const finishedAt = new Date().toISOString();
				const completed: JsonRecord = { ...evidence, ...result, checks: [...result.checks], finishedAt };
				try {
					const finishedSource = await sourceState(repoRoot, recordPath, evidenceDir);
					completed.finishedSource = finishedSource;
					completed.finishedLockfiles = await lockfiles(repoRoot);
					await atomicJson(evidencePath, completed);
					if (result.status !== "passed" || !result.complete) return;
					if (finishedSource.sha256 !== (evidence.source as JsonRecord).sha256) throw new Error("Source changed during Pi acceptance; rerun the complete scope on a stable source tree before promotion.");
					await withRecordLock(recordPath, timeoutMs, async () => {
						const record = await readRecord(recordPath);
						const previous = Object.prototype.hasOwnProperty.call(record.scopes, scope) ? record.scopes[scope] : undefined;
						if (previous && comparePiVersions(version, previous.version) < 0) throw new Error(`Pi ${version} at ${cli.path} cannot replace concurrently accepted ${previous.version} for scope ${scope}.`);
						const entry: AcceptanceEntry = { ...completed, version, scope, checks: [...result.checks], acceptedAt: finishedAt };
						Object.defineProperty(record.scopes, scope, { value: entry, enumerable: true, configurable: true, writable: true });
						await atomicJson(recordPath, record);
					});
				} catch (error) {
					await atomicJson(evidencePath, { ...completed, status: "blocked", publicationError: String(error) });
					throw error;
				}
			})();
			return finished;
		},
	};
}
