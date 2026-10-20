/**
 * Internal adapter authoring: the binding definition is the runtime assembly source, not a second
 * capability inventory. Keep native setup and effects in domain implementations; these factories
 * only connect one binding's context to the existing HarnessPort contract.
 *
 * All port keys are explicit, including optional absences. This gives the future offline analyzer
 * a bounded assembly shape without changing extension loading or claiming semantic verification.
 * Types constrain keys and values; a future source-expression check must enforce syntax restrictions.
 */
import type { UserInputDelivery } from "../interface/session";
import type {
	CommandInvocation,
	HarnessPort,
	RoundObservation,
	RunDelivery,
	SessionContextObservation,
	SessionDelivery,
	SessionDisposal,
	TurnSignalFacts,
} from "./port";

/** Type-only witness of the port a native extension factory assembles; no runtime property is added. */
declare const adapterFactoryPort: unique symbol;

export interface AdapterFactoryOutput<Port extends HarnessPort> {
	readonly [adapterFactoryPort]?: Port;
}

/** Keeps the native loader's callable shape while retaining its assembly-specific port contract. */
export type AdapterFactory<Port extends HarnessPort, Factory> = Factory & AdapterFactoryOutput<Port>;

/** A deliberately unavailable optional outlet, not a fake implementation or an unknown reading. */
export interface UnavailablePortMember {
	readonly kind: "unavailable";
	readonly reason: string;
}

export function unavailablePortMember(reason: string): UnavailablePortMember {
	return Object.freeze({ kind: "unavailable", reason });
}

/**
 * Factories are lazy until one native binding is constructed. Optional factories may answer
 * undefined when the assembly does not enable that path; static absence instead records a reason.
 * Required members cannot be declared unavailable, and a new port member must be considered here
 * by every adapter definition rather than being silently omitted.
 */
export type AdapterPortBindings<Context> = {
	readonly [Member in keyof HarnessPort]-?:
		| ((context: Context) => HarnessPort[Member])
		| ({} extends Pick<HarnessPort, Member> ? UnavailablePortMember : never);
};

export interface AdapterPortDefinition<Context> {
	readonly bindings: AdapterPortBindings<Context>;
	create(context: Context): HarnessPort;
}

/** Defines one actual adapter assembly; constructing the definition executes no native factory. */
export function defineAdapterPort<Context>(bindings: AdapterPortBindings<Context>): AdapterPortDefinition<Context> {
	const declared = Object.freeze({ ...bindings });
	return Object.freeze({
		bindings: declared,
		create(context: Context): HarnessPort {
			const port: Partial<HarnessPort> = {};
			for (const member of Object.keys(declared) as (keyof HarnessPort)[]) {
				const entry = declared[member];
				if (typeof entry !== "function") continue;
				const implementation = entry(context);
				if (implementation !== undefined) Object.assign(port, { [member]: implementation });
			}
			// The complete mapped input requires every non-optional implementation. This projection
			// removes only explicit optional absences; it does not synthesize fallback implementations.
			return port as HarnessPort;
		},
	});
}

/** Canonical protocol payloads, not restated contracts or a second dispatch mechanism. */
export interface AdapterDeliveryMap {
	readonly session: SessionDelivery;
	readonly disposal: SessionDisposal;
	readonly round: RoundObservation;
	readonly context: SessionContextObservation;
	readonly turn: TurnSignalFacts;
	readonly input: UserInputDelivery;
	readonly run: RunDelivery;
	readonly command: CommandInvocation;
}

/**
 * Marks the actual native delivery construction site, including embedded callbacks. The kind is a
 * source-analysis anchor; delivery identity, evaluation, mutability and callback timing are unchanged.
 */
export function defineAdapterDelivery<Kind extends keyof AdapterDeliveryMap>(
	_kind: Kind,
	delivery: AdapterDeliveryMap[Kind],
): AdapterDeliveryMap[Kind] {
	return delivery;
}
