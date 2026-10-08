/**
 * The endpoint connect-bot's shared logic sends to, and the wait budget of one request.
 *
 * The values come from the extension's own `config.yaml`, which the framework read and
 * validated before the binding registered anything; the file is the only source, so there is no
 * default and no fallback here. Asking before a binding validated the file is a misuse of the
 * extension, and the framework's own configuration error says so.
 */
import { getConfig } from "../../../../framework/core/config";
import { CONNECT_BOT } from "../../definition";

/** The configuration connect-bot's protocol is driven by. */
export interface ConnectBotConfig {
	/** Base URL of the omp-bot panel; the event route is a protocol constant, not config. */
	readonly endpoint: string;
	/** How long one request waits before it is abandoned, in milliseconds, as declared. */
	readonly requestTimeoutMs: number;
}

/** The validated endpoint and request budget of this process, as the declared file carried them. */
export function connectBotConfig(): ConnectBotConfig {
	// The framework validated the declared types (`non-empty-string`, `milliseconds`) at binding,
	// so this read is its own guarantee rather than a check this module has to repeat.
	const values = getConfig(CONNECT_BOT);
	return {
		endpoint: values.endpoint as string,
		requestTimeoutMs: values.requestTimeoutMs as number,
	};
}
