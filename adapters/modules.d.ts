/**
 * Text-resource loading shared by the adapter assemblies.
 *
 * `import text from "./x.md" with { type: "text" }` loads a string; bun-types declares
 * `*.txt` but not `*.md`. OMP-only loader packages are declared beside that native loader
 * contract in `omp/native/extensibility/extensions/modules.d.ts`.
 *
 * The native boundary remains ADR 0002's rule, enforced by import-boundary.test.ts.
 */

declare module "*.md" {
	const text: string;
	export default text;
}
