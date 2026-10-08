/**
 * Dock fixture: an isolated OpenAI-compatible provider pointed at the dock
 * capture endpoint, so a controlled session needs no real credentials and no
 * network. Loaded explicitly through `-e`; it never touches host configuration.
 */
export const DOCK_PROVIDER = "dock-gateway";
export const DOCK_MODEL = "dock-model";
export const DOCK_MODEL_SELECTOR = `${DOCK_PROVIDER}/${DOCK_MODEL}`;
export const DOCK_CAPTURE_BASE_URL_ENV = "DOCK_CAPTURE_BASE_URL";

interface FixtureProviderConfig {
	baseUrl: string;
	apiKey: string;
	api: string;
	models: Array<Record<string, unknown>>;
}

interface ProviderRegisteringApi {
	registerProvider(name: string, config: FixtureProviderConfig): void;
}

export default function dockProviderExtension(pi: ProviderRegisteringApi): void {
	const baseUrl = process.env[DOCK_CAPTURE_BASE_URL_ENV];
	if (!baseUrl) {
		throw new Error(`${DOCK_CAPTURE_BASE_URL_ENV} is required by the dock provider fixture`);
	}
	pi.registerProvider(DOCK_PROVIDER, {
		baseUrl,
		apiKey: "dock-key",
		api: "openai-completions",
		models: [
			{
				id: DOCK_MODEL,
				name: "Dock Model",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		],
	});
}
