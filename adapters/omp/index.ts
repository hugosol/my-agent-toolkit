/**
 * The OMP adapter entry and assembly.
 *
 * This module only assembles: the process-level readers an extension's factory is handed and the
 * harness-independent binding life shared by both adapters. The native mappings live beside it —
 * `port.ts` composes the seam, `context/` and `session/` own their own reads and event mappings,
 * and `pricing.ts`, `provider.ts`, `feedback.ts`, `marker.ts`, `control.ts` and `prompt.ts` own
 * the native facts they translate.
 *
 * It carries no extension semantics: what to register comes from the definition, whether it may be
 * registered is decided by the harness-independent behavior, and what a command does is the
 * framework's control behavior — the adapter only resolves the native facts that behavior needs.
 */
import { createAssemblyBinding } from "../../framework/behaviors/assembly";
import type { ExtensionAssembly } from "../../framework/core/assembly";
import type { ExtensionDefinition } from "../../framework/core/definition";
import type { BindingResult } from "../../framework/core/protocol";
import type { OmpExtensionApi } from "./internal/native";
import { createOmpPort } from "./port";
import { createModelPrices } from "./pricing";
import { createProviderAccess } from "./provider";

// Native types remain available through the adapter entry consumed by harness assemblies.
export type {
	OmpAfterProviderResponseEvent,
	OmpAgentEndEvent,
	OmpAgentMessage,
	OmpAgentRef,
	OmpAgentRegistry,
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
	OmpSessionEntry,
	OmpUiContext,
} from "./internal/native";
export type { OmpSessionEvent, OmpSessionEventType, OmpSessionReason } from "./session/events";
export type { OmpViewedSessionFacts } from "./session/viewed-session";

/**
 * Re-exported because it is what {@link OmpExtensionFactory} returns.
 *
 * Everything an *assembly* declares lives on the public authoring surface instead
 * (`framework/public.ts`), so this module offers no assembly type of its own.
 */
export type { BindingResult };

/**
 * The assembly information the OMP adapter accepts: the harness-independent
 * {@link ExtensionAssembly}, unchanged.
 *
 * The adapter adds no member of its own — what an extension builds, which framework semantics it
 * depends on and where its declared configuration sits mean the same thing on any harness — and
 * an assembly therefore names no harness when it states them. Version support is deliberately not
 * among them either: support is a claim about a verified combination, recorded in the repository's
 * support record, and no assembly supplies or widens it.
 */
export type { ExtensionAssembly };

/** The OMP extension factory an entrypoint re-exports; the loader calls it per binding. */
export type OmpExtensionFactory = (pi: OmpExtensionApi) => BindingResult;

/**
 * Assembles a definition for OMP.
 *
 * The returned factory binds the definition to whichever session calls it; a refused definition
 * reports its conflicts and contributes nothing, and the harness continues. The harness-independent
 * binding owns observation ownership, the State store and implementation reuse: the store is
 * created once here — at module load, so once per extension per process — and shared by every
 * session binding, which is what lets bindings agree on one current value per owner. The
 * implementation factory is called once here as well: the first binding that gets far enough hands
 * it the validated configuration, and every later binding reuses what it built, so a new session,
 * a subagent or a view change never constructs a second business instance. The one thing that ends
 * that reuse is the instance's own disposal: once its cleanup has run, it is spent, and the next
 * binding builds a fresh instance rather than handing a closed one to an extension that believes
 * it is starting fresh. An assembly that wants the instance to be the process's creates its adapter
 * once, at module load, as `entrypoints/omp` does.
 *
 * Every session this harness runs — a subagent's included — is a binding in this process, so the
 * binding uses `in-process` subagent access: an owner's declared values are always read here and no
 * endpoint is bound or location record published. The model catalog and provider registry are the
 * host's, so their plain queries are created once per assembly and each binding reports the
 * contexts its own deliveries came from.
 */
export function ompAdapter(definition: ExtensionDefinition, options: ExtensionAssembly = {}): OmpExtensionFactory {
	const binding = createAssemblyBinding(definition, options, "in-process");
	const prices = createModelPrices();
	const access = createProviderAccess();
	return (pi: OmpExtensionApi): BindingResult =>
		binding.bind(createOmpPort(pi, definition, { prices, access }));
}
