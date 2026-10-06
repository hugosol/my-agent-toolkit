/**
 * Probe 03-B: thin-entrypoint discovery through the real OMP 18.5.0 loader.
 *
 * Verifies, without touching host or user config:
 *  - discoverExtensionPaths(..., { ambient:false }) scans only the configured root
 *  - each thin entrypoint is discovered independently (no root index aggregation)
 *  - entrypoints import TS + Markdown resources from outside the discovery root
 *  - bare-specifier dependency resolution works from the extension host file
 *  - a pi-side entrypoint under a different root is NOT selected
 *
 * Env: OMP_HOST (isolated package root), DISCOVERY_ROOT (entrypoints/omp dir),
 *      PROBE_CWD (resolution cwd).
 */
const HOST = process.env.OMP_HOST;
const ROOT = process.env.DISCOVERY_ROOT;
const CWD = process.env.PROBE_CWD ?? process.cwd();
if (!HOST) throw new Error("OMP_HOST is required");
if (!ROOT) throw new Error("DISCOVERY_ROOT is required");

// Dynamic import: the host package root is genuinely runtime-selected from OMP_HOST
// (probe harness), so a static specifier cannot be used.
const { discoverExtensionPaths, loadExtensions } = await import(
	`${HOST}/src/extensibility/extensions/loader.ts`
);

const paths: string[] = await discoverExtensionPaths([ROOT], CWD, undefined, { ambient: false });
console.log("DISCOVERED=" + JSON.stringify(paths));

const result = await loadExtensions(paths, CWD);
console.log("ERRORS=" + JSON.stringify(result.errors));
	for (const ext of result.extensions) {
	const commands = [...ext.commands.entries()].map(([name, cmd]) => {
		if (cmd && typeof cmd === "object" && "description" in cmd) return [name, cmd.description];
		return [name, undefined];
	});
	console.log(`EXT label=${ext.label} commands=${JSON.stringify(commands)}`);
}

export {};
