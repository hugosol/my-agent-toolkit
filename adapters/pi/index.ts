/**
 * pi extension API → framework port. State, controls, prompt planning and marker composition stay
 * in the existing public behaviors; only native facts/effects are mapped here. An observation axis
 * this mapping has no fact for is reported as an absent observation rather than accepted as a silent
 * subscription or invented from some other fact.
 *
 * This entry is assembly only: the process-scoped readings this host offers are built once, the
 * binding life is the framework's shared assembly helper, and each axis of the port lives in a
 * source-owned mapping under `native/`, `thirdParty/pi-subagents/` or `mixture/`; `port.ts`
 * binds those mappings without interpreting their protocols.
 */
import { createAssemblyBinding } from "../../framework/behaviors/assembly";
import type { ExtensionAssembly } from "../../framework/interface/details/implementation";
import type { ExtensionDefinition } from "../../framework/interface/details/definition";
import type { AdapterFactory } from "../../framework/runtime/adapter-authoring";
import type { HarnessPort } from "../../framework/runtime/port";
import type { PiExtensionApi, PiExtensionFactory } from "./internal/native";
import { createPiPort, type PiPortWithSubagents, type PiPortWithoutSubagents } from "./port";
import { piProviderFacts } from "./domain/provider";
import { piSessionPositions } from "./native/core/session-manager/positions";
import { piSessionFileAnchors } from "./native/core/session-manager/ancestry";
import { createPiSubagentIntegration } from "./thirdParty/pi-subagents/integration";

export * from "./internal/native";
export type { PiPortWithSubagents, PiPortWithoutSubagents } from "./port";
export type { BindingResult } from "../../framework/runtime/port";

/**
 * What a pi assembly states about itself beyond the generic assembly information.
 *
 * `childEntry` is the module pi's loader loads for this extension — the file the extension's own
 * discovery entrypoint re-exports. A harness that spawns child sessions loads extensions into them
 * by path, so requiring this entry in those sessions is what makes a spawned session's own facts
 * reach consumers; an assembly that states no entry declares no child observation to require, which
 * is the same shape as a host that runs no subagent provider. It also states that this host can run
 * a session of this extension outside this process, which is what the framework's local access is
 * for.
 */
export interface PiAssembly extends ExtensionAssembly {
	readonly childEntry?: string;
}

/**
 * The factory one pi assembly returns, retaining the port that assembly states it constructs.
 *
 * `Port` is a compile-time witness of the adapter's own assembly output — the trusted shape the
 * binding is built from — not proof that a native provider is installed, reachable or correct.
 */
export type PiAssemblyFactory<Port extends HarnessPort = HarnessPort> = AdapterFactory<Port, PiExtensionFactory>;

/**
 * Uses the same binding and assembly contract as the OMP adapter.
 *
 * An explicit `childEntry` gives this process's subagent integration something to require, so the
 * constructed port carries its settle member; the member's presence states that a settle exists,
 * never that it settles as `subagents`. An omitted or explicitly undefined entry states no such
 * integration and assembles the port that declares the member absent. An assembly typed as the
 * general `PiAssembly` — including a `string | undefined` entry decided at run time — retains the
 * generic optional member, because the adapter cannot know from that type which port will be
 * constructed. A plain `HarnessPort` reading is the same uncertain contract, never a claim of
 * absence.
 *
 * This witness is the assembly's trusted output contract: it states what this adapter constructs,
 * not what a third-party provider does when called.
 */
export function piAdapter(
	definition: ExtensionDefinition,
	options: PiAssembly & { readonly childEntry: string },
): AdapterFactory<PiPortWithSubagents, PiExtensionFactory>;
export function piAdapter(
	definition: ExtensionDefinition,
	options?: PiAssembly & { readonly childEntry?: undefined },
): AdapterFactory<PiPortWithoutSubagents, PiExtensionFactory>;
export function piAdapter(
	definition: ExtensionDefinition,
	options?: PiAssembly,
): AdapterFactory<HarnessPort, PiExtensionFactory>;
export function piAdapter(definition: ExtensionDefinition, options: PiAssembly = {}): PiAssemblyFactory {
	// pi can run children here or in a background process. The framework owns the access lifetime
	// and chooses the direct path for each owner served here; childEntry states cross-process support.
	const mode = options.childEntry === undefined ? "in-process" : "cross-process";
	const binding = createAssemblyBinding(definition, options, mode);
	// pi's own provider facts — the model prices and the provider access the registry states — as one set
	// for the whole process: every binding of this assembly records the registry of the contexts its
	// own deliveries come from, and the queries the framework hands an extension's `create` answer from
	// the newest of them.
	const providerFacts = piProviderFacts();
	// The sessions this process's deliveries are read through: pi's own lineage links and the session
	// files they name are facts of the process, and a chain walked for one session is the same chain
	// another session of this process would walk.
	const positions = piSessionPositions(piSessionFileAnchors());
	// The subagent-provider integration of this process, created once for the same reason and attached
	// at the first binding: what it holds is the process's requirements and the provider's own
	// announcement, while what each binding releases is the requirement of the sessions it served.
	const integration = options.childEntry === undefined
		? undefined
		: createPiSubagentIntegration(definition.id, options.childEntry);
	return (pi: PiExtensionApi) => {
		const subscriptions: Array<() => void> = [];
		const { port, reportDiagnostic } = createPiPort({
			pi,
			definition,
			positions,
			integration,
			providerFacts,
			keepSubscription: release => subscriptions.push(release),
		});
		integration?.attach(pi, reportDiagnostic);
		const result = binding.bind(port);
		// The end of this process's own session run releases what this extension's reads keep open: a
		// followed access is this process's connection to the process serving that owner, and the
		// session that made these reads is gone. A reload is the same ending — the entry is loaded
		// again and builds its own store and its own deliveries — so both are released here rather
		// than left to the process's exit. A session switch (`new`, `resume`, `fork`) is not: the
		// process keeps running and the owner a delivery names next is read through its own access.
		//
		// It is registered *after* the binding, because both subscriptions answer the same native fact
		// and pi awaits an extension's handlers in the order they were registered: the binding's own
		// handler is what reports the disposal and waits for the framework's close-out, so registering
		// this one first would give up these reads while a session's last round was still being settled
		// — and a submit notice that close-out publishes would be handed to a carrier that is already
		// gone.
		subscriptions.push(pi.on("session_shutdown", event => {
			if (event.reason !== "quit" && event.reason !== "reload") return;
			binding.dispose();
		}));
		if (!result.bound) {
			for (const release of subscriptions) release();
			integration?.releaseAll();
		}
		return result;
	};
}
