/**
 * The endpoint connect-bot's shared logic sends to.
 *
 * The value comes from the extension's own `config.yaml`, which the framework read and
 * validated before the binding registered anything; the file is the only source, so there is no
 * default and no fallback here. Asking before a binding validated the file is a misuse of the
 * extension, and the framework's own configuration error says so.
 */
import { getConfig } from "../../framework/core/config";
import { CONNECT_BOT } from "./definition";

/** The configuration connect-bot's protocol is driven by. */
export interface ConnectBotConfig {
	/** Base URL of the omp-bot panel; the event route is a protocol constant, not config. */
	readonly endpoint: string;
}

/** The validated endpoint of this process, as the declared file carried it. */
export function connectBotConfig(): ConnectBotConfig {
	// The framework validated the declared type (`non-empty-string`) at binding, so this read
	// is its own guarantee rather than a check this module has to repeat.
	return { endpoint: getConfig(CONNECT_BOT).endpoint as string };
}
