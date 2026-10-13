/**
 * The Turn axis's native mapping at the public adapter seam (S1; contract P57; ticket 05).
 *
 * What the framework owes here is the *mapping*, not the Turn rules (those are the port double's
 * suite): a request start becomes a start signal with the request's own model and session; the
 * response boundary becomes the HTTP facts; the finalized assistant message becomes the settle with
 * its outcome and its reported usage. Above all, the harness's own turn boundary — which fires only
 * after the requested tools ran and carries their results — is not this axis's end. That is shown
 * by driving it: a tool-requesting response settles its Turn before the tools run, delivering that
 * native boundary changes nothing, and the follow-up request is a Turn with an identity of its own.
 * An adapter that copied the native boundary would make tool execution part of a Turn the contract
 * keeps it outside of, and the assertions here would catch it.
 *
 * The session facts an adapter resolves are observed here too: identity from the session manager,
 * the direct parent one hop through the harness's own agent registry (never a nesting depth or an
 * agent-name hierarchy), and the latest display name read live — each of them named as unavailable
 * rather than guessed when this host cannot report it.
 */
import { describe, expect, test } from "bun:test";
import type {
	OmpAgentMessage,
	OmpCommandContext,
	OmpExtensionApi,
	OmpSessionContext,
} from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";
import type {
	CatalogPriceSource,
	OwnerReference,
	RoundDelivery,
	SessionFacts,
	TurnEndDelivery,
	TurnSignal,
	TurnStartDelivery,
} from "../../framework/core/protocol";
import type { ExtensionDefinition, ImplementationContext } from "../../framework/public";
import { withCapturedStderr } from "./support/captured-stderr";

/** The definition under test: it declares nothing beyond what the assembly injects. */
const PROBE: ExtensionDefinition = { id: "turn-probe", displayName: "turnProbe" };

/** One agent as the harness's registry holds it. */
interface AgentRow {
	readonly id: string;
	readonly kind: "main" | "sub";
	readonly parentId?: string;
	/** The session id of this agent's live session; absent models a parked agent. */
	readonly sessionId?: string;
}

/**
 * One model as the harness's own catalog states it: its identity and the price it states per
 * million tokens, in the four buckets the framework's catalog price carries.
 */
interface NativeModelRow {
	readonly id: string;
	readonly provider: string;
	/** Absent models a catalog entry that states no cost at all. */
	readonly cost?: {
		readonly input?: number;
		readonly output?: number;
		readonly cacheRead?: number;
		readonly cacheWrite?: number;
	};
}

/** The session one native context reports. */
interface SessionSurface {
	readonly sessionId: string;
	readonly agent: { readonly kind: "main" | "sub"; readonly id: string; readonly parentId?: string };
	/** The name the session manager reports; absent models a surface that reports none. */
	readonly name?: string;
	/** The model the context reports; absent models a context with no model fact. */
	readonly model?: { readonly id?: string; readonly provider?: string };
	/** The harness's own model catalog; absent models a context that reports no model query. */
	readonly models?: readonly NativeModelRow[];
	/**
	 * The harness's own registry, as this context reports it; absent models a context that reports no
	 * registry at all. The two queries are the ones an extension's own provider access is mapped from.
	 */
	readonly registry?: {
		readonly baseUrls?: Readonly<Record<string, string>>;
		readonly credentials?: Readonly<Record<string, string>>;
	};
}

interface NativeSurface {
	readonly api: OmpExtensionApi;
	readonly registrations: string[];
	/** The Turn edges the framework dispatched, in call order. */
	readonly starts: TurnStartDelivery[];
	readonly ends: TurnEndDelivery[];
	/** The actual session facts each Turn start carried. */
	readonly turnSessions: SessionFacts[];
	/** The actual session facts each round edge carried. */
	readonly roundSessions: SessionFacts[];
	/** The context the framework handed the factory, once the binding ran. */
	readonly implementationContext: () => ImplementationContext;
	startRequest(surface: SessionSurface): void;
	responseArrives(surface: SessionSurface, http: { status: number; requestId?: string }): void;
	streamUsage(surface: SessionSurface, message: OmpAgentMessage): void;
	messageEnds(surface: SessionSurface, message: OmpAgentMessage): void;
	/** Delivers the harness's own turn boundary, the one that fires after the requested tools ran. */
	nativeTurnEnd(surface: SessionSurface, toolResults: readonly unknown[]): void;
	runStarts(surface: SessionSurface): void;
}

/**
 * The native surface one binding is driven through.
 *
 * `registry` is the harness's own agent graph: the suite states which agents exist, which are
 * parked (no live session) and which the registry does not hold at all. `catalogFor` is the
 * catalog the probe implementation supplies, built from the context the framework handed its
 * factory — the way an extension composes the harness's own model prices with its maintained ones.
 */
function boundSurface(
	registry: readonly AgentRow[] = [],
	catalogFor?: (context: ImplementationContext) => CatalogPriceSource | undefined,
): NativeSurface {
	const hookHandlers = new Map<string, Array<(event: never, ctx: OmpSessionContext) => void>>();
	const registrations: string[] = [];
	const starts: TurnStartDelivery[] = [];
	const ends: TurnEndDelivery[] = [];
	const turnSessions: SessionFacts[] = [];
	const roundSessions: SessionFacts[] = [];
	const rounds: RoundDelivery[] = [];
	/** The context the framework handed this assembly's factory, as the extension saw it. */
	let implementationContext: ImplementationContext | undefined;

	const contextOf = (surface: SessionSurface): OmpSessionContext => ({
		agent: surface.agent,
		sessionManager: {
			getSessionId: () => surface.sessionId,
			getBranch: () => [],
			...(surface.name === undefined ? {} : { getSessionName: () => surface.name }),
		},
		...(surface.model === undefined ? {} : { model: surface.model }),
		...(surface.models === undefined ? {} : { models: { list: () => surface.models as readonly NativeModelRow[] } }),
		...(surface.registry === undefined
			? {}
			: {
					modelRegistry: {
						getProviderBaseUrl: (provider: string) => surface.registry?.baseUrls?.[provider],
						getApiKeyForProvider: async (provider: string) => surface.registry?.credentials?.[provider],
					},
				}),
		hasUI: true,
		ui: { notify: () => {}, setWidget: () => {} },
	});

	const api: OmpExtensionApi = {
		setLabel(label): void {
			registrations.push(`label:${label}`);
		},
		registerCommand(): void {},
		appendEntry(): void {},
		on(event: string, handler: never): void {
			const list = hookHandlers.get(event) ?? [];
			list.push(handler as (event: never, ctx: OmpSessionContext) => void);
			hookHandlers.set(event, list);
		},
		pi: {
			AgentRegistry: {
				global: () => ({
					get: (id: string) => {
						const row = registry.find(candidate => candidate.id === id);
						if (row === undefined) return undefined;
						return {
							id: row.id,
							kind: row.kind,
							...(row.parentId === undefined ? {} : { parentId: row.parentId }),
							session:
								row.sessionId === undefined
									? null
									: { sessionManager: { getSessionId: () => row.sessionId as string } },
						};
					},
				}),
			},
		},
	};

	const factory = frameworkOmp.ompAdapter(PROBE, {
		factory: context => {
			implementationContext = context;
			const catalog = catalogFor?.(context);
			return {
				...(catalog === undefined ? {} : { catalog }),
				subscriptions: [
					{
						scope: "session",
						events: {
							turn_start: delivery => {
								const start = delivery as TurnStartDelivery;
								starts.push(start);
								turnSessions.push(start.turn.session);
							},
							turn_end: delivery => void ends.push(delivery as TurnEndDelivery),
							round_start: delivery => {
								rounds.push(delivery as RoundDelivery);
								roundSessions.push((delivery as RoundDelivery).session);
							},
						},
					},
				],
			};
		},
	});
	if (!factory(api).bound) throw new Error("the turn probe definition did not bind");

	const deliver = (event: string, payload: never, ctx: OmpSessionContext): void => {
		for (const handler of hookHandlers.get(event) ?? []) handler(payload, ctx);
	};

	return {
		api,
		registrations,
		starts,
		ends,
		turnSessions,
		roundSessions,
		implementationContext: () => {
			if (implementationContext === undefined) throw new Error("the probe factory never ran");
			return implementationContext;
		},
		startRequest: surface => deliver("before_provider_request", { type: "before_provider_request", payload: {} } as never, contextOf(surface)),
		responseArrives: (surface, http) =>
			deliver(
				"after_provider_response",
				{
					type: "after_provider_response",
					status: http.status,
					headers: { "x-request-id": http.requestId ?? "req-wire" },
					requestId: http.requestId,
				} as never,
				contextOf(surface),
			),
		streamUsage: (surface, message) =>
			deliver("message_update", { type: "message_update", message } as never, contextOf(surface)),
		messageEnds: (surface, message) =>
			deliver("message_end", { type: "message_end", message } as never, contextOf(surface)),
		nativeTurnEnd: (surface, toolResults) =>
			deliver(
				"turn_end",
				{ type: "turn_end", turnIndex: 0, message: { role: "assistant" }, toolResults } as never,
				contextOf(surface),
			),
		runStarts: surface =>
			deliver("agent_start", { type: "agent_start" } as never, contextOf(surface)),
	};
}

/** The main session, as the harness reports it. */
const MAIN: SessionSurface = {
	sessionId: "sess-main",
	agent: { kind: "main", id: "Main" },
	name: "main session",
	model: { id: "deepseek-v4-pro", provider: "deepseek" },
};

/** One assistant response, as the harness hands its finalized message over. */
function assistantMessage(overrides: Partial<OmpAgentMessage> = {}): OmpAgentMessage {
	return {
		role: "assistant",
		stopReason: "stop",
		responseId: "resp-wire-9",
		usage: { input: 10, output: 7, cacheRead: 3, cacheWrite: 0, totalTokens: 20 },
		...overrides,
	};
}

describe("the native model-cycle facts map to the framework's Turn facts (P57)", () => {
	test("a tool-requesting response settles its own Turn before the tools run, and the follow-up request is a new Turn", () => {
		const surface = boundSurface();
		surface.runStarts(MAIN);
		surface.startRequest(MAIN);
		surface.responseArrives(MAIN, { status: 200, requestId: "req-wire-1" });
		surface.messageEnds(MAIN, assistantMessage({ stopReason: "toolUse", responseId: "resp-tools" }));

		// The Turn ended at the response, before the tool it requested ran: the end is already
		// delivered by the time the tool's own execution could have happened.
		expect(surface.ends).toHaveLength(1);
		expect(surface.ends[0].end.outcome).toBe("completed");
		expect(surface.ends[0].end.providerResponseId).toBe("resp-tools");

		// The harness's own turn boundary — the event that fires once the requested tools finished and
		// that carries their results — neither ends a Turn nor starts one.
		surface.nativeTurnEnd(MAIN, [{ toolCallId: "call-dock-1" }]);
		expect(surface.starts).toHaveLength(1);
		expect(surface.ends).toHaveLength(1);

		// The follow-up request the tool's result provoked is a Turn of its own, with its own identity
		// and its own request-time facts; nothing about the first cycle is reused for it.
		surface.startRequest(MAIN);
		surface.responseArrives(MAIN, { status: 200, requestId: "req-wire-2" });
		surface.messageEnds(MAIN, assistantMessage({ responseId: "resp-final" }));

		expect(surface.starts).toHaveLength(2);
		expect(surface.ends).toHaveLength(2);
		expect(surface.starts[1].turn.turnId).not.toBe(surface.starts[0].turn.turnId);
		expect(surface.ends[0].turn.turnId).toBe(surface.starts[0].turn.turnId);
		expect(surface.ends[1].turn.turnId).toBe(surface.starts[1].turn.turnId);
		expect(surface.starts[1].turn.session).toEqual(surface.starts[0].turn.session);
		expect(surface.ends[1].end.providerRequestId).toBe("req-wire-2");
	});

	test("a request start fixes the request's own model and the actual session facts", () => {
		const surface = boundSurface();
		surface.startRequest(MAIN);

		expect(surface.starts).toHaveLength(1);
		const start = surface.starts[0].turn;
		expect(start.provider).toBe("deepseek");
		expect(start.model).toBe("deepseek-v4-pro");
		expect(start.session).toEqual({
			sessionId: "sess-main",
			kind: "main",
			name: "main session",
			unavailable: [],
		});
		// No round was opened for this session, so the fact is named rather than invented.
		expect(start.roundId).toBeUndefined();
		expect(start.unavailable).toEqual(["round", "catalog price"]);
	});

	test("the response boundary and the finalized assistant message are one Turn's end", () => {
		const surface = boundSurface();
		surface.runStarts(MAIN);
		surface.startRequest(MAIN);
		surface.responseArrives(MAIN, { status: 200, requestId: "req-wire-1" });
		surface.messageEnds(MAIN, assistantMessage());

		expect(surface.ends).toHaveLength(1);
		const end = surface.ends[0];
		expect(end.turn.roundId).toBe("sess-main#1");
		expect(end.end.usage).toEqual({ input: 10, output: 7, cacheRead: 3, cacheWrite: 0, totalTokens: 20 });
		expect(end.end.http?.status).toBe(200);
		expect(end.end.http?.headers).toEqual({ "x-request-id": "req-wire-1" });
		expect(end.end.providerRequestId).toBe("req-wire-1");
		expect(end.end.providerResponseId).toBe("resp-wire-9");
		expect(end.end.outcome).toBe("completed");
	});

	test("an interrupted response is cancelled and a failed one is failed", () => {
		const cancelled = boundSurface();
		cancelled.startRequest(MAIN);
		cancelled.messageEnds(MAIN, assistantMessage({ stopReason: "aborted" }));
		expect(cancelled.ends[0].end.outcome).toBe("cancelled");

		const failed = boundSurface();
		failed.startRequest(MAIN);
		failed.messageEnds(MAIN, assistantMessage({ stopReason: "error", errorMessage: "upstream 503" }));
		expect(failed.ends[0].end.outcome).toBe("failed");
	});

	test("a message that is not the assistant response settles nothing", () => {
		const surface = boundSurface();
		surface.startRequest(MAIN);
		surface.messageEnds(MAIN, { role: "user" });
		surface.messageEnds(MAIN, { role: "toolResult" });

		expect(surface.ends).toHaveLength(0);
	});

	test("a context that reports no model fact starts no Turn, and says so on the diagnostic channel", () => {
		const surface = boundSurface();
		const { stderr } = withCapturedStderr(() => surface.startRequest({ ...MAIN, model: undefined }));

		// No start is fabricated for a request whose model identity this host did not report, and the
		// fact that could not be obtained is what the operator channel says.
		expect(surface.starts).toHaveLength(0);
		expect(stderr).toContain("reports no model identity at a request start");
	});

	test("a streamed reading is reported once per distinct usage, never as the final one", () => {
		const surface = boundSurface();
		surface.startRequest(MAIN);
		surface.streamUsage(MAIN, assistantMessage({ usage: { input: 4, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 4 } }));
		surface.streamUsage(MAIN, assistantMessage({ usage: { input: 4, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 4 } }));
		surface.streamUsage(MAIN, assistantMessage({ usage: { input: 4, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 6 } }));

		// Two reports for three events: the unchanged repeat is not a fact this adapter reports.
		expect(surface.starts).toHaveLength(1);
		expect(surface.ends).toHaveLength(0);
	});

	test("a round edge and a Turn of one session carry that session's own facts", () => {
		const surface = boundSurface([
			{ id: "Main", kind: "main", sessionId: "sess-main" },
			{ id: "wf-child", kind: "sub", parentId: "Main", sessionId: "sess-child" },
			{ id: "wf-child.wf-grand", kind: "sub", parentId: "wf-child", sessionId: "sess-grand" },
		]);
		const child: SessionSurface = {
			sessionId: "sess-child",
			agent: { kind: "sub", id: "wf-child", parentId: "Main" },
			name: "child task",
			model: { id: "deepseek-flash", provider: "deepseek" },
		};
		const grand: SessionSurface = {
			sessionId: "sess-grand",
			agent: { kind: "sub", id: "wf-child.wf-grand", parentId: "wf-child" },
			model: { id: "deepseek-flash", provider: "deepseek" },
		};

		surface.runStarts(child);
		surface.startRequest(child);
		surface.startRequest(grand);

		expect(surface.roundSessions[0]).toEqual({
			sessionId: "sess-child",
			kind: "sub",
			parentSessionId: "sess-main",
			name: "child task",
			unavailable: [],
		});
		expect(surface.turnSessions[0]).toEqual(surface.roundSessions[0]);
		// A grandchild's direct parent is the child session, not the top-level main session, and the
		// missing name is named rather than borrowed from the parent.
		expect(surface.turnSessions[1]).toEqual({
			sessionId: "sess-grand",
			kind: "sub",
			parentSessionId: "sess-child",
			unavailable: ["session name"],
		});
	});

	test("a parent the registry does not hold, and one that is parked, are unavailable facts", () => {
		const unheld = boundSurface([{ id: "Main", kind: "main", sessionId: "sess-main" }]);
		const unheldRun = withCapturedStderr(() =>
			unheld.startRequest({
				sessionId: "sess-child",
				agent: { kind: "sub", id: "gone", parentId: "unknown-parent" },
				model: { id: "deepseek-flash", provider: "deepseek" },
			}),
		);
		expect(unheld.turnSessions[0]).toEqual({
			sessionId: "sess-child",
			kind: "sub",
			unavailable: ["direct parent session", "session name"],
		});

		// A parent entry that exists but whose live session is gone resolves no owner either, and
		// says so on the same channel: the session's own deliveries still reach a per-session group.
		const parked = boundSurface([{ id: "Main", kind: "main" }]);
		const parkedRun = withCapturedStderr(() =>
			parked.startRequest({
				sessionId: "sess-child",
				agent: { kind: "sub", id: "wf-child", parentId: "Main" },
				model: { id: "deepseek-flash", provider: "deepseek" },
			}),
		);
		expect(unheldRun.stderr).toContain("no owning main session resolved");
		expect(parkedRun.stderr).toContain("no owning main session resolved");
		expect(parked.turnSessions[0]).toEqual({
			sessionId: "sess-child",
			kind: "sub",
			unavailable: ["direct parent session", "session name"],
		});
	});

	test("the framework's owner scope is untouched by the wider observation", () => {
		const surface = boundSurface();
		surface.startRequest(MAIN);
		surface.messageEnds(MAIN, assistantMessage());

		// The delivery names the owner the adapter resolved for the session that reported the fact.
		expect(surface.starts[0].owner).toEqual<OwnerReference>({ kind: "owner", key: "main:sess-main" });
		expect(surface.ends[0].owner).toEqual<OwnerReference>({ kind: "owner", key: "main:sess-main" });
	});
});

describe("the harness's own model prices reach the factory and the request-start snapshot", () => {
	/**
	 * The harness catalog one case reports: a model it prices, a model it prices at zero, and a
	 * pair it does not carry at all. The amounts are the suite's own numbers, in the harness's own
	 * unit (US dollars per million tokens), so no expectation below is a real provider's price.
	 */
	const HARNESS_MODELS: readonly NativeModelRow[] = [
		{ id: "plan-luna", provider: "plan-provider", cost: { input: 1, output: 2, cacheRead: 1, cacheWrite: 2 } },
		{ id: "plan-free", provider: "plan-provider", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
	];

	/** The allowance plan's own session, running a model the harness itself prices. */
	const PLAN: SessionSurface = {
		sessionId: "sess-plan",
		agent: { kind: "main", id: "Main" },
		name: "plan session",
		model: { id: "plan-luna", provider: "plan-provider" },
		models: HARNESS_MODELS,
	};

	/** The probe implementation whose whole catalog is the harness's own prices, as a fact. */
	const harnessPriced = (context: ImplementationContext): CatalogPriceSource | undefined => context.modelPrices;

	test("a request-time snapshot carries the harness's own price for that provider and model", () => {
		const surface = boundSurface([], harnessPriced);
		surface.startRequest(PLAN);

		expect(surface.starts).toHaveLength(1);
		const start = surface.starts[0].turn;
		expect(start.provider).toBe("plan-provider");
		expect(start.model).toBe("plan-luna");
		expect(start.price).toEqual({
			currency: "USD",
			unit: "USD/百万 token",
			amounts: { input: 1, output: 2, cacheRead: 1, cacheWrite: 2 },
		});
		// A price the harness stated is a fact, so nothing about it is reported as unavailable.
		expect(start.unavailable).not.toContain("catalog price");
	});

	test("a pair the harness does not price, and one it prices at zero, are both no price at all", () => {
		const unknown = boundSurface([], harnessPriced);
		unknown.startRequest({ ...PLAN, model: { id: "plan-unlisted", provider: "plan-provider" } });
		expect(unknown.starts[0].turn.price).toBeUndefined();
		expect(unknown.starts[0].turn.unavailable).toContain("catalog price");

		// A model the harness carries but prices at zero on every bucket is not a price of zero: the
		// snapshot has no price to carry, and saying so is what keeps a free-looking amount out.
		const zeroPriced = boundSurface([], harnessPriced);
		zeroPriced.startRequest({ ...PLAN, model: { id: "plan-free", provider: "plan-provider" } });
		expect(zeroPriced.starts[0].turn.price).toBeUndefined();
		expect(zeroPriced.starts[0].turn.unavailable).toContain("catalog price");
	});

	test("a harness that reports no model catalog answers no price rather than guessing one", () => {
		const surface = boundSurface([], harnessPriced);
		surface.startRequest({ ...PLAN, models: undefined });

		expect(surface.starts[0].turn.price).toBeUndefined();
		expect(surface.starts[0].turn.unavailable).toContain("catalog price");
	});
});

describe("the harness's own provider access reaches the factory as a per-operation query", () => {
	/** The registry one case's session reports: the address and the credential of one provider. */
	const REGISTRY = {
		baseUrls: { deepseek: "https://api.deepseek.com/v1" },
		credentials: { deepseek: "sk-live-one", "opencode-go": "N/A" },
	};

	test("the query answers the current address and credential of the provider it is asked about", async () => {
		const surface = boundSurface();
		// A real binding reports its registry on its own deliveries; this is the first, before any
		// operation asks for access.
		surface.startRequest({ ...MAIN, registry: REGISTRY });
		const access = surface.implementationContext().providerAccess;
		expect(access).toBeDefined();
		expect(await access?.resolve("deepseek")).toEqual({
			baseUrl: "https://api.deepseek.com/v1",
			credential: "sk-live-one",
		});
	});

	test("the keyless sentinel is no credential, and a provider the host cannot answer for is no access", async () => {
		const surface = boundSurface();
		surface.startRequest({ ...MAIN, registry: REGISTRY });
		const access = surface.implementationContext().providerAccess;

		// The registry's own convention for a provider that needs no credential is a sentinel, not a
		// credential made of three letters: it is mapped away, so a provider whose only fact was the
		// sentinel has no access to hand over rather than a credential of "N/A".
		expect(await access?.resolve("opencode-go")).toBeUndefined();
		expect(await access?.resolve("unlisted-provider")).toBeUndefined();
	});

	test("a context that reported no registry answers nothing rather than guessing the host's access", async () => {
		const surface = boundSurface();
		// This delivery's context carries no registry at all, which is what a surface that reports none
		// looks like: the query exists — the adapter's surface can carry one — but it has no fact to
		// answer with, so it answers nothing rather than an empty or borrowed credential.
		surface.startRequest(MAIN);
		const access = surface.implementationContext().providerAccess;
		expect(await access?.resolve("deepseek")).toBeUndefined();
	});
});
