/**
 * The controlled extension API a frontend attaches through, as every suite that draws one composes
 * it.
 *
 * It is the native surface minus the host: the handlers an extension factory registers are kept by
 * event name, and a case fires one by hand with the context its own delivery carries. Nothing here
 * models a harness fact — a case states the event and the context itself — so the suites, the
 * independent smoke and the dock fixture all drive the production frontend over the same surface
 * instead of each keeping a copy of it.
 */
import type { OmpExtensionApi, OmpSessionContext } from "../../../adapters/omp";

/** One controlled API, with the way to fire the events the extension registered for. */
export interface ControlApi {
	readonly api: OmpExtensionApi;
	/** Fires one native event of that name at every handler this extension registered for it. */
	fire(event: string, ctx: OmpSessionContext): void;
}

export function controlApi(): ControlApi {
	const handlers = new Map<string, Array<(event: unknown, ctx: OmpSessionContext) => void>>();
	return {
		api: {
			on(event: string, handler: (event: unknown, ctx: OmpSessionContext) => void): void {
				const existing = handlers.get(event) ?? [];
				existing.push(handler);
				handlers.set(event, existing);
			},
			pi: undefined,
		} as unknown as OmpExtensionApi,
		fire(event, ctx) {
			for (const handler of handlers.get(event) ?? []) handler({ type: event }, ctx);
		},
	};
}
