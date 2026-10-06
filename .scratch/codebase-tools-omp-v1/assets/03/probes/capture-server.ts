/**
 * Probe 03-D/E: isolated local OpenAI-compatible capture endpoint.
 *
 * Records every inbound request body verbatim to CAPTURE_DIR, then answers with a
 * scripted assistant turn. This proves the serialization/request path only; it does
 * NOT prove a real service or model compliance.
 *
 * Env:
 *   CAPTURE_PORT (default 8791)
 *   CAPTURE_DIR  (required; logs land here)
 *   CAPTURE_MODE = "text" (default) | "tool_call"
 *   CAPTURE_TOOL, CAPTURE_TOOL_ARGS (for tool_call mode)
 *   CAPTURE_TEXT (for text mode, default "probe-reply")
 */
function arg(name: string, fallback: string): string {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg("port", process.env.CAPTURE_PORT ?? "8791"));
const dir = arg("dir", process.env.CAPTURE_DIR ?? "./capture");
const mode = arg("mode", process.env.CAPTURE_MODE ?? "text");
const delayMs = Number(arg("delay-ms", "0"));
const httpStatus = Number(arg("http-status", "200"));
if (!dir) throw new Error("--dir is required");

let seq = 0;
let taskCallSent = false;

function chunk(model: string, delta: unknown, finish: string | null): string {
	const payload = {
		id: "chatcmpl-probe",
		object: "chat.completion.chunk",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [{ index: 0, delta, finish_reason: finish }],
	};
	return `data: ${JSON.stringify(payload)}\n\n`;
}

Bun.serve({
	port,
	hostname: "127.0.0.1",
	async fetch(req) {
		const url = new URL(req.url);
		if (url.pathname.endsWith("/models")) {
			return Response.json({ object: "list", data: [] });
		}
		if (
			url.pathname.endsWith("/chat/completions") ||
			url.pathname.endsWith("/responses") ||
			url.pathname.endsWith("/messages")
		) {
			const raw = await req.text();
			const n = ++seq;
			const safePath = url.pathname.replace(/[^a-zA-Z0-9]+/g, "_");
			await Bun.write(`${dir}/request-${String(n).padStart(3, "0")}-${safePath}.json`, raw);
			if (delayMs > 0) await Bun.sleep(delayMs);
			if (httpStatus !== 200) {
				return Response.json(
					{ error: { message: "probe-injected provider failure", type: "probe_error" } },
					{ status: httpStatus },
				);
			}
			let model = "probe-model";
			try {
				const parsed: unknown = JSON.parse(raw);
				if (parsed && typeof parsed === "object" && "model" in parsed && typeof parsed.model === "string") {
					model = parsed.model;
				}
			} catch {
				// keep default model name in the scripted reply
			}
			const enc = new TextEncoder();
			const stream = new ReadableStream({
				start(controller) {
					const sendToolCall = mode === "tool_call" || (mode === "task_once" && !taskCallSent);
					if (sendToolCall) {
						taskCallSent = true;
						const tool = arg("tool", process.env.CAPTURE_TOOL ?? "task");
						const args = arg("tool-args", process.env.CAPTURE_TOOL_ARGS ?? "{}");
						controller.enqueue(
							enc.encode(
								chunk(
									model,
									{
										role: "assistant",
										content: null,
										tool_calls: [
											{
												index: 0,
												id: "call_probe_1",
												type: "function",
												function: { name: tool, arguments: args },
											},
										],
									},
									null,
								),
							),
						);
						controller.enqueue(enc.encode(chunk(model, {}, "tool_calls")));
					} else {
						const text = arg("text", process.env.CAPTURE_TEXT ?? "probe-reply");
						controller.enqueue(enc.encode(chunk(model, { role: "assistant", content: text }, null)));
						controller.enqueue(enc.encode(chunk(model, {}, "stop")));
					}
					controller.enqueue(enc.encode("data: [DONE]\n\n"));
					controller.close();
				},
			});
			return new Response(stream, {
				headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
			});
		}
		return Response.json({ error: "not found", path: url.pathname }, { status: 404 });
	},
});

console.log(`capture server on http://127.0.0.1:${port} mode=${mode} dir=${dir}`);
