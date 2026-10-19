/**
 * The general configuration module's canonical extension-facing declaration: the one failure
 * shared logic may recognize when it asks for configuration that is not there.
 *
 * It lives beside the public entry ([`config.ts`](config.ts)) so the deep implementation in
 * `framework/core/config.ts` throws this same class — one identity inside and outside — while the
 * entry connects `getConfig` to that implementation. Keeping the declaration separate from the
 * entry's runtime import is what makes that connection one-way instead of a module cycle.
 *
 * The declaration an extension writes — `ExtensionConfigDeclaration` with its `ConfigFieldType` —
 * stays owned by the root authoring contract (`interface/details/definition.ts`) and is not
 * restated here. This is not a second entry: an extension imports `getConfig` and
 * `ExtensionConfigError` from [`config.ts`](config.ts).
 */

/**
 * The misuse of the configuration API by a bound extension: shared logic asked for a configuration
 * its extension never declared, or for one whose values were never validated in this process.
 *
 * It is a programming error, not a loading-time one — binding has already guaranteed that a bound
 * extension which declared a configuration has validated values — so it is an escape hatch of its
 * own and is never part of a binding failure. A declaration, file, reader or parser failure stays
 * the framework's internal `ConfigLoadError`, which binding turns into a configuration failure
 * before the extension is loaded.
 */
export class ExtensionConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExtensionConfigError";
	}
}
