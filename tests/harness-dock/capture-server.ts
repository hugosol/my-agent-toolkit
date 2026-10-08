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
	stop(): void;
}

/** One scripted assistant answer: a tool call, plain text, or (empty) the default text. */
export interface CaptureStep {
	/** Answer with this tool call instead of text. */
	readonly toolCall?: { readonly name: string; readonly arguments: string };
	/** Answer with this text instead of the server's reply text. */
	readonly replyText?: string;
}

/**
 * The provider wire protocol the capture endpoint answers with.
 *
 * `openai-completions` streams `chat.completion.chunk` frames; `openai-codex-responses`
 * streams Responses events for the Codex endpoint (`<baseUrl>/codex/responses`). The
 * recorded request body is the harness's own JSON either way; the protocol only decides
 * which scripted answer lets the turn complete.
 */
export type CaptureProtocol = "openai-completions" | "openai-codex-responses";

export interface CaptureServerOptions {
	/** Directory receiving `request-NNN-<path>.json` records. */
	readonly dir: string;
	/** Scripted answer protocol; defaults to `openai-completions`. */
	readonly protocol?: CaptureProtocol;
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
 * The Codex transport reads Responses events, not chat-completion chunks, so a
 * controlled turn on that path needs this shape to complete. It is the minimum the
 * harness accepts: create the response, start the message and its text part, stream
 * the delta, finish the item, then terminate the response.
 */
function codexResponsesSse(text: string): string {
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
					input_tokens: 1,
					output_tokens: 1,
					total_tokens: 2,
					input_tokens_details: { cached_tokens: 0 },
				},
			},
		},
	];
	return `${events.map(event => `data: ${JSON.stringify(event)}`).join("\n\n")}\n\n`;
}

export function startCaptureServer(options: CaptureServerOptions): CaptureServer {
	mkdirSync(options.dir, { recursive: true });
	const replyText = options.replyText ?? DEFAULT_CAPTURE_REPLY_TEXT;
	const protocol = options.protocol ?? "openai-completions";
	const captured: CapturedRequest[] = [];
	let sequence = 0;

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			if (url.pathname.endsWith("/models")) {
				return Response.json({ object: "list", data: [] });
			}
			const isCompletion =
				url.pathname.endsWith("/chat/completions") ||
				url.pathname.endsWith("/responses") ||
				url.pathname.endsWith("/messages");
			if (!isCompletion) {
				return Response.json({ error: "not found", path: url.pathname }, { status: 404 });
			}

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
			if (protocol === "openai-codex-responses") {
				// The Codex transport reads Responses events; the scripted tool call is a
				// chat-completions shorthand and has no meaning here, so this path answers
				// with text only (the reply text, or the per-request script's text).
				return new Response(codexResponsesSse(scriptedText), {
					headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
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
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
					controller.close();
				},
			});
			return new Response(stream, {
				headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
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
		stop: () => {
			server.stop(true);
		},
	};
}
