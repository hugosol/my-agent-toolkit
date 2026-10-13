/**
 * Dock fixture extension: a second, unrelated extension in the same process.
 *
 * A case that asks whether another extension's presence hides anything loads this beside the
 * extension under test. It goes through the public door exactly as this repository's own
 * entrypoints do, and it does no work: the one line it writes naming itself — when the framework
 * builds its implementation, which is the moment the loader's binding really happened — is what
 * tells the case that a second extension was loaded and bound in that process. No network, no
 * file, no timer and no native call of its own.
 */
import { ompAdapter } from "../../../../framework/adapters/omp";
import { type ExtensionDefinition, defineExtension } from "../../../../framework/public";

/** The extension id whose stderr line the dock reads. */
export const SECOND_EXTENSION_ID = "second-extension-probe";

const definition: ExtensionDefinition = defineExtension({
	id: SECOND_EXTENSION_ID,
	displayName: "secondExtensionProbe",
});

export default ompAdapter(definition, {
	factory: () => {
		process.stderr.write(`[${SECOND_EXTENSION_ID}] bound\n`);
		return {};
	},
});
