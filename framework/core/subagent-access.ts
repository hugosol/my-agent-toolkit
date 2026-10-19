/**
 * One extension assembly's subagent access, including the lives of both halves of each seat.
 * Adapters choose whether sessions can run elsewhere; State and binding supply semantic facts,
 * not publisher/follower/deliverer wiring. Same-process owners always keep their direct path.
 */
import { stateInheritance } from "./definition";
import type { ExtensionDefinition } from "../interface/details/definition";
import { FollowedOwners, type FollowedAccessReader } from "./followed-owners";
import type { ObservationHandOver, SessionObservations } from "./observations";
import type { SessionObservationAccess, SessionObservationSink } from "./protocol";
import {
	createObservationDeliverer,
	createOwnerAccessPublisher,
	openOwnerAccess,
	type OwnerAccessPublisher,
	type OwnerAccessSource,
} from "../modules/local-access";

/** Internal carrier seam; production uses Local access, tests can supply a bounded reader. */
export interface SubagentAccessTransport {
	readonly extension: string;
	readonly publisher?: OwnerAccessPublisher;
	readonly follow?: FollowedAccessReader;
	readonly observations?: SessionObservationAccess;
	readonly dispose?: () => void;
}

/** A binding's admission to its current owner's seat, never authority over State. */
export interface SubagentObservationBinding {
	readonly handOver: ObservationHandOver;
	enter(owner: string): void;
	leave(owner?: string): boolean;
	dispose(): void;
}

export class SubagentAccess {
	readonly #transport: SubagentAccessTransport | undefined;
	readonly #following: FollowedOwners | undefined;
	readonly #offers = new Map<string, () => void>();
	readonly #serving = new Map<string, number>();
	readonly #bindings = new Set<SubagentObservationBinding>();
	#disposed = false;

	constructor(transport?: SubagentAccessTransport) {
		this.#transport = transport;
		this.#following = transport?.follow === undefined ? undefined : new FollowedOwners(transport.follow);
	}

	read(owner: string, field: string): boolean | undefined {
		if (this.#serving.has(owner)) return undefined;
		return this.#following?.read(owner, field);
	}

	prepare(owner: string): Promise<void> | undefined {
		if (this.#serving.has(owner)) return undefined;
		return this.#following?.prepare(owner);
	}

	follows(owner: string): boolean {
		return this.#following?.follows(owner) ?? false;
	}

	/** State supplies the current-value source; this module owns the offer and its withdrawal. */
	offer(owner: string, source: OwnerAccessSource): void {
		this.withdraw(owner);
		const transport = this.#transport;
		if (this.#disposed || transport?.publisher === undefined) return;
		this.#offers.set(owner, transport.publisher.offer({ extension: transport.extension, owner }, source));
	}

	withdraw(owner: string): void {
		const release = this.#offers.get(owner);
		this.#offers.delete(owner);
		release?.();
	}

	/**
	 * One admission per binding, sharing the assembly's knowledge of which owners are served here.
	 * A raw carrier may be supplied by a HarnessPort; adoption and event semantics remain binding's.
	 */
	bind(sink: SessionObservationSink, carrier = this.#transport?.observations): SubagentObservationBinding {
		let owner: string | undefined;
		let receiving: (() => void) | undefined;
		let closed = false;
		const release = (): void => {
			if (owner === undefined) return;
			const previous = owner;
			owner = undefined;
			const count = this.#serving.get(previous) ?? 0;
			if (count <= 1) this.#serving.delete(previous);
			else this.#serving.set(previous, count - 1);
			const stop = receiving;
			receiving = undefined;
			stop?.();
		};
		const binding: SubagentObservationBinding = {
			handOver: {
				serves: key => this.#serving.has(key),
				changed: reading => {
					if (!closed && !this.#disposed) carrier?.deliver(reading);
				},
			},
			enter: key => {
				if (closed || this.#disposed || owner === key) return;
				release();
				owner = key;
				this.#serving.set(key, (this.#serving.get(key) ?? 0) + 1);
				try {
					receiving = carrier?.receive(key, sink);
				} catch (error) {
					release();
					throw error;
				}
			},
			leave: key => {
				if (owner === undefined || (key !== undefined && owner !== key)) return false;
				release();
				return true;
			},
			dispose: () => {
				if (closed) return;
				closed = true;
				release();
				this.#bindings.delete(binding);
			},
		};
		if (this.#disposed) binding.dispose();
		else this.#bindings.add(binding);
		return binding;
	}

	/** Called only after the harness's awaitable session close-out has settled. */
	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		this.#following?.dispose();
		for (const binding of this.#bindings) binding.dispose();
		for (const owner of this.#offers.keys()) this.withdraw(owner);
		this.#transport?.dispose?.();
	}
}

/** Cross-process support includes the same-process fast path; it is not an exclusive topology. */
export function createSubagentAccess(
	definition: ExtensionDefinition,
	observations: SessionObservations,
	capability: "in-process" | "cross-process",
): SubagentAccess {
	if (capability === "in-process") return new SubagentAccess();
	const publisher = createOwnerAccessPublisher({
		report: message => process.stderr.write(`${definition.displayName}: ${message}\n`),
	});
	const deliverer = createObservationDeliverer({
		extension: definition.id,
		readings: owner => observations.readingsFor(owner),
	});
	return new SubagentAccess({
		extension: definition.id,
		...(stateInheritance(definition) !== "follow" ? {} : {
			publisher,
			follow: {
				open: (owner, { waitMs }) => openOwnerAccess({ target: { extension: definition.id, owner }, waitMs }),
			},
		}),
		observations: {
			receive: (owner, sink) => publisher.receive({ extension: definition.id, owner }, sink),
			deliver: reading => deliverer.deliver(reading),
		},
		dispose: () => {
			deliverer.dispose();
			publisher.dispose();
		},
	});
}
