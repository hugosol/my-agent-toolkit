/**
 * Harness fixture: an isolated OpenAI-compatible provider pointed at the harness
 * capture endpoint, so a controlled session needs no real credentials and no
 * network. Loaded explicitly through `-e`; it never touches host configuration.
 */
export const HARNESS_PROVIDER = "harness-gateway";
export const HARNESS_MODEL = "harness-model";
export const HARNESS_MODEL_SELECTOR = `${HARNESS_PROVIDER}/${HARNESS_MODEL}`;
export const HARNESS_CAPTURE_BASE_URL_ENV = "HARNESS_CAPTURE_BASE_URL";

interface FixtureProviderConfig {
	baseUrl: string;
	apiKey: string;
	api: string;
	models: Array<Record<string, unknown>>;
}

interface ProviderRegisteringApi {
	registerProvider(name: string, config: FixtureProviderConfig): void;
}

export default function harnessProviderExtension(pi: ProviderRegisteringApi): void {
	const baseUrl = process.env[HARNESS_CAPTURE_BASE_URL_ENV];
	if (!baseUrl) {
		throw new Error(`${HARNESS_CAPTURE_BASE_URL_ENV} is required by the harness provider fixture`);
	}
	pi.registerProvider(HARNESS_PROVIDER, {
		baseUrl,
		apiKey: "harness-key",
		api: "openai-completions",
		models: [
			{
				id: HARNESS_MODEL,
				name: "Harness Model",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		],
	});
}
