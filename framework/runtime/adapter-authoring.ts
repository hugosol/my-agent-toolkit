/**
 * Internal adapter authoring: the binding definition is the runtime assembly source, not a second
 * capability inventory. Keep native setup and effects in domain implementations; these factories
 * only connect one binding's context to the existing HarnessPort contract.
 *
 * All port keys are explicit, including optional absences. This gives the future offline analyzer
 * a bounded assembly shape without changing extension loading or claiming semantic verification.
 * Types constrain keys and values; a future source-expression check must enforce syntax restrictions.
 */
import type { SessionFacts, UserInputDelivery } from "../interface/session";
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

/** A deliberately unavailable Session fact: the field is omitted and this reason is reported. */
export interface UnavailableSessionFact {
	readonly kind: "unavailable";
	readonly reason: string;
}

/** Names one Session fact this adapter cannot obtain, in the vocabulary consumers already read. */
export function unavailableFact(reason: string): UnavailableSessionFact {
	return Object.freeze({ kind: "unavailable", reason });
}

/** The Session facts a delivery must carry: their presence is not a capability to be declared. */
type RequiredSessionFact = {
	[Key in keyof SessionFacts]-?: undefined extends SessionFacts[Key] ? never : Key;
}[keyof SessionFacts];

/**
 * The facts an adapter's mapping function must answer and can report as absent.
 *
 * A mapper receives the list currently being assembled so a reading it could not obtain is named
 * where it was attempted, beside the value it did not produce. The `unavailable` entry supplies the
 * readings that are not per-field (a position resolved before the mapping) and is always present.
 */
export type SessionFactsBindings<Input> = {
	readonly [Key in keyof SessionFacts]-?: Key extends "unavailable"
		? (input: Input) => readonly string[]
		: Key extends RequiredSessionFact
			? (input: Input, unavailable: string[]) => SessionFacts[Key]
			:
				| ((input: Input, unavailable: string[]) => SessionFacts[Key])
				| UnavailableSessionFact;
};

/** One adapter's actual SessionFacts construction, callable wherever its deliveries are framed. */
export type SessionFactsMapping<Input> = (input: Input) => SessionFacts;

/**
 * Defines one adapter's actual Session facts construction.
 *
 * The object literal lists every canonical `SessionFacts` key, so adding a fact to the framework
 * contract stops every adapter from compiling until its real source is considered. A field mapped
 * by a function is resolved from that input; a mapping that answers `undefined` omits the member
 * because the value itself is absent at runtime. An `unavailableFact` omits it *and* names the
 * fact, which is how a static absence reaches consumers. The returned callable is what an adapter
 * delivery actually calls; this is not a second capability inventory.
 */
export function defineSessionFactsMapping<Input>(bindings: SessionFactsBindings<Input>): SessionFactsMapping<Input> {
	const declared = Object.freeze({ ...bindings });
	const fieldKeys = (Object.keys(declared) as (keyof SessionFacts)[]).filter(
		(key): key is Exclude<keyof SessionFacts, "unavailable"> => key !== "unavailable",
	);
	return (input: Input): SessionFacts => {
		const unavailable = [...declared.unavailable(input)];
		const facts: Record<string, unknown> = {};
		for (const key of fieldKeys) {
			const entry = declared[key];
			if (typeof entry !== "function") {
				unavailable.push(entry.reason);
				continue;
			}
			const value = entry(input, unavailable);
			if (value !== undefined) facts[key] = value;
		}
		facts.unavailable = unavailable;
		return facts as unknown as SessionFacts;
	};
}
