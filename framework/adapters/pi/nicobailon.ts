/**
 * The pi adapter's private subagent-provider integration: locating the third party that loads an
 * extension into the child sessions it spawns, requiring this entry there, reading the party's own
 * versioned answer about the session it serves, and releasing what it holds.
 *
 * Nothing here is an extension's business: which provider this host runs, how its public
 * child-extension entry is reached, which version of its interface is read, and what an
 * unavailable or refused answer means are decisions of the adapter that maps this harness. What
 * crosses the adapter's own public surface is the settled {@link SubagentIntegration} an extension
 * is told about, and the diagnostics an operator reads.
 *
 * The third party reached here is nicobailon's `pi-subagents` at the version this repository pins.
 * Three of its published surfaces are used, all documented: the module
 * `pi-subagents/required-child-extensions`, whose `registerRequiredChildExtensions` requires a host's
 * extension in every child session a parent session spawns; its versioned request/announcement
 * pair on pi's shared event bus (`subagents:rpc:v1:...`), whose `ping` states the interface version
 * and the session the provider currently serves; and its versioned session-liveness registry
 * (`Symbol.for("@agegr/pi-web/session-liveness/v1")`), through which the provider states, per
 * session it serves, whether that session still holds work it is waiting on. None of them is read
 * for anything else, and no private field, file layout or bundling detail is depended on.
 *
 * One settle distinguishes four outcomes, and none of them is read as another: no provider artifact
 * in this process is no subagent facility for this entry (the normal shape); a requirement the
 * provider's own registration refuses is a **registration** failure; an announcement or answer this
 * adapter cannot read — refused, or another interface version — is a **protocol** failure; and an
 * interface that answers for another session than the one this entry serves is an **identity**
 * failure. No provider running in this process (nothing announced itself and nothing answered) is the
 * normal shape as well, and it is reported as such: the one thing never done here is answering a
 * failure, or a missing answer, as the other. An answer that names no session is not read as either:
 * it is the provider stating its interface without claiming which session it serves, which is the
 * ordinary shape of a query answered before the provider has a session context.
 */
import type { SubagentIntegration, SubagentIntegrationFailure } from "../../core/protocol";
import type { PiExtensionApi } from "../pi";
import type { SessionBackgroundWork } from "./round";
import { loadPiSubagentProvider } from "./subagent-provider";

/** The provider's announcement channel: its statement that it is serving a session. */
const PROVIDER_READY_CHANNEL = "subagents:rpc:v1:ready";

/** The provider's request channel. */
const PROVIDER_REQUEST_CHANNEL = "subagents:rpc:v1:request";

/** The prefix a correlated answer arrives under, with the request id appended. */
const PROVIDER_REPLY_PREFIX = "subagents:rpc:v1:reply:";

/** The interface version this integration reads; another version is an interface it cannot read. */
const SUPPORTED_PROVIDER_VERSION = 1;

/**
 * The registry slot the provider's published session-liveness protocol is discovered under, and the
 * one interface version of that protocol this adapter publishes and reads.
 *
 * The provider resolves this slot when a session starts and registers one provider for the session
 * it serves, stating that session's identity and answering, on demand, whether it still holds work
 * that session is waiting on. A party that wants that answer has to publish the slot — the protocol
 * states a `register` and no query — so this entry publishes it when the process carries none, which
 * is what makes the provider's own statement readable here, and reads back what the provider
 * registers rather than copying the queues behind it.
 */
const SESSION_LIVENESS_REGISTRY_KEY = "@agegr/pi-web/session-liveness/v1";
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
const REGISTRATION_TABLE = Symbol.for("model-cost:pi-session-liveness:table");

/** One session's registration: the provider's own answer for it, and the release it handed back. */
interface LivenessRegistration {
	readonly isActive: () => boolean;
	readonly release: () => void;
}

/**
 * This entry's own half of the registry it publishes: the provider's registrations, by the session
 * each one names.
 */
interface LivenessTable {
	/** The one registration the provider holds per session it serves. */
	readonly registrations: Map<string, LivenessRegistration>;
}

/** The liveness table of a registry object, or `undefined` when that registry is another party's. */
function livenessTableOf(registry: unknown): LivenessTable | undefined {
	const mapping = mappingOf(registry);
	const table = mapping === undefined ? undefined : (mapping as Record<PropertyKey, unknown>)[REGISTRATION_TABLE];
	return typeof table === "object" && table !== null ? (table as LivenessTable) : undefined;
}

/**
 * This process's session-liveness table: this entry's own, published here when the process carries
 * none, or `undefined` when the slot holds another party's registry.
 *
 * Publishing is what the protocol requires of a party that wants the provider's answer — the slot
 * carries a `register` and no query — and it happens when the slot is free, never over a registry
 * another host published. The table lives inside the registry object, so this entry's own
 * registrations are exactly as long-lived as the registry that received them, and the provider's own
 * release is what gives one back: nothing here is released on a binding's behalf.
 */
function livenessTable(): LivenessTable | undefined {
	const holder = globalThis as Record<PropertyKey, unknown>;
	const slot = Symbol.for(SESSION_LIVENESS_REGISTRY_KEY);
	const existing = holder[slot];
	if (existing !== undefined) return livenessTableOf(existing);
	const table: LivenessTable = { registrations: new Map() };
	holder[slot] = {
		version: SUPPORTED_LIVENESS_VERSION,
		register: (value: unknown) => registrationIn(table, value),
		[REGISTRATION_TABLE]: table,
	};
	return table;
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
	const provider = mappingOf(value);
	const sessionId = textOf(provider?.sessionId);
	const isActive = provider?.isActive;
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
 * How long the settling waits for the provider's announcement or its answer to one query.
 *
 * The wait is paid once per process, at the initialization node, and only until the provider
 * states itself: a provider that is loaded has already announced itself by then in every ordering
 * where it loaded beside this entry, and a query that is answered is answered within a task. A
 * provider that is not there is not waited for twice — the mode is settled once and never moves.
 */
const ANNOUNCEMENT_BUDGET_MS = 300;

/** The public function of the provider this adapter calls. */
export interface PiSubagentProvider {
	registerRequiredChildExtensions(input: {
		readonly sessionId: string;
		readonly extensions: readonly { readonly id: string; readonly path: string }[];
		readonly requireForAllRunners?: boolean;
	}): { dispose(): void };
}

/**
 * The provider's own statement about itself, as far as this adapter reads it: the interface version
 * it speaks and the session it is currently serving.
 */
interface ProviderAnswer {
	readonly version?: number;
	readonly sessionId?: string;
	/** The provider answered and refused: a reachable interface that could not serve this query. */
	readonly refused?: string;
}

/** One plain mapping, or `undefined` when the value is not one. */
function mappingOf(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/** The reading a value states, or `undefined` when it states no number. */
function numberOf(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The text a value states, or `undefined` when it states none or states it empty. */
function textOf(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * The provider's own statement in one bus payload, whichever of its two shapes it arrived in: its
 * announcement payload *is* the answer a `ping` request replies with, and a reply wraps that answer
 * in `data` beside the correlation fields.
 */
function providerAnswerOf(payload: unknown): ProviderAnswer | undefined {
	const record = mappingOf(payload);
	if (record === undefined) return undefined;
	if (record.success === false) {
		const error = mappingOf(record.error);
		return { refused: textOf(error?.message) ?? textOf(record.message) ?? "the provider refused the query" };
	}
	const answer = mappingOf(record.data) ?? record;
	const session = mappingOf(answer.session);
	return { version: numberOf(answer.version), sessionId: textOf(session?.sessionId) };
}

/** Whether a loaded module is the provider interface this adapter calls. */
function providerOf(loaded: unknown): PiSubagentProvider | undefined {
	const module = mappingOf(loaded);
	const register = module?.registerRequiredChildExtensions;
	return typeof register === "function" ? (loaded as PiSubagentProvider) : undefined;
}

/** How one session's requirement turned out, so a settle can tell a failed requirement from none. */
interface Requirement {
	readonly taken: boolean;
	readonly detail?: string;
}

/**
 * The provider integration of one process: the module it reaches, the requirements it holds, and
 * the one settled answer it reports.
 *
 * The object is created once per assembly and attached to the host at the first binding; every
 * requirement it takes is keyed by the session that needs it, so a child session this process
 * spawns for itself is served like the session that spawned this process, and each requirement is
 * released with the session whose life it belonged to.
 */
export interface PiSubagentIntegration {
	/** Attaches this process's integration to the host surface, once. */
	attach(pi: PiExtensionApi, report: (message: string) => void): void;
	/** Takes the requirement for one session: this entry must load in the children it spawns. */
	requireIn(sessionId: string): void;
	/** Releases what one session's requirement held, when that session's own life ends. */
	releaseSession(sessionId: string): void;
	/** Releases everything this integration holds: a binding that does not stay keeps nothing. */
	releaseAll(): void;
	/** Settles this process's one answer, having taken the requirement for `sessionId`. */
	settle(sessionId: string | undefined): Promise<SubagentIntegration>;
	/**
	 * What this process's provider states about one session's background work.
	 *
	 * It is the provider's own published statement, read through the registry this entry publishes for
	 * it, and never a reconstruction of the queues behind it: `holds` while it reports live delegated
	 * work, an undelivered result, a completion notice it has not started or a wake it has not
	 * delivered; `clear` when it reports none of those; and `unread` whenever this entry cannot
	 * obtain that answer at all — a provider that runs here with no registration it holds for this
	 * session, a registration naming another session, a registration whose answer cannot be taken, or
	 * a registry this entry does not hold. None of those is the provider's own `clear`: this entry
	 * does not answer a statement it never read, and reading one as rest would close a Round while
	 * the session was still waiting on work.
	 */
	backgroundActivity(sessionId: string): SessionBackgroundWork;
}

/**
 * The provider integration of one process, as this adapter reads it.
 *
 * `extensionId` is the identity the requirement is stated under in the provider's own launch
 * evidence, and `childEntry` is the module this entry is loaded from — the file the provider loads
 * into every child session. A process whose assembly declares no child entry has nothing to require
 * anywhere and no integration to settle, which the adapter reports as the absence itself rather
 * than as a failed one.
 */
export function createPiSubagentIntegration(extensionId: string, childEntry: string, configPath?: string): PiSubagentIntegration {
	/** Explicit configuration errors are retained for settlement, never read as an absent provider. */
	let loadFailure: string | undefined;
	const provider: Promise<PiSubagentProvider | undefined> = loadPiSubagentProvider(configPath).then(
		(loaded: unknown) => providerOf(loaded),
		(error: unknown) => {
			loadFailure = String(error);
			return undefined;
		},
	);
	/** The requirements this process holds, by the session each belongs to. */
	const requirements = new Map<string, { dispose(): void }>();
	/** The outcomes of those requirements, by session, so one session is required once. */
	const taken = new Map<string, Promise<Requirement>>();
	/** The provider's own announcement, once it has stated itself. */
	let announced: ProviderAnswer | undefined;
	/** Whether the provider stated itself in this process at all, by announcement or by an answer. */
	let serves = false;
	/** How many settling queries this process issued, for correlating the answers to them. */
	let queries = 0;
	/** The one settled answer of this process. */
	let settled: Promise<SubagentIntegration> | undefined;
	/** The host surface, once a binding attached this integration. */
	let host: PiExtensionApi | undefined;
	/** The diagnostic channel every report of this integration is published through. */
	let report: (message: string) => void = () => {};

	const releases: Array<() => void> = [];

	const releaseSession = (sessionId: string): void => {
		const held = requirements.get(sessionId);
		if (held === undefined) return;
		requirements.delete(sessionId);
		taken.delete(sessionId);
		try {
			held.dispose();
		} catch (error) {
			report(`releasing this entry's child requirement for ${sessionId} failed: ${String(error)}`);
		}
	};

	/**
	 * Takes the requirement for one session, once per process per session.
	 *
	 * The requirement is the provider's own registration: it fails loudly when this entry's child
	 * path is not a file the provider can load, when the session already carries one, and when the
	 * module states no such interface. Every one of those is a failed requirement rather than an
	 * absent provider — the difference the settled answer has to keep.
	 */
	const requireInOnce = (sessionId: string): Promise<Requirement> => {
		const existing = taken.get(sessionId);
		if (existing !== undefined) return existing;
		const requirement = provider.then(module => {
			if (module === undefined) return { taken: false, detail: "the provider's child-extension interface could not be loaded" };
			if (requirements.has(sessionId)) return { taken: true };
			try {
				const registration = module.registerRequiredChildExtensions({
					sessionId,
					extensions: [{ id: extensionId, path: childEntry }],
					requireForAllRunners: true,
				});
				requirements.set(sessionId, registration);
				return { taken: true };
			} catch (error) {
				return { taken: false, detail: error instanceof Error ? error.message : String(error) };
			}
		});
		taken.set(sessionId, requirement);
		return requirement;
	};

	/**
	 * The provider's own statement about the session it serves, asked within the one budget.
	 *
	 * Two of the provider's own statements can answer, and both are read here: its *announcement*, which
	 * it makes when it begins serving a session and which carries that session, and its *reply* to this
	 * entry's query, correlated by the request id the query carried. Which of the two arrives first is
	 * not this adapter's to choose — two extensions loading beside each other are started in load order,
	 * and an entry loaded first settles before a provider loaded second has begun serving — so an answer
	 * that states no session is kept as the reading of last resort while the wait goes on for a
	 * statement that does, within the same budget. That ordering is a real one on this host: a query
	 * issued before the provider has a session context is answered on the versioned interface without
	 * naming a session, while the announcement that follows it names the session it serves.
	 *
	 * A refusal is an answer in its own right and settles at once: what it states is that the interface
	 * was reached and would not serve this query, which no later statement changes.
	 */
	const ask = (): Promise<ProviderAnswer | undefined> =>
		new Promise<ProviderAnswer | undefined>(resolve => {
			const bus = host?.events;
			if (bus === undefined) {
				resolve(undefined);
				return;
			}
			const requestId = `pi-adapter-${process.pid}-${++queries}`;
			let answered: ProviderAnswer | undefined;
			let settled = false;
			const finish = (answer: ProviderAnswer | undefined): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				offAnnouncement();
				offReply();
				// Anything that answered — a statement, a refusal, an interface this adapter cannot read —
				// is a provider that is running here, which is what makes a session it did not register
				// for a session whose background work this entry cannot read rather than one at rest.
				if (answer !== undefined) serves = true;
				resolve(answer);
			};
			const timer = setTimeout(() => finish(answered), ANNOUNCEMENT_BUDGET_MS);
			const offAnnouncement = bus.on(PROVIDER_READY_CHANNEL, payload => {
				const answer = providerAnswerOf(payload);
				if (answer !== undefined) finish(answer);
			});
			const offReply = bus.on(`${PROVIDER_REPLY_PREFIX}${requestId}`, payload => {
				const answer = providerAnswerOf(payload);
				if (answer === undefined) return;
				answered = answer;
				if (answer.sessionId !== undefined || answer.refused !== undefined) finish(answer);
			});
			bus.emit(PROVIDER_REQUEST_CHANNEL, { version: 1, requestId, method: "ping", params: {} });
		});

	/**
	 * One failed integration: reported on the diagnostic channel and answered as the failure it is.
	 *
	 * A failure is never answered as the absence of a provider: an operator has to be able to tell a
	 * process that runs no subagent facility from one whose integration broke, and the extension is
	 * told the same thing, so neither is inferred from the other.
	 */
	const failed = (failure: SubagentIntegrationFailure, diagnosis: string): SubagentIntegration => {
		report(diagnosis);
		return { mode: "failed", failure, diagnosis };
	};

	const settleOnce = async (sessionId: string | undefined): Promise<SubagentIntegration> => {
		const module = await provider;
		if (loadFailure !== undefined) return failed("registration", loadFailure);
		const requirement = sessionId === undefined ? undefined : await requireInOnce(sessionId);

		// No provider artifact in this process: no child-extension interface is reachable at all, so
		// this entry states none and no subagent facility serves the sessions it spawns. That is the
		// normal no-subagent shape — a deployment that carries the framework without the provider is
		// not a failed integration — and the requirement that could not be taken beside it is that
		// same absence rather than a registration this entry refused.
		if (module === undefined) return { mode: "none" };

		// The provider's interface is here, and the requirement this entry has to state in the
		// sessions the provider spawns did not take: the provider's own registration refused it (a
		// child path it cannot load, a session that already carries one), or the settle ran with no
		// session to state it for. Either way the wiring this process owes is not in place, and it is
		// reported as the failure it is rather than hidden as a harness that offers no integration.
		if (requirement === undefined) {
			return failed(
				"registration",
				"the subagent provider is reachable, and this entry could not be required in the sessions it spawns: the settle ran with no session to require it in",
			);
		}
		if (!requirement.taken) {
			return failed(
				"registration",
				`the subagent provider is reachable, and it did not accept this entry as a required child extension: ${requirement.detail ?? "unknown reason"}`,
			);
		}

		// The provider's own statement about the session it serves: its announcement, or the answer to
		// this entry's one query. A provider artifact is present and nothing announced itself and
		// nothing answered, so no provider is running in this process — the normal no-subagent shape
		// rather than a failure. A query that is answered is answered, and a `ready` that arrives
		// while the query is out is that same answer.
		const answer = announced ?? (await ask()) ?? announced;
		if (answer === undefined) return { mode: "none" };

		// From here the provider stated itself, so every reading of that statement is a claim about an
		// integration that has to hold: an interface this adapter cannot read, and an answer for
		// another session, are both failures of the integration rather than absent providers.
		if (answer.refused !== undefined) {
			return failed(
				"protocol",
				`the subagent provider refused this entry's query for its interface: ${answer.refused}`,
			);
		}
		if (answer.version !== SUPPORTED_PROVIDER_VERSION) {
			return failed(
				"protocol",
				`the subagent provider speaks interface version ${String(answer.version ?? "<unstated>")}, which this adapter does not read`,
			);
		}
		// An answer that states no session made no claim about *which* session the provider serves, and
		// this adapter reads that as a claim about none rather than as a mismatch: the answer is the
		// provider's own statement about its interface, the requirement this entry stated is what makes
		// the sessions it spawns load this entry, and a statement naming another session is what the
		// check below rejects. Reporting the absence as a failure would make the ordinary ordering in
		// which a query is answered before the provider has a session context look like a broken one.
		if (answer.sessionId !== undefined && sessionId !== undefined && answer.sessionId !== sessionId) {
			return failed(
				"identity",
				`the subagent provider serves a different session (${answer.sessionId}) than the one this entry serves (${sessionId})`,
			);
		}
		return { mode: "subagents" };
	};

	/**
	 * What this process's provider states about one session's background work, read from the registry
	 * this entry publishes for it.
	 *
	 * Only the provider's own answer is read: a registration it holds for this exact session, asked
	 * for its own reading at this instant. Every other shape is answered as the statement this entry
	 * could not read rather than as a session at rest — a registration naming another session, a
	 * provider that stated itself without leaving one for this session, a registry another party
	 * published, and an answer that cannot be taken all leave the question open. A process in which no
	 * provider stated itself and no registration was left is the one case this entry answers `clear`
	 * for: there is no provider facility in this process whose work a session could be waiting on, so
	 * the harness's own facts are the whole rest condition rather than something invented here.
	 */
	const backgroundActivity = (sessionId: string): SessionBackgroundWork => {
		const table = livenessTable();
		if (table === undefined) {
			return {
				state: "unread",
				reason:
					"this process already carries a session-liveness registry this entry did not publish, so the subagent provider's own statement about a session cannot be read here",
			};
		}
		const registration = table.registrations.get(sessionId);
		if (registration !== undefined) {
			try {
				return registration.isActive() ? { state: "holds" } : { state: "clear" };
			} catch (error) {
				return {
					state: "unread",
					reason: `reading whether the subagent provider still holds background work for this session failed: ${error instanceof Error ? error.message : String(error)}`,
				};
			}
		}
		if (!serves && table.registrations.size === 0) return { state: "clear" };
		return {
			state: "unread",
			reason: table.registrations.size === 0
				? "the subagent provider serving this process left no session-liveness registration, so it states nothing about this session"
				: "the subagent provider serving this process registered for another session, so it states nothing about this session",
		};
	};

	return {
		attach: (pi, publish) => {
			if (host !== undefined) return;
			host = pi;
			report = publish;
			// This entry's own half of the provider's published session-liveness protocol: the registry
			// is published here, while this binding is being set up and before the host starts any
			// session, because the provider resolves that slot when a session starts. A process that
			// already carries one keeps it: what another host published there is that host's protocol.
			livenessTable();
			const bus = pi.events;
			if (bus === undefined) return;
			// The provider's own announcement, which is the same answer its query replies with: read
			// when it states itself, so a settle that runs after this session's start needs no query.
			releases.push(bus.on(PROVIDER_READY_CHANNEL, payload => {
				const answer = providerAnswerOf(payload);
				if (answer === undefined) return;
				announced ??= answer;
				serves = true;
			}));
		},
		requireIn: sessionId => {
			void requireInOnce(sessionId);
		},
		releaseSession,
		releaseAll: () => {
			for (const sessionId of [...requirements.keys()]) releaseSession(sessionId);
			for (const release of releases.splice(0)) release();
		},
		settle: sessionId => {
			settled ??= settleOnce(sessionId);
			return settled;
		},
		backgroundActivity,
	};
}
