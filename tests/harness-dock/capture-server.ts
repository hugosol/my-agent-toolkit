/**
 * Local capture endpoint for the two provider wire protocols the first release records.
 *
 * Records every inbound request body verbatim (the full outbound JSON the agent
 * harness produced) into the run's capture directory, then answers with a scripted
 * assistant turn so a controlled session can complete a real round trip without
 * credentials. It proves the serialization/request path only: it is not a provider,
 * not a model, and not evidence about a real service. A captured
 * `openai-codex-responses` request in particular is shape-only: it says nothing about
 * whether a real provider would accept the shapes it carries.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

export interface CapturedRequest {
	readonly index: number;
	readonly method: string;
	readonly url: string;
	/** Absolute path of the verbatim body record. */
	readonly file: string;
	readonly raw: string;
	readonly json: unknown | null;
}

export interface CaptureServer {
	readonly port: number;
	/** OpenAI-style base URL the fixture provider should be pointed at. */
	readonly baseUrl: string;
	readonly dir: string;
	requests(): readonly CapturedRequest[];
	/** The balance calls answered by this endpoint, in call order (empty when it carries no balance). */
	balanceCalls(): readonly CapturedBalanceCall[];
	/**
	 * The two paths an extension's own traffic reaches, in arrival order: `balance` for a balance query
	 * and `model` for a completion request.
	 *
	 * It is the order the endpoint really saw them in, which is what makes "the extension's own query
	 * was answered before the first model request left the harness" an observation rather than an
	 * inference from durations. Traffic on any other path — the harness's own model discovery, say, which
	 * is not this extension's — is not recorded here.
	 */
	arrivals(): readonly ("balance" | "model")[];
	/**
	 * Release every balance answer this endpoint is holding (see `balance.held`); a no-op when it holds
	 * none.
	 */
	releaseBalance(): void;
	stop(): void;
}

/**
 * One balance call the endpoint answered.
 *
 * The balance endpoint sits beside the versioned inference path, so its path is recorded as the
 * caller really sent it; the headers are recorded because one of them is the credential an
 * extension's own query authenticates with.
 */
export interface CapturedBalanceCall {
	readonly index: number;
	readonly method: string;
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
}

/** One scripted assistant answer: a tool call, plain text, or (empty) the default text. */
export interface CaptureStep {
	/** Answer with this tool call instead of text. */
	readonly toolCall?: { readonly name: string; readonly arguments: string };
	/** Answer with this text instead of the server's reply text. */
	readonly replyText?: string;
}

/**
 * The provider wire protocol one inbound request speaks, as its own path states it.
 *
 * An extension can drive two providers in one run, so the recorded request body decides the answer:
 * a Responses path (`…/responses`, which is where the Codex endpoint posts) is answered with
 * Responses events and a chat-completions path with `chat.completion.chunk` frames. The recorded
 * request body is the harness's own JSON either way; the protocol only decides which scripted
 * answer lets the turn complete.
 */
export type CaptureProtocol = "openai-completions" | "openai-codex-responses";

/** The protocol one inbound request's path speaks. */
function protocolOf(pathname: string): CaptureProtocol {
	return pathname.endsWith("/responses") || pathname.endsWith("/codex/responses")
		? "openai-codex-responses"
		: "openai-completions";
}

export interface CaptureServerOptions {
	/** Directory receiving `request-NNN-<path>.json` records. */
	readonly dir: string;
	/** Scripted assistant text returned for every completion. */
	readonly replyText?: string;
	/**
	 * Scripted tool call: the first `times` completions answer with this call instead of
	 * the reply text, so a turn can exercise a tool continuation (several model requests
	 * inside one run). The `arguments` value is the raw JSON string the provider returns.
	 */
	readonly toolCall?: { readonly name: string; readonly arguments: string; readonly times?: number };
	/**
	 * Per-request script, chosen from the request the harness actually sent.
	 *
	 * The scripted responder is this fixture's model: it reads what the harness
	 * serialized — which session's turn this is, by the messages that turn carries — and
	 * answers that request. A multi-turn test that must switch behaviour between turns
	 * (or that must make one session delegate to a subagent) needs that, and it replaces
	 * the positional {@link CaptureServerOptions.toolCall} shorthand when supplied.
	 * Answering `undefined` sends the server's reply text.
	 */
	readonly respond?: (request: CapturedRequest) => CaptureStep | undefined;
	/** When set, answer completions with this HTTP status instead of a scripted turn. */
	readonly failureStatus?: number;
	/**
	 * The usage every completion reports, in each protocol's own bucket names.
	 *
	 * The chat path answers with the terminal usage chunk an OpenAI-compatible provider sends when
	 * the harness asked for one (`stream_options.include_usage`), and the Responses path with the
	 * completed response's own `usage`; either way `input` counts the prompt tokens the cached and the
	 * written ones are detailed from, so both protocols report the same four buckets. A controlled run
	 * can therefore complete a real cycle with non-zero usage of its own choosing instead of the
	 * all-zero reading a harness defaults to. Omitted means a reading the endpoint reports nothing in:
	 * the chat path sends no usage chunk and the Responses path its own minimal one.
	 */
	readonly usage?: {
		readonly input: number;
		readonly output: number;
		readonly cacheRead?: number;
		readonly cacheWrite?: number;
	};
	/**
	 * The balance endpoint's own scripted answer: `GET /user/balance` is answered with this document
	 * instead of a 404, so a run can drive an extension's own provider query end to end.
	 *
	 * The amount is this fixture's, never a real account's reading, and an amount the endpoint would
	 * report nothing for is the endpoint answering no balance rather than a balance of zero.
	 * `failureStatus` answers a failure instead, which is how a run observes what an extension does
	 * with a provider that refuses the query.
	 */
	readonly balance?: {
		readonly total: string;
		readonly currency?: string;
		readonly failureStatus?: number;
		/**
		 * Hold the balance answer from this arrival onwards (1-based), answering earlier ones as the rest
		 * of this option states them.
		 *
		 * This is how a run observes a query that is still out: the request has arrived — the endpoint
		 * recorded it — and no answer has been given, so what the harness does next cannot be an effect of
		 * `holdFrom: 1` holds the CLI's own startup prefetch, and a later number holds the query a
		 * settled request begins while the prefetch itself answers. Omitted means nothing is held.
		 */
		readonly holdFrom?: number;
		/**
		 * Per-call script, chosen from the call this endpoint is answering.
		 *
		 * The fields above state one answer for every call; a run that must observe what an extension
		 * does with a *sequence* of answers — a reading followed by a refusal, say — needs the call
		 * itself. It is asked once the call has arrived and any held answer has been released, and
		 * before `failureStatus`/`total` are read; answering `undefined` leaves the call to them.
		 */
		readonly respond?: (call: CapturedBalanceCall) => Response | undefined;
	};
	/**
	 * Extra headers this endpoint attaches to a completion answer, or a function choosing them from
	 * the request it is answering.
	 *
	 * The provider wire protocols carry facts beside the body — the Codex backend attaches its
	 * rate-limit snapshots to every response — so a run that must drive an extension's own reading of
	 * a response's headers needs the endpoint to state them. A run that must observe a *sequence* of
	 * reports (the same window updated, one window omitted, a changed pair) chooses them per request
	 * from the request the harness actually sent. Omitted means every answer carries only the headers
	 * this fixture always sends.
	 */
	readonly responseHeaders?:
		| Readonly<Record<string, string>>
		| ((request: CapturedRequest) => Readonly<Record<string, string>>);
}

export const DEFAULT_CAPTURE_REPLY_TEXT = "dock-capture-reply";
const CAPTURE_MODEL = "dock-model";

function sseChunk(delta: Record<string, unknown>, finishReason: string | null): string {
	return `data: ${JSON.stringify({
		id: "chatcmpl-dock",
		object: "chat.completion.chunk",
		created: Math.floor(Date.now() / 1000),
		model: CAPTURE_MODEL,
		choices: [{ index: 0, delta, finish_reason: finishReason }],
	})}\n\n`;
}

/**
 * One complete Responses event stream carrying `text` as the assistant message.
 *
 * The Codex transport reads Responses events, not chat-completion chunks, so a controlled turn on
 * that path needs this shape to complete. It is the minimum the harness accepts: create the response,
 * start the message and its text part, stream the delta, finish the item, then terminate the
 * response — whose `usage` is the scripted reading, in this protocol's own bucket names, `input_tokens`
 * counting the prompt tokens the cached and written ones are detailed from, exactly as the chat
 * protocol's `prompt_tokens` does.
 */
function codexResponsesSse(
	text: string,
	usage: { readonly input: number; readonly output: number; readonly cacheRead?: number; readonly cacheWrite?: number } | undefined,
): string {
	const events = [
		{ type: "response.created", response: { id: "resp_dock" } },
		{
			type: "response.output_item.added",
			item: { type: "message", id: "msg_dock", role: "assistant", status: "in_progress", content: [] },
		},
		{ type: "response.content_part.added", part: { type: "output_text", text: "" } },
		{ type: "response.output_text.delta", delta: text },
		{
			type: "response.output_item.done",
			item: {
				type: "message",
				id: "msg_dock",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text }],
			},
		},
		{
			type: "response.completed",
			response: {
				id: "resp_dock",
				status: "completed",
				usage: {
					input_tokens: usage?.input ?? 1,
					output_tokens: usage?.output ?? 1,
					total_tokens: (usage?.input ?? 1) + (usage?.output ?? 1),
					input_tokens_details: {
						cached_tokens: usage?.cacheRead ?? 0,
						cache_write_tokens: usage?.cacheWrite ?? 0,
					},
				},
			},
		},
	];
	return `${events.map(event => `data: ${JSON.stringify(event)}`).join("\n\n")}\n\n`;
}

export function startCaptureServer(options: CaptureServerOptions): CaptureServer {
	mkdirSync(options.dir, { recursive: true });
	const replyText = options.replyText ?? DEFAULT_CAPTURE_REPLY_TEXT;
	const captured: CapturedRequest[] = [];
	const balanceCaptured: CapturedBalanceCall[] = [];
	const arrivals: Array<"balance" | "model"> = [];
	/** The gate a held balance answer waits on; already open when the endpoint holds none. */
	const heldBalance = Promise.withResolvers<void>();
	let sequence = 0;

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname.endsWith("/models")) {
				return Response.json({ object: "list", data: [] });
			}
			if (url.pathname === "/user/balance") {
				// The arrival is recorded before any answer is built, so a held query is visibly *out*.
				arrivals.push("balance");
				const call: CapturedBalanceCall = {
					index: balanceCaptured.length + 1,
					method: request.method,
					url: request.url,
					headers: Object.fromEntries(request.headers.entries()),
				};
				balanceCaptured.push(call);
				const balance = options.balance;
				if (balance === undefined) return Response.json({ error: "not found", path: url.pathname }, { status: 404 });
				// A call this option holds is answered only once the case releases it: the query is then
				// provably still out while the run continues.
				if (balanceCaptured.length >= (balance.holdFrom ?? Number.POSITIVE_INFINITY)) await heldBalance.promise;
				// The call's own answer, when the case scripts one: it is read after the hold above, so a
				// scripted answer is the one a released query receives.
				const scripted = balance.respond?.(call);
				if (scripted !== undefined) return scripted;
				if (balance.failureStatus !== undefined) {
					return Response.json(
						{ error: { message: "dock-injected balance failure", type: "dock_error" } },
						{ status: balance.failureStatus },
					);
				}
				return Response.json({
					is_available: true,
					balance_infos: [
						{
							currency: balance.currency ?? "CNY",
							total_balance: balance.total,
							granted_balance: "0.00",
							topped_up_balance: balance.total,
						},
					],
				});
			}
			const isCompletion =
				url.pathname.endsWith("/chat/completions") ||
				url.pathname.endsWith("/responses") ||
				url.pathname.endsWith("/messages");
			if (!isCompletion) {
				return Response.json({ error: "not found", path: url.pathname }, { status: 404 });
			}
			arrivals.push("model");

			const raw = await request.text();
			const index = ++sequence;
			const file = path.join(
				options.dir,
				`request-${String(index).padStart(3, "0")}-${url.pathname.replace(/[^a-zA-Z0-9]+/g, "_")}.json`,
			);
			writeFileSync(file, raw);
			let json: unknown | null = null;
			try {
				json = JSON.parse(raw);
			} catch {
				json = null;
			}
			const record: CapturedRequest = { index, method: request.method, url: request.url, file, raw, json };
			captured.push(record);

			if (options.failureStatus !== undefined && options.failureStatus !== 200) {
				return Response.json(
					{ error: { message: "dock-injected provider failure", type: "dock_error" } },
					{ status: options.failureStatus },
				);
			}

			const scriptedHeaders =
				typeof options.responseHeaders === "function" ? options.responseHeaders(record) : options.responseHeaders;
			const encoder = new TextEncoder();
			const toolCall = options.toolCall;
			// The answer for this request: the per-request script when one is supplied, and
			// otherwise the positional shorthand (the first `times` requests answer with the
			// tool call, everything later with the reply text).
			const scripted: CaptureStep =
				options.respond !== undefined
					? (options.respond(record) ?? {})
					: toolCall !== undefined && index <= (toolCall.times ?? 1)
						? { toolCall }
						: {};
			const scriptedToolCall = scripted.toolCall;
			const scriptedText = scripted.replyText ?? replyText;
			if (protocolOf(url.pathname) === "openai-codex-responses") {
				// The Codex transport reads Responses events; the scripted tool call is a
				// chat-completions shorthand and has no meaning here, so this path answers
				// with text only (the reply text, or the per-request script's text).
				return new Response(codexResponsesSse(scriptedText, options.usage), {
					headers: {
						"content-type": "text/event-stream",
						"cache-control": "no-cache",
						...(scriptedHeaders ?? {}),
					},
				});
			}
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					if (scriptedToolCall !== undefined) {
						controller.enqueue(
							encoder.encode(
								sseChunk(
									{
										role: "assistant",
										content: null,
										tool_calls: [
											{
												index: 0,
												id: "call_dock_1",
												type: "function",
												function: { name: scriptedToolCall.name, arguments: scriptedToolCall.arguments },
											},
										],
									},
									null,
								),
							),
						);
						controller.enqueue(encoder.encode(sseChunk({}, "tool_calls")));
					} else {
						controller.enqueue(encoder.encode(sseChunk({ role: "assistant", content: scriptedText }, null)));
						controller.enqueue(encoder.encode(sseChunk({}, "stop")));
					}
					if (options.usage !== undefined) {
						// The terminal usage chunk: no choices, the reported buckets, and the cached
						// prompt tokens the harness reads from `prompt_tokens_details`.
						const usage = options.usage;
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({
									id: "chatcmpl-dock",
									object: "chat.completion.chunk",
									created: Math.floor(Date.now() / 1000),
									model: CAPTURE_MODEL,
									choices: [],
									usage: {
										prompt_tokens: usage.input,
										completion_tokens: usage.output,
										total_tokens: usage.input + usage.output + (usage.cacheRead ?? 0),
										prompt_tokens_details: {
											cached_tokens: usage.cacheRead ?? 0,
										},
									},
								})}\n\n`,
							),
						);
					}
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
					controller.close();
				},
			});
			return new Response(stream, {
				headers: {
					"content-type": "text/event-stream",
					"cache-control": "no-cache",
					// The transport reference id a real response exposes: the harness maps this header
					// into the response boundary's `requestId`.
					"x-request-id": `capture-${index}`,
					...(scriptedHeaders ?? {}),
				},
			});
		},
	});

	const port = server.port;
	if (port === undefined) throw new Error("capture server did not bind a port");
	return {
		port,
		baseUrl: `http://127.0.0.1:${port}/v1`,
		dir: options.dir,
		requests: () => captured,
		balanceCalls: () => balanceCaptured,
		arrivals: () => arrivals,
		releaseBalance: () => heldBalance.resolve(),
		stop: () => {
			// A run that stopped while a balance answer was still held would otherwise leave the handler
			// waiting on a promise nothing will open.
			heldBalance.resolve();
			server.stop(true);
		},
	};
}
