/**
 * A response-timing adapter in front of the actual panel, for the dependability questions the
 * request budget raises (P25, P26, P27).
 *
 * The panel's own protocol is a client that sends one request and reads one answer; what a client
 * can conclude from a request that never completed is the whole subject of these promises. To ask
 * that question the dependency has to be real on both sides: this adapter is a genuine HTTP service
 * the extension talks to, and the panel behind it is the actual herdr-bot — every forwarded request
 * goes over a real socket to the real panel, and the adapter records the panel's own answer status
 * before it decides when (or whether) to hand that answer to the client.
 *
 * Two timings are therefore expressible, and both are things a real network does:
 *
 * - `hold`: the adapter records the request and never forwards it and never answers it, which is
 *   how a client's unregister can be *not delivered* while the panel keeps the row it registered.
 * - `releaseDelayMs`: the adapter forwards the request, waits for the panel to answer — so the
 *   panel has really processed and applied the event — and only then holds the answer back for the
 *   named time, which is how a request can be *received and processed* while its client times out
 *   waiting for the response.
 *
 * Nothing here stands in for the panel: the adapter is the client's dependency and the panel is the
 * server, and the suite reads the deletion the panel really applied from the panel's own read side.
 * `null` is not a value either: a held request is a request that really is still on the wire.
 */
/** The kinds of session event the panel protocol fixes. */
export type EventKind = "register" | "heartbeat" | "state" | "unregister";

/** One request as the adapter recorded it; the fields after arrival fill in as it proceeds. */
interface MutableReceipt {
	/** The envelope's kind, read from the request body the client built. */
	readonly kind: string;
	/** Milliseconds from this adapter's start to the request's arrival. */
	readonly arrivedAt: number;
	/** Whether this request was passed on to the panel behind the adapter. */
	forwarded: boolean;
	/** The status the panel answered the forwarded request with — the panel's own receipt. */
	panelStatus?: number;
	/** Milliseconds from this adapter's start to the panel's answer. */
	panelAnsweredAt?: number;
	/** Milliseconds from this adapter's start to the answer this adapter gave the client. */
	releasedAt?: number;
	/** The time this adapter held the panel's answer back, as configured for this kind. */
	heldMs?: number;
}

/** One request the adapter received, as the suite reads it. */
export type AdapterReceipt = Readonly<MutableReceipt>;

/** The adapter one run sends its requests through. */
export interface ResponseTimingAdapter {
	/** Base URL of the adapter: what the extension's own configuration names as the endpoint. */
	readonly endpoint: string;
	/** Every request the adapter received, in arrival order. */
	readonly receipts: readonly AdapterReceipt[];
	/**
	 * Waits until a receipt satisfies `match`, and fails with the records seen so far after
	 * `timeoutMs`. A receipt is re-examined as it proceeds, so a wait may be for an answer the
	 * adapter has not released yet.
	 */
	waitFor(match: (receipt: AdapterReceipt) => boolean, label: string, timeoutMs?: number): Promise<AdapterReceipt>;
	stop(): void;
}

/** What the adapter is configured with, per kind. */
export interface ResponseTimingAdapterOptions {
	/** The actual panel every forwarded request goes to; its answers are what the adapter relays. */
	readonly target: string;
	/** How long each kind's answer is held back after the panel answered it, in milliseconds. */
	readonly releaseDelayMs?: Partial<Record<EventKind, number>>;
	/** Kinds the adapter swallows: recorded, then neither forwarded nor answered. */
	readonly hold?: readonly EventKind[];
}

/** The request body's kind, read the way the panel reads it; a body without one is kept as such. */
function kindOf(body: string): string {
	try {
		const parsed: unknown = JSON.parse(body);
		if (parsed !== null && typeof parsed === "object" && "kind" in parsed && typeof parsed.kind === "string") {
			return parsed.kind;
		}
	} catch {
		// A body that is not JSON is still recorded: this adapter does not decide the protocol.
	}
	return "unknown";
}

/**
 * Starts the adapter: loopback, an ephemeral port, every request recorded with its own arrival,
 * and answers relayed from the panel as the configuration says.
 */
export function startResponseTimingAdapter(options: ResponseTimingAdapterOptions): ResponseTimingAdapter {
	const startedAt = performance.now();
	const receipts: MutableReceipt[] = [];
	const waiters: Array<{
		readonly match: (receipt: AdapterReceipt) => boolean;
		readonly settle: (receipt: AdapterReceipt) => void;
	}> = [];
	/** Lets every waiter whose condition now holds settle; called after each step of a request. */
	const publish = (): void => {
		for (const waiter of [...waiters]) {
			const matching = receipts.find(waiter.match);
			if (matching === undefined) continue;
			waiters.splice(waiters.indexOf(waiter), 1);
			waiter.settle(matching);
		}
	};

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const body = await request.text();
			const kind = kindOf(body);
			const receipt: MutableReceipt = {
				kind,
				arrivedAt: performance.now() - startedAt,
				forwarded: false,
			};
			receipts.push(receipt);
			publish();

			if (options.hold?.includes(kind as EventKind)) {
				// Held on purpose: the client waits out its own budget here, and the panel behind
				// this adapter is never told the request happened.
				return new Promise<Response>(() => {});
			}

			const answer = await fetch(`${options.target}${new URL(request.url).pathname}`, {
				method: request.method,
				headers: { "content-type": "application/json" },
				body,
			});
			const text = await answer.text();
			receipt.forwarded = true;
			receipt.panelStatus = answer.status;
			receipt.panelAnsweredAt = performance.now() - startedAt;
			publish();

			const delay = options.releaseDelayMs?.[kind as EventKind] ?? 0;
			if (delay > 0) await Bun.sleep(delay);
			receipt.heldMs = delay;
			receipt.releasedAt = performance.now() - startedAt;
			publish();
			return new Response(text, { status: answer.status, headers: { "content-type": "application/json" } });
		},
	});

	return {
		endpoint: `http://127.0.0.1:${server.port}`,
		receipts,
		waitFor: async (match, label, timeoutMs = 10_000) => {
			const existing = receipts.find(match);
			if (existing !== undefined) return existing;
			const { promise, resolve, reject } = Promise.withResolvers<AdapterReceipt>();
			const waiter = { match, settle: resolve };
			waiters.push(waiter);
			const timeout = setTimeout(() => {
				waiters.splice(waiters.indexOf(waiter), 1);
				reject(new Error(`the adapter never saw ${label}; requests seen: ${JSON.stringify(receipts)}`));
			}, timeoutMs);
			return promise.finally(() => clearTimeout(timeout));
		},
		stop: () => void server.stop(true),
	};
}
