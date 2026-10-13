/**
 * Host patch artifacts: the isolated exact install of the recorded harness with one or more local
 * patches applied on top of it.
 *
 * A ticket that needs a host behaviour the pinned revision does not have has to hand the rest of
 * the migration a *runnable* host that carries it — not a source checkout that cannot run a session,
 * and not a probe. This module materialises such a host the way the dock already materialises the
 * baseline: one isolated prefix under `.cache/omp-baseline/`, built from the recorded exact version,
 * then patched by the committed `patch.diff` files the artifact names and verified against a
 * `record.json`.
 *
 * What is frozen, and where, for every artifact:
 *
 * - the base: the recorded supported version and revision anchor in `framework/docs/harness-baseline.json`;
 * - the change: every patch in the artifact's chain, whose sha256 the record carries;
 * - the artifact: the `record.json` next to the record, holding the pre-patch and post-patch sha256 of
 *   every file the chain touches — each patch's pre-patch hashes tie the install it was applied to to
 *   the base (or to the previous patch in the chain), and the final post-patch hashes tie a run to the
 *   frozen artifact.
 *
 * `record.json` is written once, by the first materialisation after it is removed; every later
 * materialisation verifies against it and refuses to run a host whose bytes are not the frozen ones.
 * Re-freezing after a deliberate patch edit is therefore: edit the patch, delete the record,
 * materialise. Isolation is unchanged from the dock: the install and every run stay under the
 * isolated prefix and a temporary run root, and the default global install, the formal configuration
 * and any running agent are never touched.
 *
 * A patch may touch more than the supported package: each chain entry names the directory its own
 * paths are relative to, so one artifact can carry changes in two installed packages of the same
 * version without either being applied to a path it does not own. An artifact with a chain of more
 * than one patch is how the migration's final host is described: the accepted host carries every
 * locally required behaviour at once, on one install, rather than one behavior per install.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
	type BaselineRecord,
	type IsolatedHarness,
	type IsolatedHarnessLayout,
	REPO_ROOT,
	describeHarness,
	isolatedHarnessPrefix,
	sha256File,
} from "./baseline";

/** One file the chain touches, with the hashes that freeze it. */
export interface PatchArtifactFile {
	/** Path inside the artifact's patch root (for example `src/sdk.ts`, or `pi-ai/src/x.ts`). */
	readonly path: string;
	/** sha256 of the file as the patch that touches it was applied to it, before it. */
	readonly baseSha256: string;
	/** sha256 of the file in the patched artifact. */
	readonly patchedSha256: string;
}

/** One patch of an artifact's chain, as the record freezes it. */
export interface PatchRecordEntry {
	/** The committed unified diff, relative to this repository. */
	readonly file: string;
	/** sha256 of that patch file, so an edited patch cannot pass as the frozen one. */
	readonly sha256: string;
	/** Every file this patch touches, with its pre-patch and post-patch bytes. */
	readonly files: readonly PatchArtifactFile[];
}

/** The frozen description of one patched host artifact. */
export interface PatchArtifactRecord {
	readonly recorded: string;
	readonly harness: {
		readonly package: string;
		readonly version: string;
		readonly revisionAnchor: { readonly path: string; readonly commit: string; readonly tag?: string };
	};
	/** The artifact's patch chain, in application order: what was applied, and to which bytes. */
	readonly patches: readonly PatchRecordEntry[];
	readonly materialise: {
		readonly prefix: string;
		readonly install: string;
		/** One `git apply` command per patch, in chain order. */
		readonly apply: readonly string[];
	};
	readonly runtime: { readonly cliEntry: string; readonly load: string };
	readonly environment: { readonly platform: string; readonly arch: string; readonly bun: string };
}

/** One patch of an artifact's chain, as the artifact names it. */
export interface PatchChainEntry {
	/** The committed unified diff that carries this part of the change. */
	readonly patchFile: string;
	/**
	 * The directory this patch's own paths are relative to, inside one materialised prefix.
	 *
	 * Defaults to the scope directory holding the supported package (`node_modules/@oh-my-pi`), which
	 * is where a patch that also touches another package of the same version is applied from. A patch
	 * that only touches the supported package's own files passes `layout => layout.packageRoot`.
	 */
	readonly patchRoot?: (layout: IsolatedHarnessLayout) => string;
}

/** One artifact's own names, and the patch chain applied inside it. */
export interface PatchArtifact {
	/** The committed unified diffs that together carry the change, in application order. */
	readonly patchFiles: readonly PatchChainEntry[];
	/** The committed record that freezes them. */
	readonly recordFile: string;
	/**
	 * Directory-name segment of the patched prefix. It names the base version and the patch chain on
	 * top of it, so the artifact never shares a prefix with the unpatched baseline install or with
	 * another artifact.
	 */
	readonly prefixLabel: string;
	/** Manifest written next to the patched install, recording what was materialised there. */
	readonly manifestName: string;
	/** Name of the staging prefix's own `package.json`, so the install describes itself honestly. */
	readonly prefixName: string;
}

/** What a file the patch creates hashes to before the patch runs. */
export const PATCH_ABSENT = "<absent>";

/** The record's date in this machine's time zone, spelled the way the sibling baseline record is. */
function localDate(now: Date = new Date()): string {
	return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
}

/** Every file a unified diff touches, in patch order. */
export function patchTouchedFiles(patchText: string): string[] {
	const files: string[] = [];
	for (const line of patchText.split("\n")) {
		const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
		const target = match?.[2];
		if (target !== undefined && !files.includes(target)) files.push(target);
	}
	return files;
}

/** The directory one chain entry's patch is applied inside, for one materialised prefix. */
export function patchRootOf(entry: PatchChainEntry, layout: IsolatedHarnessLayout): string {
	return entry.patchRoot?.(layout) ?? path.dirname(layout.packageRoot);
}

/**
 * One artifact's prefix layout. The prefix is a sibling of the recorded install's prefix, so a
 * patched host never reuses or overwrites the baseline artifact.
 */
export function patchArtifactLayout(
	record: BaselineRecord,
	artifact: PatchArtifact,
	repoRoot: string = REPO_ROOT,
): IsolatedHarnessLayout {
	const prefix = path.join(
		path.dirname(isolatedHarnessPrefix(record, record.harness.supportedVersion, repoRoot)),
		artifact.prefixLabel,
	);
	return {
		prefix,
		packageRoot: path.join(prefix, "node_modules", record.harness.package),
		cliPath: path.join(prefix, "node_modules", record.harness.package, record.harness.acceptanceArtifact.cliEntry),
	};
}

/** The prefix package that pins the base version, exactly as the baseline install does. */
function prefixManifest(record: BaselineRecord, artifact: PatchArtifact): string {
	return `${JSON.stringify(
		{
			name: artifact.prefixName,
			private: true,
			dependencies: { [record.harness.package]: record.harness.supportedVersion },
		},
		null,
		"\t",
	)}\n`;
}

function readJson(file: string): unknown {
	return JSON.parse(readFileSync(file, "utf8"));
}

/** One artifact's frozen record, when the repository carries one. */
export function readPatchArtifactRecord(
	artifact: PatchArtifact,
	file: string = artifact.recordFile,
): PatchArtifactRecord | undefined {
	return existsSync(file) ? (readJson(file) as PatchArtifactRecord) : undefined;
}

/**
 * sha256 of one directory's own files.
 *
 * A file the final tree is missing is an error rather than a read failure; the files a patch creates
 * have no bytes before it runs, so that half tolerates their absence and records {@link PATCH_ABSENT}.
 */
function hashesOf(root: string, files: readonly string[], tolerateMissing: boolean): Map<string, string> {
	const hashes = new Map<string, string>();
	for (const file of files) {
		const absolute = path.join(root, file);
		if (existsSync(absolute)) hashes.set(file, sha256File(absolute));
		else if (tolerateMissing) hashes.set(file, PATCH_ABSENT);
		else throw new Error(`patched artifact is missing ${file} in ${root}`);
	}
	return hashes;
}

/** One patch of an artifact's chain, resolved for one prefix: what it is, and where it applies. */
interface ChainStep {
	/** The committed patch file, relative to the repository as the record spells it. */
	readonly patch: string;
	/** sha256 of that patch file, as the record freezes it. */
	readonly sha256: string;
	/** Every file this patch touches, relative to {@link root}. */
	readonly touched: readonly string[];
	/** The absolute directory this patch's own paths are relative to, inside one prefix. */
	readonly root: string;
}

/** One artifact's chain, resolved for one prefix: every patch, in application order. */
function chainSteps(
	artifact: PatchArtifact,
	layout: IsolatedHarnessLayout,
	repoRoot: string,
): ChainStep[] {
	return artifact.patchFiles.map(entry => {
		const touched = patchTouchedFiles(readFileSync(entry.patchFile, "utf8"));
		if (touched.length === 0) throw new Error(`${entry.patchFile} touches no file`);
		return {
			patch: path.relative(repoRoot, entry.patchFile).replace(/\\/g, "/"),
			sha256: sha256File(entry.patchFile),
			touched,
			root: patchRootOf(entry, layout),
		};
	});
}

/** One command's result, surfaced whole when it fails. */
interface CommandResult {
	readonly exitCode: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

async function runCommand(argv: readonly string[], cwd: string): Promise<CommandResult> {
	const child = Bun.spawn([...argv], {
		cwd,
		env: process.env as Record<string, string>,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { exitCode, stdout, stderr };
}

/**
 * Materialise one artifact: the isolated exact install of the recorded version, the artifact's patch
 * chain applied to it in order, and both halves verified against the frozen record. Reuses the
 * existing prefix when the record's post-patch hashes still hold.
 */
export async function ensurePatchArtifact(
	record: BaselineRecord,
	artifact: PatchArtifact,
	repoRoot: string = REPO_ROOT,
): Promise<IsolatedHarness> {
	const layout = patchArtifactLayout(record, artifact, repoRoot);
	const steps = chainSteps(artifact, layout, repoRoot);
	const frozen = readPatchArtifactRecord(artifact);

	if (existsSync(path.join(layout.prefix, artifact.manifestName))) {
		const hashes = steps.map(step => {
			try {
				return hashesOf(step.root, step.touched, false);
			} catch (error) {
				throw new Error(
					`the materialised host at ${layout.prefix} does not match ${step.patch} (${String(error)}); remove the prefix and materialise again`,
				);
			}
		});
		if (frozen) {
			if (frozen.patches.length !== steps.length) {
				throw new Error(
					`the frozen record describes ${frozen.patches.length} patch(es) but ${artifact.recordFile}'s artifact names ${steps.length}; re-freeze deliberately instead of running a host that is not the frozen one`,
				);
			}
			steps.forEach((step, index) => {
				const frozenEntry = frozen.patches[index] as PatchRecordEntry;
				if (frozenEntry.sha256 !== step.sha256) {
					throw new Error(
						`the frozen record describes patch ${frozenEntry.sha256} but ${step.patch} is ${step.sha256}; re-freeze deliberately instead of running a host that is not the frozen one`,
					);
				}
				for (const file of frozenEntry.files) {
					const actual = hashes[index]?.get(file.path);
					if (actual !== file.patchedSha256) {
						throw new Error(
							`materialised ${file.path} is ${actual ?? "<missing>"}, the frozen record says ${file.patchedSha256}`,
						);
					}
				}
			});
		}
		return describeHarness(record, layout);
	}

	const staging = `${layout.prefix}.staging-${process.pid}-${Date.now()}`;
	mkdirSync(staging, { recursive: true });
	writeFileSync(path.join(staging, "package.json"), prefixManifest(record, artifact));
	const install = await runCommand(["bun", "install"], staging);
	if (install.exitCode !== 0) {
		rmSync(staging, { recursive: true, force: true });
		throw new Error(
			`isolated install of ${record.harness.package}@${record.harness.supportedVersion} failed (exit ${String(install.exitCode)})\n${install.stdout}\n${install.stderr}`,
		);
	}

	const stagingSteps = chainSteps(
		artifact,
		{ prefix: staging, packageRoot: path.join(staging, "node_modules", record.harness.package), cliPath: "" },
		repoRoot,
	);
	// The commands the record spells are the ones against the *final* prefix — the reproducible
	// instruction — while the run applies the same patches inside the staging prefix.
	const applications = steps.map(step => {
		const directory = path.relative(repoRoot, step.root).replace(/\\/g, "/");
		return `from the repository root: git -c core.autocrlf=false apply -p1 --whitespace=nowarn --directory=${directory} ${step.patch}`;
	});
	const base: Map<string, string>[] = [];
	const patched: Map<string, string>[] = [];
	for (const step of stagingSteps) {
		// Each patch's pre-patch bytes are read from the tree it is about to be applied to, so a chain
		// that touches one file twice ties each step to the bytes that patch really changed.
		base.push(hashesOf(step.root, step.touched, true));
		const apply = await runCommand(
			[
				"git",
				"-c",
				"core.autocrlf=false",
				"apply",
				"-p1",
				"--whitespace=nowarn",
				"--directory",
				path.relative(repoRoot, step.root).replace(/\\/g, "/"),
				step.patch,
			],
			repoRoot,
		);
		if (apply.exitCode !== 0) {
			rmSync(staging, { recursive: true, force: true });
			throw new Error(
				`applying ${step.patch} to the isolated install failed (exit ${String(apply.exitCode)}); the install is not the revision the patch was frozen against\n${apply.stdout}\n${apply.stderr}`,
			);
		}
		patched.push(hashesOf(step.root, step.touched, false));
	}
	if (frozen) {
		// A fresh materialisation must land on the frozen artifact, not merely on patches that happened
		// to apply: an edited patch has to go through a deliberate re-freeze.
		stagingSteps.forEach((step, index) => {
			const frozenEntry = frozen.patches[index];
			for (const file of frozenEntry?.files ?? []) {
				const actual = patched[index]?.get(file.path);
				if (actual !== file.patchedSha256) {
					rmSync(staging, { recursive: true, force: true });
					throw new Error(
						`applying ${step.patch} produced ${file.path}=${actual ?? "<missing>"}, but the frozen record says ${file.patchedSha256}; delete ${artifact.recordFile} to re-freeze deliberately`,
					);
				}
			}
		});
	}

	mkdirSync(path.dirname(layout.prefix), { recursive: true });
	try {
		renameSync(staging, layout.prefix);
	} catch {
		// Another caller won the race, or a stale prefix exists: keep the usable one.
		rmSync(staging, { recursive: true, force: true });
	}

	const materialised: PatchRecordEntry[] = stagingSteps.map((step, index) => ({
		file: step.patch,
		sha256: step.sha256,
		files: step.touched.map(file => ({
			path: file,
			baseSha256: base[index]?.get(file) ?? PATCH_ABSENT,
			patchedSha256: patched[index]?.get(file) ?? "<missing>",
		})),
	}));
	writeFileSync(
		path.join(layout.prefix, artifact.manifestName),
		`${JSON.stringify(
			{
				materialised: new Date().toISOString(),
				prefix: layout.prefix,
				packageRoot: layout.packageRoot,
				patchRoots: steps.map(step => path.relative(repoRoot, step.root).replace(/\\/g, "/")),
				cliPath: layout.cliPath,
				patches: steps.map(step => ({ file: step.patch, sha256: step.sha256 })),
				install: { command: "bun install", exitCode: install.exitCode },
				apply: { commands: applications },
				files: materialised,
			},
			null,
			"\t",
		)}\n`,
	);

	if (!frozen) {
		const frozenRecord: PatchArtifactRecord = {
			recorded: localDate(),
			harness: {
				package: record.harness.package,
				version: record.harness.supportedVersion,
				revisionAnchor: {
					path: record.harness.revisionAnchor.path,
					commit: record.harness.revisionAnchor.commit,
					tag: record.harness.revisionAnchor.tag,
				},
			},
			patches: materialised,
			materialise: {
				prefix: path.relative(repoRoot, layout.prefix).replace(/\\/g, "/"),
				install: `write package.json declaring ${record.harness.package}@${record.harness.supportedVersion} and run \`bun install\` in the prefix`,
				apply: applications,
			},
			runtime: {
				cliEntry: record.harness.acceptanceArtifact.cliEntry,
				load: `bun ${path.relative(repoRoot, layout.cliPath).replace(/\\/g, "/")} --mode rpc --no-extensions -e <extension> --model <provider>/<model> --session-dir <run>/sessions --cwd <run>/work with PI_CODING_AGENT_DIR=<run>/agent-state`,
			},
			environment: { platform: process.platform, arch: process.arch, bun: Bun.version },
		};
		writeFileSync(artifact.recordFile, `${JSON.stringify(frozenRecord, null, "\t")}\n`);
	}

	return describeHarness(record, layout);
}
