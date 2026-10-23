/**
 * The OMP adapter entry and assembly.
 *
 * This module only assembles: the process-level readers an extension's factory is handed and the
 * harness-independent binding life shared by both adapters. `port.ts` connects the seam;
 * `native/extensibility/extensions/` owns the native extension API, commands, prompt delivery and
 * context readings, `native/session/session-manager.ts` keeps the complete State entry protocol,
 * and `native/config/model-registry.ts` supplies catalog prices and current provider access.
 * Native lifecycle and UI mappings remain independent of these consumer protocols.
 *
 * It carries no extension semantics: what to register comes from the definition, whether it may be
 * registered is decided by the harness-independent behavior, and what a command does is the
 * framework's control behavior — the adapter only resolves the native facts that behavior needs.
 */
import { createAssemblyBinding } from "../../framework/behaviors/assembly";
import type { ExtensionAssembly } from "../../framework/interface/details/implementation";
import type { ExtensionDefinition } from "../../framework/interface/details/definition";
import type { BindingResult } from "../../framework/runtime/port";
import type { OmpExtensionApi } from "./native/extensibility/extensions/types";
import { createOmpPort } from "./port";
import { createProviderFacts } from "./native/config/model-registry";

// Native types remain available through the adapter entry consumed by harness assemblies.
export type {
	OmpAfterProviderResponseEvent,
	OmpAgentEndEvent,
	OmpAgentMessage,
	OmpAgentStartEvent,
	OmpBeforeProviderRequestEvent,
	OmpCommandContext,
	OmpEventBus,
	OmpExtensionApi,
	OmpInjectedPromptMessage,
	OmpInputEvent,
	OmpMessageEndEvent,
	OmpMessageStartEvent,
	OmpMessageUpdateEvent,
	OmpRoundEventType,
	OmpRunInitiationHandler,
	OmpRunInitiationResult,
	OmpSdkSurface,
	OmpSessionContext,
	OmpUiContext,
} from "./native/extensibility/extensions/types";
export type { OmpAgentRef, OmpAgentRegistry } from "./native/registry/agent-registry";
export type { OmpSessionEntry } from "./native/session/session-manager";
export type { OmpSessionEvent, OmpSessionEventType, OmpSessionReason } from "./native/extensibility/extensions/lifecycle";
export type { OmpViewedSessionFacts } from "./domain/session/viewed-session";

/**
 * Re-exported because it is what {@link OmpExtensionFactory} returns.
 *
 * Everything an *assembly* declares lives on the root authoring interface instead, so this
 * module offers no assembly type of its own.
 */
export type { BindingResult };

/** The OMP extension factory an entrypoint re-exports; the loader calls it per binding. */
export type OmpExtensionFactory = (pi: OmpExtensionApi) => BindingResult;

/**
 * Assembles a definition for OMP.
 *
 * The returned factory binds the definition to whichever session calls it; a refused definition
 * reports its conflicts and contributes nothing, and the harness continues. The harness-independent
 * binding owns observation ownership, the State store and implementation reuse: the store is
 * created once here — at module load, so once per extension per process — and shared by every
 * session binding, which is what lets bindings agree on one current value per owner. The authored
 * implementation is materialized once here as well: the first binding that gets far enough hands
 * its `create` the validated configuration, and every later binding reuses what it built, so a new
 * session, a subagent or a view change never constructs a second business instance. The one thing
 * that ends that reuse is the instance's own disposal: once its cleanup has run, it is spent, and
 * the next binding builds a fresh instance rather than handing a closed one to an extension that
 * believes it is starting fresh. An assembly that wants the instance to be the process's creates
 * its adapter once, at module load, as `entrypoints/omp` does.
 *
 * Every session this harness runs — a subagent's included — is a binding in this process, so the
 * binding uses `in-process` subagent access: an owner's declared values are always read here and no
 * endpoint is bound or location record published. The model catalog and provider registry are the
 * host's, so their plain queries are created once per assembly and each binding reports the
 * contexts its own deliveries came from.
 */
export function ompAdapter(definition: ExtensionDefinition, options: ExtensionAssembly = {}): OmpExtensionFactory {
	const binding = createAssemblyBinding(definition, options, "in-process");
	const providerFacts = createProviderFacts();
	return (pi: OmpExtensionApi): BindingResult =>
		binding.bind(createOmpPort(pi, definition, { providerFacts }));
}
