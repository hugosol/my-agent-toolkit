/**
 * The input axis's native mapping at the public adapter seam (S1; contract P1, P2, S1).
 *
 * The harness has exactly one fact about input the user themselves submitted: its own `input`
 * event, published when a submission is admitted to a session — an ordinary prompt, a queued steer,
 * a follow-up and a user-invoked skill alike, because the harness publishes it before it decides
 * what the submission is. What this suite observes is that mapping and nothing about what a
 * consumer does with it: the fact reaches a subscribed group as the session it belongs to, its
 * owner, its UI fact and its feedback channel, an `extension`-sourced submission is not user input
 * and reaches no one, and a definition that observes no input asks the harness for no input event
 * at all.
 *
 * This is the harness-neutral half of the seam: the adapter is the same one the loader binds, and
 * the definition is bound through it exactly as an assembly binds one. What only a real host can
 * answer — that its own submissions really publish this event, for a prompt and for a skill — is
 * the dock's, not this file's.
 */
import { describe, expect, test } from "bun:test";
import type { OmpCommandContext, OmpExtensionApi, OmpSessionContext } from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";
import {
	type ExtensionDefinition,
	type SemanticEventHandlers,
	type UserInputDelivery,
	defineExtension,
} from "../../framework/public";

/** The definition under test: a command, so the suite can tell a refused binding from an unbound one. */
const PROBE: ExtensionDefinition = defineExtension({
	id: "input-probe",
	displayName: "inputProbe",
	commands: [{ type: "directed", name: "input-probe", state: "enabled" }],
});

/** One native input event as the loader delivers it. */
type InputHandler = (
	event: { readonly type: "input"; readonly text: string; readonly source: "interactive" | "rpc" | "extension" },
	ctx: OmpSessionContext,
) => void;

/** The native surface a loader hands the factory, recording what the adapter registered. */
interface NativeSurface {
	/** The registrations the adapter made, in call order. */
	readonly registrations: string[];
	/** The semantic input facts the framework dispatched, in call order. */
	readonly observed: UserInputDelivery[];
	/** Whether the adapter subscribed the native input event at all. */
	readonly subscribed: boolean;
	/** One submission, as the harness publishes it for one session. */
	submit(options: {
		readonly source: "interactive" | "rpc" | "extension";
		readonly sessionId?: string;
		readonly hasUI?: boolean;
	}): void;
}

/** Builds one bound definition over a recording native surface. */
function boundSurface(options: { readonly events?: SemanticEventHandlers } = {}): NativeSurface {
	const inputHandlers: InputHandler[] = [];
	const registrations: string[] = [];
	const observed: UserInputDelivery[] = [];

	const contextOf = (sessionId: string, hasUI: boolean): OmpSessionContext => ({
		agent: { kind: "main", id: "Main" },
		sessionManager: { getSessionId: () => sessionId, getBranch: () => [] },
		hasUI,
		ui: { notify: () => {}, setWidget: () => {} },
	});

	const api: OmpExtensionApi = {
		setLabel(): void {},
		registerCommand(name): void {
			registrations.push(`command:${name}`);
		},
		appendEntry(): void {},
		on(event: string, handler: never): void {
			if (event === "input") inputHandlers.push(handler as InputHandler);
		},
	};

	const events: SemanticEventHandlers =
		options.events ??
		({
			user_input: (delivery: UserInputDelivery) => {
				observed.push(delivery);
			},
		} satisfies SemanticEventHandlers);
	const factory = frameworkOmp.ompAdapter(PROBE, {
		factory: () => ({
			subscriptions: [{ scope: "session", events }],
			commands: { "input-probe": { run: () => undefined } },
		}),
	});
	if (!factory(api).bound) throw new Error("the input probe definition did not bind");

	return {
		registrations,
		observed,
		subscribed: inputHandlers.length > 0,
		submit(options) {
			for (const handler of inputHandlers) {
				handler(
					{ type: "input", text: "a submitted prompt", source: options.source },
					contextOf(options.sessionId ?? "session-1", options.hasUI ?? true),
				);
			}
		},
	};
}

describe("the harness's own submission reaches a subscribed group as a user input fact (P1, P2)", () => {
	test("a submitted prompt is delivered as this session's user input", () => {
		const surface = boundSurface();

		surface.submit({ source: "rpc", sessionId: "session-main" });

		expect(surface.observed).toHaveLength(1);
		const delivery = surface.observed[0] as UserInputDelivery;
		expect(delivery.event).toEqual({ kind: "user_input" });
		expect(delivery.session.sessionId).toBe("session-main");
		expect(delivery.owner.kind).toBe("owner");
		expect(delivery.hasUI).toBe(true);
		// The feedback channel every subscriber delivery carries, so a consumer that has something to
		// report about a submission has somewhere to report it.
		expect(typeof delivery.feedback.notify).toBe("function");
	});

	test("a user-invoked skill submission is the same fact as an ordinary prompt", () => {
		const surface = boundSurface();

		// The harness publishes one submission event whatever the submission turned out to be: its
		// own skill dispatch reads that same event's text after this mapping, so a skill the user
		// invoked arrives here exactly as a plain prompt does.
		surface.submit({ source: "interactive" });
		surface.submit({ source: "rpc" });

		expect(surface.observed.map(delivery => delivery.session.sessionId)).toEqual(["session-1", "session-1"]);
	});

	test("a submission an extension itself made is not the user's input", () => {
		const surface = boundSurface();

		surface.submit({ source: "extension" });

		expect(surface.observed).toHaveLength(0);
	});
});

describe("the input axis is subscribed only when it is observed (S1)", () => {
	test("a definition that observes no input asks the harness for no input event", () => {
		const surface = boundSurface({ events: { round_start: () => undefined } });

		expect(surface.subscribed).toBe(false);
	});
});
