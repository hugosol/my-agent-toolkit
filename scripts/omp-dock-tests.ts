import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { beginHarnessAcceptance, type HarnessAcceptanceOptions, type HarnessCli } from "./support/harness-acceptance";
import { resolveInstalledOmp } from "../tests/harness-dock/installed-omp";

function xmlAttributes(source: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	for (const match of source.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
		attributes[match[1]!] = (match[2] ?? match[3]!).replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
			const named: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
			return named[entity] ?? String.fromCodePoint(entity[2] === "x" ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
		});
	}
	return attributes;
}

/** Read Bun's generated JUnit structure, never infer execution from source text. */
export function hasCompleteOmpReport(xml: string, expectedFiles: readonly string[], repoRoot: string): boolean {
	if (!/<testsuites\b/.test(xml) || !/<\/testsuites>\s*$/.test(xml)) return false;
	if (/<(?:skipped|todo|failure|error|flakyFailure|rerunFailure)\b/.test(xml)) return false;
	const cases = [...xml.matchAll(/<testcase\b([^>]*)>/g)];
	if (cases.length === 0) return false;
	const files = new Set<string>();
	const normalize = (file: string) => path.relative(repoRoot, path.resolve(repoRoot, file)).replace(/\\/g, "/");
	for (const match of xml.matchAll(/<testsuites?\b([^>]*)>/g)) {
		const attributes = xmlAttributes(match[1]!);
		for (const count of ["failures", "errors", "skipped", "todo", "disabled"]) {
			if (attributes[count] !== undefined && !/^0$/.test(attributes[count]!)) return false;
		}
		if (attributes.tests !== undefined && (!/^\d+$/.test(attributes.tests) || Number(attributes.tests) === 0)) return false;
		if (match[0].startsWith("<testsuites") && attributes.tests !== undefined && Number(attributes.tests) !== cases.length) return false;
		if (attributes.file) {
			files.add(normalize(attributes.file));
		}
		// Older Bun reports use the file path as the suite name.
		if (attributes.name) files.add(normalize(attributes.name));
	}
	for (const match of cases) {
		const attributes = xmlAttributes(match[1]!);
		if (attributes.file) files.add(normalize(attributes.file));
	}
	return expectedFiles.length > 0 && expectedFiles.every(file => files.has(normalize(file)));
}

async function expectedTestFiles(repoRoot: string, all: boolean): Promise<string[]> {
	const directory = all ? repoRoot : path.join(repoRoot, "tests/harness-dock");
	const files: string[] = [];
	const directories = [directory];
	while (directories.length) {
		const current = directories.pop()!;
		for (const entry of await readdir(current, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const candidate = path.join(current, entry.name);
			if (entry.isDirectory()) directories.push(candidate);
			else if (entry.isFile() && /(?:[._](?:test|spec))\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)) files.push(path.relative(repoRoot, candidate));
		}
	}
	return files;
}

export interface OmpTestOptions extends HarnessAcceptanceOptions {
	readonly all?: boolean;
	/** Explicit invocation for controlled runner-policy tests; never host behavior evidence. */
	readonly cli?: HarnessCli;
}

/** Unknown arguments are allowed through, but cannot certify a complete scope. */
export function isCompleteOmpRun(args: readonly string[], env: NodeJS.ProcessEnv = process.env): boolean {
	return !env.CHIEF_MAP_UNAVAILABLE_HOST && (args.length === 0 || (args.length === 1 && args[0] === "--parallel=4"));
}

export async function runOmpTests(args: readonly string[], options: OmpTestOptions = {}): Promise<number> {
	const repoRoot = path.resolve(options.repoRoot ?? path.join(import.meta.dir, ".."));
	const scope = options.all ? "full-repository" : "dock";
	const acceptance = await beginHarnessAcceptance("omp", scope, options.cli ?? (async () => {
		const installed = await resolveInstalledOmp();
		return { path: installed.argvPrefix[0] ?? installed.path, command: [installed.path, ...installed.argvPrefix], source: "locally selected installed OMP" };
	}), { ...options, repoRoot });
	const cli = acceptance.cli;
	const argv = [process.execPath, "test", ...(options.all ? [] : ["tests/harness-dock"]), ...args];
	const eligible = isCompleteOmpRun(args);
	console.log(`OMP ${acceptance.version} (${cli.path}); ${scope}; unfiltered=${eligible}`);
	let reportRoot: string | undefined;
	try {
		const expectedFiles = await expectedTestFiles(repoRoot, options.all ?? false);
		reportRoot = await mkdtemp(path.join(os.tmpdir(), "omp-test-report-"));
		const reportPath = path.join(reportRoot, "results.xml");
		const child = Bun.spawn([...argv, "--reporter=junit", `--reporter-outfile=${reportPath}`], { cwd: repoRoot, env: { ...process.env, OMP_CLI: cli.path }, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
		const code = await child.exited;
		let reportComplete = false;
		let reportDetail: string;
		try {
			reportComplete = hasCompleteOmpReport(await readFile(reportPath, "utf8"), expectedFiles, repoRoot);
			reportDetail = reportComplete ? "JUnit confirms nonempty, unskipped execution of every expected file." : "JUnit does not confirm complete, nonempty, unskipped execution of every expected file.";
		} catch (error) {
			reportDetail = `JUnit evidence unavailable: ${String(error)}`;
		}
		const complete = eligible && code === 0 && reportComplete;
		await acceptance.finish({ status: code === 0 ? "passed" : "failed", complete,
			checks: [argv.slice(1).join(" ")], detail: `Suite exit ${code}. ${reportDetail}${complete ? "" : " No complete-scope promotion."}` });
		return code;
	} catch (error) {
		await acceptance.finish({ status: "failed", complete: false, checks: [argv.slice(1).join(" ")], detail: String(error) });
		throw error;
	} finally {
		if (reportRoot) await rm(reportRoot, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const all = args[0] === "--all";
	if (all) args.shift();
	try {
		process.exitCode = await runOmpTests(args, { all });
	} catch (error) {
		console.error(String(error));
		process.exitCode = 1;
	}
}
