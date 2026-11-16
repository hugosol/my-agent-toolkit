import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";

export interface InstalledOmp {
	readonly path: string;
	readonly argvPrefix: readonly string[];
	readonly version: string;
	readonly packageRoot: string;
}

const PACKAGE = "@oh-my-pi/pi-coding-agent";

/** Resolve only an existing developer-selected installation; never materialize a host. */
export async function resolveInstalledOmp(): Promise<InstalledOmp> {
	const requested = process.env.OMP_CLI?.trim();
	const selected = requested
		? (existsSync(requested) ? path.resolve(requested) : Bun.which(requested, { PATH: process.env.PATH }))
		: Bun.which("omp", { PATH: process.env.PATH });
	if (!selected || !existsSync(selected) || !statSync(selected).isFile()) {
		throw new Error(`Installed OMP CLI not found (${requested ? `OMP_CLI=${requested}` : "local PATH"}); select an existing installation with OMP_CLI. No installation is performed.`);
	}
	const canonical = realpathSync(selected);
	const candidates = new Set<string>();
	for (const entry of [selected, canonical]) {
		let directory = path.dirname(entry);
		for (;;) {
			candidates.add(directory);
			candidates.add(path.join(directory, "node_modules", PACKAGE));
			const parent = path.dirname(directory);
			if (parent === directory) break;
			directory = parent;
		}
	}
	for (const root of candidates) {
		const manifestPath = path.join(root, "package.json");
		if (!existsSync(manifestPath)) continue;
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
			name?: string; version?: string; bin?: string | Record<string, string>;
		};
		if (manifest.name !== PACKAGE) continue;
		const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.omp;
		if (!bin || !manifest.version) throw new Error(`Invalid installed OMP manifest: ${manifestPath}`);
		const cli = path.resolve(root, bin);
		if (!existsSync(cli)) throw new Error(`Installed OMP entrypoint is missing: ${cli}`);
		const sameEntry = realpathSync(cli) === canonical;
		if (!sameEntry) {
			// npm/Bun shims name their package entrypoint. Do not infer a different
			// installation merely because it happens to be beside the selection.
			const shim = readFileSync(selected, "utf8").replace(/\\/g, "/");
			const packageEntry = `node_modules/${PACKAGE}/${bin.replace(/\\/g, "/")}`;
			if (!shim.includes(packageEntry)) continue;
		}
		const script = /\.(?:[cm]?js|ts)$/i.test(cli);
		return {
			path: script ? process.execPath : cli,
			argvPrefix: script ? [cli] : [],
			version: manifest.version,
			packageRoot: realpathSync(root),
		};
	}
	throw new Error(`Cannot identify the installed OMP package belonging to ${selected}; select its actual CLI entrypoint with OMP_CLI.`);
}
