/**
 * Isolated agent-state configuration files for controlled sessions.
 *
 * Two harness behaviours cannot be reached from a session's command line, so a test
 * that needs them writes them into the run's temporary agent state instead:
 *
 * - **A provider transport override** (`models.yml` → `providers.<name>.baseUrl`).
 *   A session started with `--model <provider>/<id>` resolves that selector while
 *   booting, before extensions load, so an extension's `registerProvider` override
 *   never reaches the model the session runs. The models file is read while the model
 *   registry is constructed, so an override written there does.
 * - **Harness settings** (`config.yml`), such as the Codex websocket policy.
 *
 * Both files are written under the run's own `PI_CODING_AGENT_DIR`; the default agent
 * state, formal configuration and any running agent are never touched.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

/** The transport fields this dock overrides for one built-in provider. */
export interface IsolatedProviderOverride {
	/** Endpoint the provider's models are redirected to. */
	readonly baseUrl: string;
	/**
	 * Credential the provider resolves. Required for providers whose normal
	 * credential comes from a login flow: without it the harness refuses the model
	 * before any request is built.
	 */
	readonly apiKey?: string;
}

/** Render one YAML scalar: strings are quoted so `off`/`yes` stay strings. */
function yamlScalar(value: string | number | boolean): string {
	return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/**
 * Write `models.yml` in the isolated agent state: one built-in provider's models are
 * redirected to `override.baseUrl` (and given `override.apiKey`), keeping the catalog's
 * model definitions, api and compatibility rules.
 */
export function writeProviderOverride(
	agentDir: string,
	provider: string,
	override: IsolatedProviderOverride,
): void {
	mkdirSync(agentDir, { recursive: true });
	const lines = [`providers:`, `  ${yamlScalar(provider)}:`, `    baseUrl: ${yamlScalar(override.baseUrl)}`];
	if (override.apiKey !== undefined) lines.push(`    apiKey: ${yamlScalar(override.apiKey)}`);
	writeFileSync(path.join(agentDir, "models.yml"), `${lines.join("\n")}\n`);
}

/**
 * Write `config.yml` in the isolated agent state from flat settings whose keys are the
 * harness's dotted setting ids (for example `providers.openaiWebsockets`).
 */
export function writeAgentSettings(
	agentDir: string,
	settings: Record<string, string | number | boolean>,
): void {
	mkdirSync(agentDir, { recursive: true });
	const groups = new Map<string, Array<[string, string | number | boolean]>>();
	for (const [key, value] of Object.entries(settings)) {
		const separator = key.indexOf(".");
		const group = separator === -1 ? key : key.slice(0, separator);
		const leaf = separator === -1 ? key : key.slice(separator + 1);
		const members = groups.get(group) ?? [];
		members.push([leaf, value]);
		groups.set(group, members);
	}
	const lines: string[] = [];
	for (const [group, members] of groups) {
		lines.push(`${group}:`);
		for (const [leaf, value] of members) lines.push(`  ${leaf}: ${yamlScalar(value)}`);
	}
	writeFileSync(path.join(agentDir, "config.yml"), `${lines.join("\n")}\n`);
}
