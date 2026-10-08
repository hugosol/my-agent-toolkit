/**
 * Environment isolation for controlled sessions.
 *
 * A controlled session must not inherit resolution offsets from the shell that
 * launched the dock (a profile name, an XDG data home, an external auth-broker,
 * a formal config overlay). Everything else — PATH, TEMP, proxies, locale — stays,
 * because the harness needs it and it does not move resolution.
 */

/** Exact environment names that redirect harness resolution. */
const OFFSET_EXACT: Record<string, true> = {
	OMP_PROFILE: true,
	PI_PROFILE: true,
	OMPCODE: true,
	PI_CONFIG_FILES: true,
	XDG_DATA_HOME: true,
	XDG_CONFIG_HOME: true,
	XDG_STATE_HOME: true,
	XDG_CACHE_HOME: true,
	PI_CODING_AGENT_DIR: true,
};

/** Namespaces whose members always redirect harness resolution. */
const OFFSET_PREFIXES = ["OMP_AUTH_BROKER_"] as const;

export function isResolutionOffset(name: string): boolean {
	return OFFSET_EXACT[name] === true || OFFSET_PREFIXES.some(prefix => name.startsWith(prefix));
}

/** Which resolution offsets are present in an environment (must be empty for a run). */
export function listResolutionOffsets(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string[] {
	return Object.keys(env)
		.filter(isResolutionOffset)
		.sort();
}

export interface SessionEnvOptions {
	/** Temporary agent state directory; becomes `PI_CODING_AGENT_DIR`. */
	readonly agentDir: string;
	/** Values applied last (a `undefined` value removes the name). */
	readonly extra?: Record<string, string | undefined>;
}

/**
 * Build the environment for one controlled session: the ambient environment minus
 * resolution offsets, plus an explicit temporary agent state directory.
 */
export function buildSessionEnv(
	base: NodeJS.ProcessEnv | Record<string, string | undefined>,
	options: SessionEnvOptions,
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [name, value] of Object.entries(base)) {
		if (value === undefined || isResolutionOffset(name)) continue;
		env[name] = value;
	}
	for (const [name, value] of Object.entries(options.extra ?? {})) {
		if (value === undefined) delete env[name];
		else env[name] = value;
	}
	env.PI_CODING_AGENT_DIR = options.agentDir;
	return env;
}
