/**
 * The pi adapter's Turn mapping at the public adapter seam (S1; contract P7, P9; ticket 03).
 *
 * What the framework owes on this axis is the *mapping*: the request pi was about to send becomes a
 * Turn start carrying the request's own provider, exact model and start instant plus the price
 * snapshot taken there; the response boundary becomes that Turn's HTTP facts; the finalized assistant
 * message becomes its settle, with the outcome pi stated and whatever usage it really reported. The
 * Turn rules themselves (identity, one accounting per Turn, how a reading is resolved) belong to the
 * framework's own suite; this one drives the native facts the pi adapter reads.
 *
 * Three things are deliberately not taken from the host, and each is asserted here rather than assumed:
 *
 * - the model, the price and the instant are the request's own *start*, so a session's later model
 *   change or a later catalog price change reaches only the requests issued after it;
 * - pi's all-zero usage reading is its own default rather than a report, so it is no reading at all —
 *   never a confirmed zero — while a reading with zero buckets beside non-zero ones is delivered
 *   exactly as reported;
 * - the third party's own computed cost is not part of what this adapter delivers: the delivered
 *   reading is the tokens pi received, and nothing downstream can adopt a billed amount this
 *   extension neither computed nor prices in.
 */
import { describe, expect, test } from "bun:test";
import type { PiAssistantMessage, PiMessageUsage } from "../../adapters/pi";
import type { CatalogPriceSource } from "../../framework/interface/host-facts";
import type { TurnOutcome } from "../../framework/interface/session";
import type { ImplementationContext } from "../../framework/public";
import { withCapturedStderr } from "./support/captured-stderr";
import { type PiNativeModel, type PiSurfaceSession, boundPiSurface } from "./support/pi-surface-double";

/** The session under test: pi's own main session, running one model of the maintained data's provider. */
const MAIN: PiSurfaceSession = {
	sessionId: "pi-sess-main",
	name: "pi main session",
	model: { id: "deepseek-flash", provider: "deepseek" },
	idle: true,
	pending: false,
};

/**
 * The harness catalog one case reports: two models and the pair it does not carry at all. The amounts
 * are the suite's own numbers, in pi's own unit (US dollars per million tokens), so no expectation
 * below restates a real provider's price.
 */
function planCatalog(): PiNativeModel[] {
	return [
		{ id: "plan-luna", provider: "plan-provider", cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } },
		{ id: "plan-free", provider: "plan-provider", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
	];
}

/** The allowance channel's own session, running a model the catalog itself prices. */
function planSession(catalog: PiNativeModel[]): PiSurfaceSession {
	return {
		sessionId: "pi-sess-plan",
		name: "plan session",
		model: { id: "plan-luna", provider: "plan-provider" },
		catalog,
		idle: true,
		pending: false,
	};
}

/** The probe catalog that is the harness's own prices, as the allowance channel composes them. */
const harnessPriced = (context: ImplementationContext): CatalogPriceSource | undefined => context.modelPrices;

/**
 * One assistant response, as pi hands its finalized message over: the token figures the adapter maps,
 * the stop reason, and the response id.
 */
function assistantMessage(overrides: Partial<PiAssistantMessage> = {}): PiAssistantMessage {
	return {
		role: "assistant",
		stopReason: "stop",
		responseId: "resp-wire-9",
		usage: { input: 10, output: 7, cacheRead: 3, cacheWrite: 0, totalTokens: 20 },
		...overrides,
	};
}

describe("a Turn is fixed by the request's own start facts (P7)", () => {
	test("the request's model, provider and instant are delivered on both edges, whatever the session reports later", () => {
		const surface = boundPiSurface({ catalog: harnessPriced });
		const session: PiSurfaceSession = {
			...MAIN,
			catalog: [{ id: "deepseek-flash", provider: "deepseek", cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } }],
		};

		surface.startRequest(session);
		// The session switches models before this response settles: an anchor taken at the request's
		// real start is what keeps the ended Turn attributed and priced as it was issued.
		session.model = { id: "deepseek-pro", provider: "deepseek" };
		surface.responseArrives(session, { status: 200 });
		surface.messageEnds(session, assistantMessage());

		expect(surface.starts).toHaveLength(1);
		expect(surface.ends).toHaveLength(1);
		const start = surface.starts[0].turn;
		const end = surface.ends[0].turn;
		expect(start.provider).toBe("deepseek");
		expect(start.model).toBe("deepseek-flash");
		expect(start.startedAt).toBeGreaterThan(0);
		// The end repeats the start's record rather than reading the session again.
		expect(end.turnId).toBe(start.turnId);
		expect(end.model).toBe("deepseek-flash");
		expect(end.provider).toBe("deepseek");
		expect(end.startedAt).toBe(start.startedAt);
		// Nothing about the anchor is missing, so the delivery names no gap for it.
		expect(start.unavailable).not.toContain("catalog price");
	});

	test("a request issued after the switch is the new model's own Turn", () => {
		const surface = boundPiSurface();
		const session: PiSurfaceSession = { ...MAIN };

		surface.startRequest(session);
		surface.messageEnds(session, assistantMessage());
		session.model = { id: "deepseek-pro", provider: "deepseek" };
		surface.startRequest(session);
		surface.messageEnds(session, assistantMessage({ responseId: "resp-wire-10" }));

		expect(surface.starts.map(delivery => delivery.turn.model)).toEqual(["deepseek-flash", "deepseek-pro"]);
		expect(surface.starts[0].turn.turnId).not.toBe(surface.starts[1].turn.turnId);
	});

	test("the price is the one holding at the request's start, and a later price change prices only later requests", () => {
		const catalog = planCatalog();
		const surface = boundPiSurface({ catalog: harnessPriced });
		const session = planSession(catalog);

		surface.startRequest(session);
		expect(surface.starts[0].turn.price).toEqual({
			currency: "USD",
			unit: "USD/百万 token",
			amounts: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
		});

		// The host's catalog states another price for the same pair before this response settles: the
		// request that was already issued keeps the snapshot its own start took.
		catalog[0] = { id: "plan-luna", provider: "plan-provider", cost: { input: 9, output: 9, cacheRead: 9, cacheWrite: 9 } };
		surface.responseArrives(session, { status: 200 });
		surface.messageEnds(session, assistantMessage());
		expect(surface.ends[0].turn.price).toEqual({
			currency: "USD",
			unit: "USD/百万 token",
			amounts: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
		});

		// A request issued after that change carries the new price, which is what makes the first one's
		// snapshot an observation about the start rather than about a value nothing ever moves.
		surface.startRequest(session);
		expect(surface.starts[1].turn.price).toEqual({
			currency: "USD",
			unit: "USD/百万 token",
			amounts: { input: 9, output: 9, cacheRead: 9, cacheWrite: 9 },
		});
	});

	test("a pair the harness does not price, and one it prices at zero, are both no price at all", () => {
		const catalog = planCatalog();
		const unlisted = boundPiSurface({ catalog: harnessPriced });
		unlisted.startRequest({ ...planSession(catalog), model: { id: "plan-unlisted", provider: "plan-provider" } });
		expect(unlisted.starts[0].turn.price).toBeUndefined();
		expect(unlisted.starts[0].turn.unavailable).toContain("catalog price");

		// A row whose every bucket is zero is a row that stated no amount, not a price of zero: a
		// free-looking request is exactly what the snapshot must not invent.
		const zeroPriced = boundPiSurface({ catalog: harnessPriced });
		zeroPriced.startRequest({ ...planSession(catalog), model: { id: "plan-free", provider: "plan-provider" } });
		expect(zeroPriced.starts[0].turn.price).toBeUndefined();
		expect(zeroPriced.starts[0].turn.unavailable).toContain("catalog price");
	});

	test("a request whose context reports no model identity starts no Turn, and says so once", () => {
		const surface = boundPiSurface();
		const { stderr } = withCapturedStderr(() => {
			surface.startRequest({ ...MAIN, model: undefined });
		});

		expect(surface.starts).toHaveLength(0);
		expect(stderr).toContain("model identity at a request start");
		// A request whose model the host does report is unaffected by the earlier gap.
		surface.startRequest(MAIN);
		expect(surface.starts).toHaveLength(1);
	});
});

describe("a settled response is delivered as its own facts (P9)", () => {
	test("the reported reading is delivered as reported, its zero buckets included", () => {
		const surface = boundPiSurface();
		surface.startRequest(MAIN);
		surface.messageEnds(MAIN, assistantMessage({ usage: { input: 12, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 12 } }));

		const end = surface.ends[0].end;
		expect(end.outcome).toBe("completed");
		expect(end.usage).toEqual({ input: 12, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 12 });
		expect(end.unavailable).not.toContain("usage (not reported)");
	});

	test("pi's all-zero reading is its own default, which is no reading rather than a confirmed zero", () => {
		const surface = boundPiSurface();
		surface.startRequest(MAIN);
		surface.messageEnds(MAIN, assistantMessage({ usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 } }));

		const end = surface.ends[0].end;
		expect(end.usage).toBeUndefined();
		expect(end.unavailable).toContain("usage (not reported)");
	});

	test("a message that carries no usage at all is the same missing reading", () => {
		const surface = boundPiSurface();
		surface.startRequest(MAIN);
		surface.messageEnds(MAIN, assistantMessage({ usage: undefined }));

		expect(surface.ends[0].end.usage).toBeUndefined();
		expect(surface.ends[0].end.unavailable).toContain("usage (not reported)");
	});

	test("the third party's own computed cost is not part of what is delivered", () => {
		const surface = boundPiSurface();
		surface.startRequest(MAIN);
		// pi's own usage carries the amount its cost model made of this response. The amount is
		// deliberately unrelated to the reported tokens, so an adapter that adopted it — instead of the
		// extension's own pricing of the tokens — would deliver a number nothing here computes.
		surface.messageEnds(
			MAIN,
			assistantMessage({
				usage: {
					input: 10,
					output: 7,
					cacheRead: 3,
					cacheWrite: 0,
					totalTokens: 20,
					cost: { input: 8.25, output: 8.25, cacheRead: 8.25, cacheWrite: 8.25, total: 8.25 },
				} as PiMessageUsage,
			}),
		);

		const end = surface.ends[0].end;
		// The delivered reading is exactly the four buckets and the reported total: nothing beside them,
		// and nothing the third party's own arithmetic produced.
		expect(end.usage).toEqual({ input: 10, output: 7, cacheRead: 3, cacheWrite: 0, totalTokens: 20 });
		expect(Object.keys(end.usage ?? {}).sort()).toEqual(["cacheRead", "cacheWrite", "input", "output", "totalTokens"]);
		expect(JSON.stringify(surface.ends[0])).not.toContain("8.25");
	});

	test("an aborted response is cancelled, an errored one is failed, and a tool-requesting one completed", () => {
		const cases: Array<{ readonly name: string; readonly message: Partial<PiAssistantMessage>; readonly outcome: TurnOutcome }> = [
			{ name: "aborted by the user", message: { stopReason: "aborted" }, outcome: "cancelled" },
			{ name: "an errored stop reason", message: { stopReason: "error" }, outcome: "failed" },
			{ name: "an error the message carries", message: { errorMessage: "provider refused the request" }, outcome: "failed" },
			{ name: "a response that only asked for tools", message: { stopReason: "toolUse" }, outcome: "completed" },
		];
		for (const item of cases) {
			const surface = boundPiSurface();
			surface.startRequest(MAIN);
			surface.messageEnds(MAIN, assistantMessage(item.message));
			expect(surface.ends[0].end.outcome).toBe(item.outcome);
		}
	});

	test("the response boundary becomes this Turn's HTTP facts, and the message its response id", () => {
		const surface = boundPiSurface();
		surface.startRequest(MAIN);
		surface.responseArrives(MAIN, { status: 502, headers: { "x-request-id": "capture-7" } });
		surface.messageEnds(MAIN, assistantMessage({ stopReason: "error" }));

		const end = surface.ends[0].end;
		expect(end.http).toEqual({ status: 502, headers: { "x-request-id": "capture-7" } });
		expect(end.unavailable).not.toContain("HTTP response facts");
		expect(end.providerResponseId).toBe("resp-wire-9");
		// pi publishes the boundary alone and no transport-level request id beside it, so none is
		// claimed from the headers it does carry.
		expect(end.providerRequestId).toBeUndefined();
	});

	test("pi's own turn boundary — the one that fires after the requested tools ran — settles no Turn here", () => {
		const surface = boundPiSurface();
		surface.startRequest(MAIN);

		// The native level below the model cycle: an extension that copied it would close the Turn after
		// tool execution, which the contract keeps outside the Turn.
		surface.deliver("turn_end", { type: "turn_end", turnIndex: 0, message: { role: "assistant" }, toolResults: [] }, MAIN);
		surface.deliver("turn_start", { type: "turn_start", turnIndex: 0, timestamp: Date.now() }, MAIN);
		expect(surface.ends).toHaveLength(0);

		// The finalized assistant message is what settles it, and the tool continuation is a Turn of its
		// own rather than part of this one.
		surface.messageEnds(MAIN, assistantMessage({ stopReason: "toolUse" }));
		expect(surface.ends).toHaveLength(1);
		surface.startRequest(MAIN);
		expect(surface.starts).toHaveLength(2);
		expect(surface.starts[1].turn.turnId).not.toBe(surface.starts[0].turn.turnId);
	});
});
