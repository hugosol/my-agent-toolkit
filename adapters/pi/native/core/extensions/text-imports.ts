/**
 * pi's Node loader transpiles TypeScript but has no text-resource loader. Install
 * this before loading a definition so the shared `with { type: "text" }` imports
 * keep using their original Markdown files. Bun already loads these natively.
 *
 * The hook is process-wide (as Node requires), but handles only Markdown inside
 * this repository's extension tree. It never transforms another extension's files
 * or changes pi's loader. Duplicated adapter module graphs share one registration.
 */
import * as nodeModule from "node:module";
import { readFileSync } from "node:fs";

const TEXT_IMPORTS = Symbol.for("my-agent-toolkit.pi.text-imports");
const registrations = globalThis as typeof globalThis & { [key: symbol]: unknown };

if (!process.versions.bun && registrations[TEXT_IMPORTS] === undefined) {
	const extensionRoot = new URL("../../../../../extensions/", import.meta.url).href;
	registrations[TEXT_IMPORTS] = nodeModule.registerHooks({
		load(url, context, nextLoad) {
			if (
				url.startsWith(extensionRoot)
				&& url.endsWith(".md")
				&& (context.importAttributes.type === undefined || context.importAttributes.type === "text")
			) {
				return {
					format: "module",
					source: `export default ${JSON.stringify(readFileSync(new URL(url), "utf8"))};`,
					shortCircuit: true,
				};
			}
			return nextLoad(url, context);
		},
	});
}
