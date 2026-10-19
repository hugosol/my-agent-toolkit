/**
 * Dock fixture extension: a real extension assembled through the public factory, loaded by the
 * isolated host's own loader.
 *
 * It exists so the dock can observe, in a running harness rather than in a double, the four
 * things the public binding promises: the validated configuration reaching the factory, the
 * one-time initialization the first model request waits for, an `actions` command whose
 * asynchronous action the host's own command chain waits for, and one cleanup when the harness
 * shuts the session down.
 *
 * Every observation is one stderr line prefixed with the extension id, because stderr is the
 * channel the dock already captures and the one a headless session's operator reads.
 */
import { type ExtensionDefinition, defineExtension } from "../../../../framework/public";
import { type OmpExtensionApi, ompAdapter } from "../../../../adapters/omp";

/** The command the dock drives, and the one asynchronous action among its actions. */
export const LIFECYCLE_COMMAND = "lifecycle-probe";
export const LIFECYCLE_ASYNC_ACTION = "watch";
export const LIFECYCLE_SYNC_ACTION = "stop";

/** The value the fixture's `config.yaml` carries, and what the dock expects the factory to see. */
export const LIFECYCLE_CONFIG_VALUE = "dock-lifecycle";

/** How long the fixture's initialization stays in flight, in milliseconds. */
export const LIFECYCLE_INITIALIZATION_MS = 1500;

/** How long the fixture's asynchronous action stays in flight, in milliseconds. */
export const LIFECYCLE_ACTION_MS = 250;

const definition: ExtensionDefinition = defineExtension({
	id: "binding-lifecycle",
	displayName: "bindingLifecycle",
	commands: [
		{
			type: "actions",
			name: LIFECYCLE_COMMAND,
			description: "dock lifecycle probe",
			actions: {
				[LIFECYCLE_ASYNC_ACTION]: "wait, then report",
				[LIFECYCLE_SYNC_ACTION]: "report immediately",
			},
		},
	],
	config: { path: "config.yaml", fields: { marker: "non-empty-string" } },
});

/** One observation, on the channel the dock captures. */
function evidence(line: string): void {
	process.stderr.write(`[binding-lifecycle] ${line}\n`);
}

/**
 * How many instances this process's factory has built.
 *
 * The module is evaluated once per extension load, so the count is the identity of the one
 * business instance the extension runs with: every line the extension records carries it, and a
 * second construction is therefore visible in the dock's own output rather than inferred.
 */
let instances = 0;

export default function bindingLifecycle(pi: OmpExtensionApi): void {
	ompAdapter(definition, {
		// The fixture's own directory: its `config.yaml` sits next to this module.
		configBaseDir: import.meta.dir,
		factory: context => {
			const instance = (instances += 1);
			evidence(`loaded config=${String(context.config.marker)} instance=${instance}`);
			return {
				initialize: async () => {
					evidence(`initialize started instance=${instance}`);
					await Bun.sleep(LIFECYCLE_INITIALIZATION_MS);
					evidence(`initialize settled instance=${instance}`);
				},
				cleanup: () => {
					evidence(`cleanup instance=${instance}`);
				},
				commands: {
					[LIFECYCLE_COMMAND]: {
						[LIFECYCLE_ASYNC_ACTION]: async () => {
							evidence(`action started instance=${instance}`);
							await Bun.sleep(LIFECYCLE_ACTION_MS);
							evidence(`action finished instance=${instance}`);
						},
						[LIFECYCLE_SYNC_ACTION]: () => {
							evidence(`action reported instance=${instance}`);
						},
					},
				},
			};
		},
	})(pi);
}
