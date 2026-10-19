/**
 * The public factory, its validated configuration and the implementation lifecycle (P56).
 *
 * The seam is the production binding: a definition declared through `defineExtension`, an
 * assembly's factory handed to the binding through the adapter's own options, and the deliveries
 * a harness would resolve. The suite reads what the factory was handed, when the one-time
 * initialization ran relative to the first model request, and that the one cleanup runs exactly
 * once — never through an internal dispatch entry.
 */
import { describe, expect, test } from "bun:test";
import type {
	OmpCommandContext,
	OmpExtensionApi,
	OmpExtensionFactory,
	OmpSessionContext,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import type { ImplementationContext, InitializationDelivery } from "../../framework/interface/details/implementation";
import type { SessionEvent, SessionStartReason } from "../../framework/interface/session";
import type { OwnerReference } from "../../framework/interface/state";
import type { SubagentIntegration } from "../../framework/interface/subagent";
import { type ExtensionDefinition, defineExtension } from "../../framework/interface";
import { portDouble } from "./support/harness-port-double";

/** The owner every delivery in this suite acts on unless one is named. */
const OWNER = { kind: "owner", key: "main:factory" } as const;

/** A definition with a configuration, one prompt slot and one toggle command. */
function probe(id: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		commands: [{ type: "toggle", name: `${id}-toggle`, state: "enabled" }],
		prompts: [{ tag: "instructions", strategy: "first-enabled-run", content: `${id} instructions` }],
		config: { fields: { greeting: "non-empty-string" } },
	});
}

/** A configuration source that serves one fixed document without touching a file system. */
function reading(text: string): { readonly reader: () => string } {
	return { reader: () => text };
}

/** The delivery one session boundary is, as a suite states it. */
function start(reason: SessionStartReason = "initial"): SessionEvent {
	return { kind: "session_start", reason };
}

describe("the factory is called with the validated configuration, before anything is registered (P56)", () => {
	test("the factory receives the values the declared file was validated to carry", () => {
		const seen: ImplementationContext[] = [];
		const double = portDouble();
		const bound = double.bind(probe("factory-values"), {
			config: reading("greeting: hello\n"),
			factory: context => {
				seen.push(context);
				return {};
			},
		});

		expect(bound.bound).toBe(true);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.config).toEqual({ greeting: "hello" });
		// The actual context the framework built: the validated configuration and the Session
		// capability, with no grouped provider member or builder added beside them.
		expect(Object.keys(seen[0] ?? {}).sort()).toEqual(["config", "session"]);
	});

	test("the factory context carries the provider facts under their own names, without a grouped provider member", () => {
		const seen: ImplementationContext[] = [];
		const modelPrices = { priceOf: () => undefined };
		const providerAccess = { resolve: async () => undefined };
		const double = portDouble({ modelPrices, providerAccess });
		const bound = double.bind(probe("factory-facts"), {
			config: reading("greeting: hello\n"),
			factory: context => {
				seen.push(context);
				return {};
			},
		});

		expect(bound.bound).toBe(true);
		// The same queries the adapter mapped, handed over as themselves rather than wrapped in a
		// `provider` object: an extension reads `context.modelPrices` and `context.providerAccess`.
		expect(seen[0]?.modelPrices).toBe(modelPrices);
		expect(seen[0]?.providerAccess).toBe(providerAccess);
		expect(Object.keys(seen[0] ?? {}).sort()).toEqual(["config", "modelPrices", "providerAccess", "session"]);
		expect("provider" in (seen[0] ?? {})).toBe(false);
	});

	test("a definition whose configuration is illegal never reaches a factory", () => {
		let called = 0;
		const double = portDouble();
		const bound = double.bind(probe("factory-refused"), {
			config: reading("greeting: ''\n"),
			factory: () => {
				called += 1;
				return {};
			},
		});

		expect(bound.bound).toBe(false);
		expect(called).toBe(0);
		expect(double.diagnostics.join("\n")).toContain("configuration error");
	});

	test("binding performs no delivery and no initialization of its own", () => {
		const order: string[] = [];
		const double = portDouble();
		double.bind(probe("factory-quiet"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				initialize: () => {
					order.push("initialized");
				},
			}),
		});

		// The command was registered, and nothing else happened: creation is not an effect.
		expect(double.registrations).toContain("command:factory-quiet-toggle");
		expect(order).toEqual([]);
	});
});

describe("the one-time initialization runs at the owner session node, and the first request waits for it (P56)", () => {
	test("the initialization runs once, at the first owner session, and is not repeated", async () => {
		const owners: string[] = [];
		const double = portDouble();
		double.bind(probe("init-once"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				initialize: delivery => {
					owners.push(delivery.owner.kind === "owner" ? delivery.owner.key : "<not-an-owner>");
				},
			}),
		});

		double.deliverSession(OWNER, { event: start() });
		await Promise.resolve();
		double.deliverSession({ kind: "owner", key: "main:factory-2" }, { event: start("new") });
		await Promise.resolve();

		expect(owners).toEqual([OWNER.key]);
	});

	test("the initialization delivery carries the approved surface and no internal transport", async () => {
		const deliveries: InitializationDelivery[] = [];
		const double = portDouble();
		double.bind(probe("init-surface"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				initialize: delivery => {
					deliveries.push(delivery);
					delivery.feedback.notify("info", "initialized");
				},
			}),
		});

		const boundary = double.deliverSession(OWNER, { event: start(), hasUI: false });
		await Promise.resolve();

		// The actual delivery the framework constructed, not a type: it is exactly the four approved
		// members, and each is usable as the extension's own. A fifth member — the marker area
		// transport, an internal engine or anything else — would be visible here.
		expect(deliveries).toHaveLength(1);
		expect(Object.keys(deliveries[0]!).sort()).toEqual(["feedback", "hasUI", "owner", "subagents"]);
		expect(deliveries[0]!.owner).toEqual(OWNER);
		expect(deliveries[0]!.hasUI).toBe(false);
		expect(deliveries[0]!.subagents).toEqual({ mode: "none" });
		expect(boundary.feedback).toEqual([{ level: "info", message: "initialized" }]);

		const keys = (value: unknown): string[] => {
			if (typeof value !== "object" || value === null) return [];
			return Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]);
		};
		expect(keys(deliveries[0])).not.toContain("markers");
		expect(keys(deliveries[0])).not.toContain("publishMarkers");
	});

	test("the first model request is handed the contribution only after the initialization settled", async () => {
		const order: string[] = [];
		let release: (() => void) | undefined;
		const double = portDouble();
		double.bind(probe("init-waits"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				initialize: async () => {
					order.push("initialize started");
					await new Promise<void>(resolve => {
						release = resolve;
					});
					order.push("initialize settled");
				},
			}),
		});

		double.deliverSession(OWNER, { event: start(), statePayloads: [{ enabled: true }] });
		let requestSettled = false;
		const request = double.initiateRun(OWNER).then(initiated => {
			requestSettled = true;
			return initiated;
		});
		// Several microtask turns, and still no request: an implementation that did not wait would
		// have settled here, because a synchronous plan resolves through the double's own promise.
		for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();

		// The initialization is still in flight, so the request is waiting: nothing has been
		// planned for it and it has not settled.
		expect(order).toEqual(["initialize started"]);
		expect(requestSettled).toBe(false);

		release?.();
		const initiated = await request;

		expect(order).toEqual(["initialize started", "initialize settled"]);
		expect(initiated.contribution?.content).toBe("init-waits instructions");
	});

	test("a session that keeps its identity, and a subagent's session, never initialize again", async () => {
		const starts: string[] = [];
		const double = portDouble();
		double.bind(probe("init-identities"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				initialize: delivery => {
					starts.push(delivery.owner.kind === "owner" ? delivery.owner.key : "<not-an-owner>");
				},
			}),
		});

		// The same owner twice — a reload, a resume, a tree navigation — and a subagent session that
		// follows it: neither is a second business instance, and neither initializes anything.
		double.deliverSession(OWNER, { event: start() });
		await Promise.resolve();
		double.deliverSession(OWNER, { event: start("resume") });
		await Promise.resolve();
		double.deliverSession({ kind: "inherited", key: "main:factory" }, { event: start("new") });
		await Promise.resolve();

		expect(starts).toEqual([OWNER.key]);
	});

	test("a later request is handed its contribution without waiting again", async () => {
		const order: string[] = [];
		const double = portDouble();
		double.bind(probe("init-later"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				initialize: () => {
					order.push("initialize");
				},
			}),
		});

		double.deliverSession(OWNER, { event: start(), statePayloads: [{ enabled: true }] });
		await double.initiateRun(OWNER);
		const second = await double.initiateRun(OWNER);

		expect(order).toEqual(["initialize"]);
		expect(second.contribution?.content).toBe("init-later instructions");
	});
});

describe("the one cleanup runs exactly once, and the binding then delivers nothing (P56)", () => {
	test("the session that initialized the instance ends it, and a second end cleans nothing again", () => {
		let cleanups = 0;
		const double = portDouble();
		double.bind(probe("cleanup-once"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				cleanup: () => {
					cleanups += 1;
				},
			}),
		});

		const delivered: string[] = [];
		double.bind(probe("cleanup-once"));
		double.deliverSession(OWNER, { event: start() });
		expect(cleanups).toBe(0);

		double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" } });
		double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" } });

		expect(cleanups).toBe(1);
		expect(delivered).toEqual([]);
	});

	test("a session end that is not the initializing owner's never ends the instance", () => {
		let cleanups = 0;
		const double = portDouble();
		double.bind(probe("cleanup-other"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				cleanup: () => {
					cleanups += 1;
				},
			}),
		});

		double.deliverSession(OWNER, { event: start() });
		double.deliverSession({ kind: "owner", key: "main:someone-else" }, {
			event: { kind: "session_end", reason: "disposed" },
		});
		double.deliverSession(OWNER, { event: { kind: "session_end", reason: "transferred" } });

		expect(cleanups).toBe(0);
	});

	test("an ordinary switch moves the owner, and the disposal that follows cleans once", () => {
		let cleanups = 0;
		const double = portDouble();
		double.bind(probe("cleanup-switched"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				cleanup: () => {
					cleanups += 1;
				},
			}),
		});

		// An ordinary session switch, exactly as the adapter delivers it: the session being left
		// ends as `transferred` and the one taking its place starts under its own key.
		const next = { kind: "owner", key: "main:factory-switched" } as const;
		double.deliverSession(OWNER, { event: start() });
		double.deliverSession(OWNER, { event: { kind: "session_end", reason: "transferred" } });
		double.deliverSession(next, { event: start("new") });
		expect(cleanups).toBe(0);

		// The process going away while the switched-to session is the one being served: this is
		// the instance's one disposal, and the session that initialized it is long gone.
		double.deliverSession(next, { event: { kind: "session_end", reason: "disposed" } });
		double.deliverSession(next, { event: { kind: "session_end", reason: "disposed" } });

		expect(cleanups).toBe(1);
	});

	test("after the cleanup the binding stops delivering to the extension", async () => {
		const reached: string[] = [];
		const double = portDouble();
		double.bind(probe("cleanup-stops"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				cleanup: () => {
					reached.push("cleanup");
				},
				subscriptions: [{ scope: "owner", events: {
					session_start: () => {
						reached.push("session_start");
					},
				} }],
			}),
		});

		double.deliverSession(OWNER, { event: start() });
		double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" } });
		double.deliverSession(OWNER, { event: start("new") });
		const initiated = await double.initiateRun(OWNER);

		expect(reached).toEqual(["session_start", "cleanup"]);
		expect(initiated.contribution).toBeUndefined();
	});
});

describe("a refused binding cleans up what the factory already built (P56)", () => {
	test("the incompleteness is reported and the created implementation is cleaned up once", () => {
		let cleanups = 0;
		const double = portDouble();
		const bound = double.bind(defineExtension({
			id: "refused-pair",
			displayName: "refusedPair",
			commands: [{ type: "directed", name: "refused-pair-go", state: "enabled" }],
		}), {
			factory: () => ({
				cleanup: () => {
					cleanups += 1;
				},
			}),
		});

		expect(bound.bound).toBe(false);
		expect(cleanups).toBe(1);
		expect(double.registrations).not.toContain("command:refused-pair-go");
		expect(double.diagnostics.join("\n")).toContain("no implementation was injected for it");
	});
});

describe("handlers may finish asynchronously, and neither a throw nor a rejection becomes a barrier (P56)", () => {
	test("an asynchronous handler's rejection is reported once, after the delivery already returned", async () => {
		const order: string[] = [];
		const double = portDouble();
		double.bind(probe("handler-reject"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				subscriptions: [{ scope: "owner", events: {
					session_start: async () => {
						await Promise.resolve();
						order.push("handler settled");
						throw new Error("the save was refused");
					},
				} }],
			}),
		});

		double.deliverSession(OWNER, { event: start() });
		// The delivery returned while the handler is still running: the framework did not wait.
		expect(order).toEqual([]);
		expect(double.diagnostics).toEqual([]);

		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(order).toEqual(["handler settled"]);
		expect(double.diagnostics).toEqual(["handler-reject: session_start handler failed: the save was refused"]);
	});

	test("a synchronous throw is reported once and still lets the framework's own behavior stand", () => {
		const double = portDouble();
		double.bind(probe("handler-throw"), {
			config: reading("greeting: hello\n"),
			factory: () => ({
				subscriptions: [{ scope: "owner", events: {
					session_start: () => {
						throw new Error("boom");
					},
				} }],
			}),
		});
		const delivery = double.deliverSession(OWNER, { event: start(), statePayloads: [{ enabled: true }] });

		expect(double.diagnostics).toEqual(["handler-throw: session_start handler failed: boom"]);
		// The owner's cell was seeded before the handler ran, so the boundary the event described
		// still holds — and the delivery itself concluded instead of propagating the throw.
		expect(double.state.view(OWNER.key).read("enabled")).toBe(true);
		expect(delivery.feedback).toEqual([]);
	});
});

/** A definition with one `actions` command and one prompt slot: the subject of a surviving switch. */
function actionsProbe(id: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		commands: [
			{
				type: "actions",
				name: `${id}-run`,
				description: `${id} actions`,
				actions: { report: "report the owner it ran for" },
			},
		],
		prompts: [{ tag: "instructions", strategy: "first-enabled-run", content: `${id} instructions` }],
	});
}

describe("an ordinary switch keeps the instance, and only its disposal ends it (P56)", () => {
	test("the one instance keeps serving the session that takes over", async () => {
		const started: string[] = [];
		const ran: string[] = [];
		const ownerKey = (owner: OwnerReference): string => (owner.kind === "owner" ? owner.key : "‹not-an-owner›");
		let built = 0;
		let cleanups = 0;
		const double = portDouble();
		double.bind(actionsProbe("switch-keeps"), {
			factory: () => {
				// The instance's own identity, minted by the factory call: every line the extension
				// records below carries it, so a second construction is visible rather than inferred.
				built += 1;
				const instance = built;
				return {
					subscriptions: [{ scope: "owner", events: {
						session_start: delivery => {
							started.push(`${instance}:${ownerKey(delivery.owner)}`);
						},
					} }],
					commands: {
						"switch-keeps-run": {
							report: delivery => {
								ran.push(`${instance}:${ownerKey(delivery.owner)}`);
							},
						},
					},
					cleanup: () => {
						cleanups += 1;
					},
				};
			},
		});

		const next = { kind: "owner", key: "main:factory-taken-over" } as const;
		double.deliverSession(OWNER, { event: start(), statePayloads: [{ enabled: true }] });
		await double.runToCompletion("switch-keeps-run", { args: "report", owner: OWNER });
		double.deliverSession(OWNER, { event: { kind: "session_end", reason: "transferred" } });
		double.deliverSession(next, { event: start("new"), statePayloads: [{ enabled: true }] });
		await double.runToCompletion("switch-keeps-run", { args: "report", owner: next });
		const initiated = await double.initiateRun(next);

		// One instance served both sessions: its own action ledger carries the session that took
		// over, its session subscription saw it, the run initiation still has the contribution
		// planned from the new owner's facts, and the switch cleaned nothing up.
		expect(built).toBe(1);
		expect(ran).toEqual([`1:${OWNER.key}`, `1:${next.key}`]);
		expect(started).toEqual([`1:${OWNER.key}`, `1:${next.key}`]);
		expect(initiated.contribution?.content).toBe("switch-keeps instructions");
		expect(cleanups).toBe(0);
	});

	test("a command no longer reaches the extension once its disposal ran", async () => {
		const ran: string[] = [];
		const double = portDouble();
		double.bind(actionsProbe("switch-spent"), {
			factory: () => ({
				commands: {
					"switch-spent-run": {
						report: () => {
							ran.push("ran");
						},
					},
				},
			}),
		});

		double.deliverSession(OWNER, { event: start() });
		await double.runToCompletion("switch-spent-run", { args: "report", owner: OWNER });
		double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" } });
		const afterDisposal = await double.runToCompletion("switch-spent-run", { args: "report", owner: OWNER });

		// The invocation before the disposal is the only one the extension's code saw, and the dead
		// one published nothing: the binding's delivery stopped with its cleanup.
		expect(ran).toEqual(["ran"]);
		expect(afterDisposal.feedback).toEqual([]);
	});

	test("a subagent's session end is never the instance's disposal", () => {
		let cleanups = 0;
		const double = portDouble();
		double.bind(actionsProbe("switch-subagent"), {
			commands: {
				"switch-subagent-run": {
					report: () => {},
				},
			},
			cleanup: () => {
				cleanups += 1;
			},
		});

		// A subagent session follows the owner without being one: it never initializes the
		// implementation, so its own end can never be the instance's disposal either.
		const subagent = { kind: "inherited", key: OWNER.key } as const;
		double.deliverSession(OWNER, { event: start() });
		double.deliverSession(subagent, { event: start("new") });
		double.deliverSession(subagent, { event: { kind: "session_end", reason: "disposed" } });

		expect(cleanups).toBe(0);
	});
});

describe("one implementation serves every binding of one adapter (P56)", () => {
	test("a second binding reuses the implementation the first one built", () => {
		let built = 0;
		// No configuration: the adapter path resolves a declared file against the repository, and
		// this case is about the instance, not about what it was handed.
		const definition = defineExtension({
			id: "adapter-memo",
			displayName: "adapterMemo",
			commands: [{ type: "toggle", name: "adapter-memo-toggle", state: "enabled" }],
		});
		const adapter: OmpExtensionFactory = frameworkOmp.ompAdapter(definition, {
			factory: () => {
				built += 1;
				return {};
			},
		});

		const first = adapter(nativeApi("18.5.0"));
		const second = adapter(nativeApi("18.5.0"));

		expect(first.bound).toBe(true);
		expect(second.bound).toBe(true);
		expect(built).toBe(1);
	});

	test("the OMP initialization is handed the adapter's settled subagent integration", async () => {
		const seen: SubagentIntegration[] = [];
		const adapter = frameworkOmp.ompAdapter(
			defineExtension({ id: "adapter-subagents", displayName: "adapterSubagents" }),
			{ factory: () => ({ initialize: delivery => {
				seen.push(delivery.subagents);
			} }) },
		);

		// The real adapter's answer, not a double's: OMP integrates the subagent observations
		// itself, so the extension is told that once, at its initialization.
		const session = loadedSession("18.5.0", "session-subagents", "unused-command");
		expect(adapter(session.api).bound).toBe(true);
		session.start();
		await Promise.resolve();

		expect(seen).toEqual([{ mode: "subagents" }]);
	});

	test("a binding after the instance's disposal builds and initializes a fresh one", async () => {
		const built: number[] = [];
		const initialized: number[] = [];
		const ran: number[] = [];
		const cleaned: number[] = [];
		const adapter = frameworkOmp.ompAdapter(actionsProbe("adapter-fresh"), {
			factory: () => {
				const instance = built.length + 1;
				built.push(instance);
				return {
					initialize: () => {
						initialized.push(instance);
					},
					cleanup: () => {
						cleaned.push(instance);
					},
					commands: {
						"adapter-fresh-run": {
							report: () => {
								ran.push(instance);
							},
						},
					},
				};
			},
		});

		// The first binding: one session's load, initialized once and disposed when the process
		// shut that session down.
		const first = loadedSession("18.5.0", "session-1", "adapter-fresh-run");
		expect(adapter(first.api).bound).toBe(true);
		first.start();
		await first.command("report");
		first.shutdown();

		// A later binding of the same adapter — how a harness that loads the extension per session
		// reaches it. The instance the first binding built was cleaned up, so this one must be a new
		// business instance initialized in its own right, never the spent object again.
		const second = loadedSession("18.5.0", "session-2", "adapter-fresh-run");
		expect(adapter(second.api).bound).toBe(true);
		second.start();
		await second.command("report");

		expect(built).toEqual([1, 2]);
		expect(initialized).toEqual([1, 2]);
		expect(ran).toEqual([1, 2]);
		expect(cleaned).toEqual([1]);
	});
});

/** The loader's api as far as binding reaches it: a label, commands, entries and subscriptions. */
function nativeApi(version: string): OmpExtensionApi {
	return {
		setLabel: () => {},
		registerCommand: () => {},
		appendEntry: () => {},
		on: () => {},
		pi: { VERSION: version, AgentRegistry: { global: () => ({ get: () => undefined }) } },
	} as unknown as OmpExtensionApi;
}

/** One session lifecycle handler as the loader registers it. */
type SessionHandler = (event: OmpSessionEvent, ctx: OmpSessionContext) => void;

/** One session's load of one extension: the api it subscribes through and the native facts. */
interface LoadedSession {
	readonly api: OmpExtensionApi;
	/** The harness's startup signal: this session becomes the one the binding serves. */
	start(): void;
	/** The process going away, as the harness announces it: the binding's one disposal. */
	shutdown(): void;
	/** Runs one command of this load's registration, as the operator's invocation reaches it. */
	command(args: string): void | Promise<void>;
}

/**
 * The loader's surface for one session's load: the members binding and its subscription paths
 * reach, driven by the native events and the operator's command invocation.
 */
function loadedSession(version: string, sessionId: string, commandName: string): LoadedSession {
	const commands = new Map<string, (args: string, ctx: OmpCommandContext) => void | Promise<void>>();
	const handlers: Record<OmpSessionEventType, SessionHandler[]> = {
		session_start: [],
		session_switch: [],
		session_branch: [],
		session_tree: [],
		session_shutdown: [],
	};
	const ctx: OmpSessionContext = {
		agent: { kind: "main", id: "Main" },
		sessionManager: { getSessionId: () => sessionId, getBranch: () => [] },
		hasUI: true,
		ui: { notify: () => {}, setWidget: () => {} },
	};
	const api: OmpExtensionApi = {
		setLabel: () => {},
		registerCommand: (
			name: string,
			options: { handler: (args: string, ctx: OmpCommandContext) => void | Promise<void> },
		) => {
			commands.set(name, options.handler);
		},
		appendEntry: () => {},
		on: (event: OmpSessionEventType, handler: SessionHandler) => {
			// The round and run-initiation subscriptions are other suites' subjects; only the
			// session axis is driven here.
			if (event in handlers) handlers[event].push(handler);
		},
		pi: { VERSION: version, AgentRegistry: { global: () => ({ get: () => undefined }) } },
	} as unknown as OmpExtensionApi;

	const deliver = (event: OmpSessionEvent): void => {
		for (const handler of handlers[event.type]) handler(event, ctx);
	};

	return {
		api,
		start: () => {
			deliver({ type: "session_start" });
		},
		shutdown: () => {
			deliver({ type: "session_shutdown" });
		},
		command: args => commands.get(commandName)?.(args, ctx),
	};
}
