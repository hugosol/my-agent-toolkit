/**
 * One extension assembly's harness-independent binding life. Both native adapters use this module
 * so observation ownership, State and implementation reuse cannot drift between harnesses.
 * Native subscriptions and their release order remain with the adapter that registered them.
 */
import type { ExtensionAssembly, ExtensionImplementation, ImplementationContext } from "../interface/details/implementation";
import { activationField, statePersistence } from "../core/definition";
import type { ExtensionDefinition } from "../interface/details/definition";
import { SessionObservations } from "../core/observations";
import type { BindingResult, HarnessPort } from "../runtime/port";
import { StateStore } from "../core/state";
import { createSubagentAccess } from "../core/subagent-access";
import { bindExtension } from "./binding";
import { isImplementationDisposed } from "./lifecycle";

/** Internal adapter-facing interface, not an extension authoring entry. */
export function createAssemblyBinding(
	definition: ExtensionDefinition,
	options: ExtensionAssembly,
	mode: "in-process" | "cross-process",
): { bind(port: HarnessPort): BindingResult; dispose(): void } {
	const observations = new SessionObservations();
	const access = createSubagentAccess(definition, observations, mode);
	const state = new StateStore({
		field: activationField(definition),
		persistence: statePersistence(definition),
		access,
	});
	let implementation: ExtensionImplementation | undefined;
	const resolveImplementation = (context: ImplementationContext): ExtensionImplementation => {
		// Cleanup spends an implementation. A later binding starts a fresh instance rather than
		// delivering to the resources the previous instance already closed.
		if (implementation === undefined || isImplementationDisposed(implementation)) {
			implementation = options.factory === undefined ? {} : options.factory(context);
		}
		return implementation;
	};
	return {
		bind: port => bindExtension(definition, port, state, observations, resolveImplementation, {
			baseDir: options.configBaseDir,
		}),
		dispose: () => access.dispose(),
	};
}
