/**
 * Dock fixture: an isolated OpenAI-compatible provider whose two models are reasoning-capable and
 * pointed at the dock capture endpoint, so a Viewed session run needs no credentials and no
 * network.
 *
 * Two models rather than one because the outlet publishes the *displayed* session's current model:
 * a run that only ever has one model cannot tell a live field from a constant. `reasoning: true`
 * is what makes an effort level a real, settable fact of the run instead of an unmeasurable one.
 */
export const VIEWED_PROVIDER = "viewed-dock";
export const VIEWED_MODEL_A = "viewed-model-a";
export const VIEWED_MODEL_B = "viewed-model-b";
export const VIEWED_MODEL_SELECTOR = `${VIEWED_PROVIDER}/${VIEWED_MODEL_A}`;
/** Context window both fixture models declare; the outlet must report this exact number. */
export const VIEWED_CONTEXT_WINDOW = 64_000;
export const VIEWED_CAPTURE_BASE_URL_ENV = "DOCK_VIEWED_CAPTURE_BASE_URL";

interface FixtureProviderConfig {
	baseUrl: string;
	apiKey: string;
	api: string;
	models: Array<Record<string, unknown>>;
}

interface ProviderRegisteringApi {
	registerProvider(name: string, config: FixtureProviderConfig): void;
}

function fixtureModel(id: string, name: string): Record<string, unknown> {
	return {
		id,
		name,
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: VIEWED_CONTEXT_WINDOW,
		maxTokens: 4096,
	};
}

export default function viewedSessionProvider(pi: ProviderRegisteringApi): void {
	const baseUrl = process.env[VIEWED_CAPTURE_BASE_URL_ENV];
	if (!baseUrl) throw new Error(`${VIEWED_CAPTURE_BASE_URL_ENV} is required by the Viewed session provider fixture`);
	pi.registerProvider(VIEWED_PROVIDER, {
		baseUrl,
		apiKey: "viewed-dock-key",
		api: "openai-completions",
		models: [fixtureModel(VIEWED_MODEL_A, "Viewed Model A"), fixtureModel(VIEWED_MODEL_B, "Viewed Model B")],
	});
}
