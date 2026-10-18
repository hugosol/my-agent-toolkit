/**
 * pi-subagents accepts one immutable requirement snapshot per parent session, not one per extension.
 * Keep the framework's contributions together, including across loader-created module graphs.
 * Replacing a snapshot is synchronous: a launch cannot observe the gap between dispose/register.
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
