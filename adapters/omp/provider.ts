/**
 * OMP provider access: the host's current base URL and credential for one provider, mapped to the
 * framework's plain query.
 *
 * The credentials and addresses are facts of the host, readable only through the model registry a
 * live session context carries. This keeps the registry of the newest context a delivery reported
 * and asks it at each later operation, so a credential the host has since replaced or minted on
 * demand is what an extension gets. The registry itself never crosses the seam.
 *
 * The query is created once per assembly, because the registry is the host's; each binding reports
 * the contexts its own deliveries came from through `saw`.
 */
import type { ProviderAccess } from "../../framework/core/protocol";
import type { OmpSessionContext } from "./internal/native";

/**
 * The credential the harness reports for a provider that needs none.
 *
 * The registry answers this sentinel rather than `undefined` for a keyless provider, so it is a
 * native convention meaning *no credential* and not a credential made of three letters. Mapping it
 * away here keeps that native detail out of the framework's facts: an extension that needs a
 * credential is told there is none rather than handed a value it would send as one.
 */
const KEYLESS_CREDENTIAL = "N/A";

/** The harness's own provider access, and the live registry reading it is answered from. */
export interface ProviderAccessSource {
	/** The query the framework hands the implementation factory and asks once per operation. */
	readonly access: ProviderAccess;
	/** Records the model registry of the context one delivery came from. */
	saw(ctx: OmpSessionContext): void;
}

/**
 * The harness's own provider access, read through the session contexts this process's bindings see.
 *
 * The credentials and the provider addresses are facts of the host, and the reading the extension
 * surface offers is the registry a live session context carries, so this keeps the registry of the
 * newest context a delivery came from and asks *it* at each later operation: a credential the host
 * has since replaced, or minted on demand, is what the extension gets, because nothing here is
 * snapshot at binding time. The registry object is the host's own and its answers are current; what
 * crosses into the framework is the plain two-member query and never the registry itself.
 *
 * The address is read synchronously — the registry resolves it from its own overrides and models —
 * while the credential is awaited, because the host refreshes and mints one as the call needs it. A
 * context that reported no registry, or a registry that answers neither member, leaves the facts
 * absent: the extension is told the host has no access to that provider rather than being handed a
 * guess, another provider's credential or an empty string.
 */
export function createProviderAccess(): ProviderAccessSource {
	let newest: OmpSessionContext["modelRegistry"];
	return {
		access: {
			resolve: async provider => {
				if (newest === undefined) return undefined;
				const baseUrl = newest.getProviderBaseUrl?.(provider);
				const resolved = await newest.getApiKeyForProvider?.(provider);
				const credential = resolved === undefined || resolved === KEYLESS_CREDENTIAL ? undefined : resolved;
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
