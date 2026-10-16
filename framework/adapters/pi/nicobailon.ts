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
 * Two of its published surfaces are used, both documented: the module
 * `pi-subagents/required-child-extensions`, whose `registerRequiredChildExtensions` requires a host's
 * extension in every child session a parent session spawns, and its versioned request/announcement
 * pair on pi's shared event bus (`subagents:rpc:v1:...`), whose `ping` states the interface version
 * and the session the provider currently serves. Neither surface is read for anything else, and no
 * private field, file layout or bundling detail is depended on.
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

/**
 * The provider's published child-extension module, as its own documentation names it.
 *
 * It is a bare specifier resolved the way every other dependency of this repository is: the pinned
 * artifact sits in this repository's own installed packages, because the adapter's requirement is a
 * development-time pin of the third party this migration targets. A deployment that carries the
 * framework without that artifact loads no such module, which is a provider this entry does not
 * have — not a failure of the harness.
 */
const PROVIDER_MODULE = "pi-subagents/required-child-extensions";

/** The provider's announcement channel: its statement that it is serving a session. */
const PROVIDER_READY_CHANNEL = "subagents:rpc:v1:ready";

/** The provider's request channel. */
const PROVIDER_REQUEST_CHANNEL = "subagents:rpc:v1:request";

/** The prefix a correlated answer arrives under, with the request id appended. */
const PROVIDER_REPLY_PREFIX = "subagents:rpc:v1:reply:";

/** The interface version this integration reads; another version is an interface it cannot read. */
const SUPPORTED_PROVIDER_VERSION = 1;

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
export function createPiSubagentIntegration(extensionId: string, childEntry: string): PiSubagentIntegration {
	/** The provider's module, imported once: a module this process carries or one it does not. */
	const provider: Promise<PiSubagentProvider | undefined> = import(PROVIDER_MODULE).then(
		(loaded: unknown) => providerOf(loaded),
		() => undefined,
	);
	/** The requirements this process holds, by the session each belongs to. */
	const requirements = new Map<string, { dispose(): void }>();
	/** The outcomes of those requirements, by session, so one session is required once. */
	const taken = new Map<string, Promise<Requirement>>();
	/** The provider's own announcement, once it has stated itself. */
	let announced: ProviderAnswer | undefined;
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

	return {
		attach: (pi, publish) => {
			if (host !== undefined) return;
			host = pi;
			report = publish;
			const bus = pi.events;
			if (bus === undefined) return;
			// The provider's own announcement, which is the same answer its query replies with: read
			// when it states itself, so a settle that runs after this session's start needs no query.
			releases.push(bus.on(PROVIDER_READY_CHANNEL, payload => {
				announced ??= providerAnswerOf(payload);
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
	};
}
