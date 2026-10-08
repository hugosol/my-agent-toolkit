/**
 * Ambient module declarations for module kinds this repository loads but does not ship as
 * npm packages.
 *
 * Both blocks describe load-time resolution owned by the OMP extension loader, not by this
 * repository's dependency tree, which is why they live here, in the framework's
 * harness adapter: the native escape hatch is exactly `framework/adapters/**` and
 * `extensions/<id>/harnesses/**`, and a module this harness resolves is named in the first of
 * them rather than anywhere else in the framework tree. The boundary and its enforcement are
 * [ADR 0002 §Enforcement of the native boundary](../../docs/adr/0002-semantic-extension-framework.md#enforcement-of-the-native-boundary)
 * and [`tests/framework/import-boundary.test.ts`](../../tests/framework/import-boundary.test.ts).
 *
 * - `*.md` is a Bun import kind: `import text from "./x.md" with { type: "text" }`
 *   loads the file as a string (`bun-types` declares `*.txt` but not `*.md`).
 * - `@oh-my-pi/pi-utils` is a harness-provided bare package. The OMP loader
 *   resolves the host package scope to its own copy, so the extension assembly
 *   needs no local install; only the surface this repository uses is declared.
 *
 * See framework/docs/harness-support.md for the deployment rule and the fixed baseline.
 */

declare module "*.md" {
	const text: string;
	export default text;
}

declare module "@oh-my-pi/pi-utils" {
	export namespace logger {
		function debug(message: string, context?: Record<string, unknown>): void;
	}
}
