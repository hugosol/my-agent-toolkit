/**
 * The general configuration module's extension-facing entry: the validated configuration the
 * extension's binding recorded, and the one misuse failure shared logic may recognize.
 *
 * General is a plain shared-function module, not an adapter-backed capability: shared logic
 * imports `getConfig` directly, and no delivery carries it. `getConfig(definition)` reads the
 * values the definition's own `config.yaml` was validated to carry in this process; it never
 * reads the file and never reaches the framework's shared configuration. The canonical failure
 * declaration lives beside this entry in [`config-contract.ts`](config-contract.ts), so the deep
 * implementation's throw and a consumer's `instanceof` are the same class; the deep implementation
 * — reading, parsing, validating, the per-process validated values and the injectable
 * reader/parser/base-directory seam — stays in `framework/core/config.ts`, whose one published call
 * this entry re-exports. The connection is the deliberate thin runtime exception; the entry adds
 * no second implementation.
 *
 * The declaration an extension writes stays canonical in the root authoring contract, and this
 * entry exports exactly these two names: no `ConfigLoadError`, reader, parser, source,
 * `readConfig`, shared-configuration document reader or validation helper.
 */
export { ExtensionConfigError } from "./config-contract";

/** The implementation's one published call; see the module documentation for its meaning. */
export { getConfig } from "../../core/config";
