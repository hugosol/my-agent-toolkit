/**
 * pi's own provider access: the credential and address the host's registry resolves, read through
 * the session contexts this process's bindings see.
 *
 * The credential and the provider's address are facts of the host, and the reading pi offers is the
 * registry a live session context carries, so this keeps the registry of the newest context a
 * delivery came from and asks *it* at each later operation: a credential the host has since replaced,
 * or minted on demand, is what the extension gets, because nothing here is snapshot at binding time.
 * What crosses into the framework is the plain two-member query and never the registry.
 *
 * The address is read from the provider's own entry or, when that entry states none, from the first
 * of its models — both are the registry's own statements — while the credential is awaited, because
 * pi resolves and refreshes it as the call needs it. A registry that answers neither member leaves
 * the facts absent: the extension is told the host has no access to that provider rather than being
 * handed a guess or another provider's credential.
 */
import type { ProviderAccess } from "../../framework/core/protocol";
import type { PiExtensionContext, PiModelRegistry } from "./internal/native";

/** pi's own provider access, and the live registry reading it is answered from. */
export interface HarnessProviderAccess {
	/** The query the framework hands the implementation factory and asks once per operation. */
	readonly access: ProviderAccess;
	/** Records the model registry of the context one delivery came from. */
	saw(ctx: PiExtensionContext): void;
}

/** pi's own provider access, read through the session contexts this process's bindings see. */
export function harnessProviderAccess(): HarnessProviderAccess {
	let newest: PiModelRegistry | undefined;
	return {
		access: {
			resolve: async provider => {
				if (newest === undefined) return undefined;
				const baseUrl = newest.getProvider(provider)?.baseUrl
					?? newest.getAll().find(row => row.provider === provider)?.baseUrl;
				const credential = await newest.getApiKeyForProvider(provider);
				if (baseUrl === undefined && credential === undefined) return undefined;
				return {
					...(baseUrl === undefined ? {} : { baseUrl }),
					...(credential === undefined ? {} : { credential }),
				};
			},
		},
		saw: ctx => {
			if (ctx.modelRegistry !== undefined) newest = ctx.modelRegistry;
		},
	};
}
