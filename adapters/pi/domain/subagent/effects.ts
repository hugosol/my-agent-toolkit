/**
 * The pi adapter's effects on the third-party subagent provider: the child-extension requirement it
 * accepts per parent session, and the session-liveness registry this entry publishes for it.
 *
 * pi-subagents accepts one immutable requirement snapshot per parent session, not one per extension.
 * Keep the framework's contributions together, including across loader-created module graphs.
 * Replacing a snapshot is synchronous: a launch cannot observe the gap between dispose/register.
 *
 * The liveness registry is the provider's own published protocol: a party that wants the provider's
 * per-session answer has to publish the slot, because the protocol states a `register` and no query.
 * Publishing is an effect of this binding — done while it is being set up and before the host starts
 * any session — while reads of what the provider registers live in `queries.ts`.
 */
export interface PiSubagentProvider {
	registerRequiredChildExtensions(input: {
		readonly sessionId: string;
		readonly extensions: readonly { readonly id: string; readonly path: string }[];
		readonly requireForAllRunners?: boolean;
	}): { dispose(): void };
}

interface ChildEntry {
	readonly id: string;
	readonly path: string;
}

interface SessionRequirement {
	readonly provider: PiSubagentProvider;
	entries: Map<symbol, ChildEntry>;
	registration: { dispose(): void };
}

const REGISTRY_KEY = Symbol.for("my-agent-toolkit.pi.child-extensions.v1");

/** This is a process resource like the provider's own registry, never extension State. */
function sessions(): Map<string, SessionRequirement> {
	const root = globalThis as Record<symbol, unknown>;
	if (root[REGISTRY_KEY] === undefined) root[REGISTRY_KEY] = new Map<string, SessionRequirement>();
	return root[REGISTRY_KEY] as Map<string, SessionRequirement>;
}

function publish(provider: PiSubagentProvider, sessionId: string, entries: Map<symbol, ChildEntry>) {
	return provider.registerRequiredChildExtensions({
		sessionId,
		extensions: [...entries.values()],
		requireForAllRunners: true,
	});
}

/** A refused contribution must leave the previously accepted entries registered. */
function replace(held: SessionRequirement, sessionId: string, entries: Map<symbol, ChildEntry>): void {
	held.registration.dispose();
	try {
		held.registration = publish(held.provider, sessionId, entries);
	} catch (error) {
		held.registration = publish(held.provider, sessionId, held.entries);
		throw error;
	}
	held.entries = entries;
}

/** Adds just this entry; disposing it never releases another extension's child requirement. */
export function requirePiChildExtension(
	provider: PiSubagentProvider,
	sessionId: string,
	entry: ChildEntry,
): { dispose(): void } {
	const table = sessions();
	const token = Symbol(entry.id);
	const previous = table.get(sessionId);
	if (previous === undefined) {
		const entries = new Map([[token, entry]]);
		table.set(sessionId, { provider, entries, registration: publish(provider, sessionId, entries) });
	} else {
		replace(previous, sessionId, new Map([...previous.entries, [token, entry]]));
	}
	let released = false;
	return {
		dispose() {
			if (released) return;
			const held = table.get(sessionId);
			if (held === undefined || !held.entries.has(token)) return;
			const remaining = new Map(held.entries);
			remaining.delete(token);
			if (remaining.size === 0) {
				held.registration.dispose();
				table.delete(sessionId);
			} else {
				replace(held, sessionId, remaining);
			}
			released = true;
		},
	};
}

/**
 * The registry slot the provider's published session-liveness protocol is discovered under, and the
 * one interface version of that protocol this adapter publishes.
 *
 * The provider resolves this slot when a session starts and registers one provider for the session
 * it serves, stating that session's identity and answering, on demand, whether it still holds work
 * that session is waiting on. A party that wants that answer has to publish the slot — the protocol
 * states a `register` and no query — which is what makes the provider's own statement readable here,
 * and reads back what the provider registers rather than copying the queues behind it.
 */
export const SESSION_LIVENESS_REGISTRY_KEY = "@agegr/pi-web/session-liveness/v1";
const SUPPORTED_LIVENESS_VERSION = 1;

/**
 * The member this entry marks the registry it publishes with, so a second binding of this framework
 * in one process recognizes that registry as this entry's own and reads the same registrations
 * rather than publishing a second registry the provider would not register into. A registry another
 * party published carries no such member, and this entry reads nothing from it — a foreign host's
 * protocol stays that host's, and displacing it would break the host it belongs to.
 *
 * The key is process-wide rather than local to this module, because one pi process can evaluate this
 * graph more than once: each extension entrypoint the loader evaluates has its own module registry,
 * so a second extension of this framework — the round-facts fixture beside the production assembly,
 * say — holds a second copy of this module, and a marker that only one copy knew would make the other
 * copy's registry look like another host's.
 */
export const REGISTRATION_TABLE = Symbol.for("model-cost:pi-session-liveness:table");

/** One session's registration: the provider's own answer for it, and the release it handed back. */
export interface LivenessRegistration {
	readonly isActive: () => boolean;
	readonly release: () => void;
}

/**
 * This entry's own half of the registry it publishes: the provider's registrations, by the session
 * each one names.
 */
export interface LivenessTable {
	/** The one registration the provider holds per session it serves. */
	readonly registrations: Map<string, LivenessRegistration>;
}

/**
 * Takes one of the provider's registrations, and answers with the release the protocol asks for.
 *
 * A registration this adapter cannot read — one that states no session, or no `isActive` to ask —
 * leaves nothing held: it is the provider stating an interface this entry cannot use, which is a
 * statement it answers nothing with rather than one it reads as a session at rest. The returned
 * release removes exactly the registration it belongs to, so a provider that registers for the same
 * session again is not unregistered by the release of the statement it replaced.
 */
function registrationIn(table: LivenessTable, value: unknown): () => void {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return () => {};
	const provider = value as Record<string, unknown>;
	const reportedId = provider.sessionId;
	const sessionId = typeof reportedId === "string" && reportedId.trim().length > 0 ? reportedId : undefined;
	const isActive = provider.isActive;
	if (sessionId === undefined || typeof isActive !== "function") return () => {};
	const held: LivenessRegistration = {
		isActive: isActive as () => boolean,
		release: () => {
			if (table.registrations.get(sessionId) === held) table.registrations.delete(sessionId);
		},
	};
	table.registrations.set(sessionId, held);
	return held.release;
}

/**
 * Publishes this entry's half of the provider's session-liveness protocol, while a binding is being
 * set up and before the host starts any session: the provider resolves that slot when a session
 * starts, so publishing later would miss the session this binding serves.
 *
 * A process that already carries a registry keeps it — what another host published there is that
 * host's protocol, and this entry reads nothing from it. The table lives inside the registry object,
 * so this entry's own registrations are exactly as long-lived as the registry that received them,
 * and the provider's own release is what gives one back: nothing here is released on a binding's
 * behalf.
 */
export function publishPiSessionLiveness(): void {
	const holder = globalThis as Record<PropertyKey, unknown>;
	const slot = Symbol.for(SESSION_LIVENESS_REGISTRY_KEY);
	if (holder[slot] !== undefined) return;
	const table: LivenessTable = { registrations: new Map() };
	holder[slot] = {
		version: SUPPORTED_LIVENESS_VERSION,
		register: (value: unknown) => registrationIn(table, value),
		[REGISTRATION_TABLE]: table,
	};
}
