/**
 * Probe 03-D/E: extension that registers an isolated OpenAI-compatible provider
 * pointing at the local capture endpoint. Loaded via `-e` with --no-extensions,
 * so it does not touch user config or ambient discovery.
 */
const port = process.env.CAPTURE_PORT ?? "8791";

export default function (pi: {
	registerProvider(
		name: string,
		config: {
			baseUrl: string;
			apiKey: string;
			api: string;
			models: Array<Record<string, unknown>>;
		},
	): void;
}): void {
	pi.registerProvider("probe-gateway", {
		baseUrl: `http://127.0.0.1:${port}/v1`,
		apiKey: "probe-key",
		api: "openai-completions",
		models: [
			{
				id: "probe-model",
				name: "Probe Model",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		],
	});
}
