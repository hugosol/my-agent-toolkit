import type { OmpExtensionApi, OmpSessionContext } from "../../../../adapters/omp";
import manager from "../../../../entrypoints/omp-auto/manager-chat";
import node from "../../../../entrypoints/omp-auto/node-chat";

interface NativeTool {
	readonly name: string;
	execute(callId: string, params: unknown, signal: AbortSignal | undefined, onUpdate: unknown, ctx: OmpSessionContext): Promise<unknown>;
}
interface NativeApi extends OmpExtensionApi { registerTool(tool: NativeTool): void; }

/** External native-context fault only. Real OMP still loads/registers/executes the
 * shipped role and all Session/HTTP logic. No substitute registration or request.
 * A normal OMP tool always has a native ID; make that one input unavailable while
 * retaining its real display name/cwd/agent ID so any fallback would reach HTTP.
 */
export default function missingNativeIdentity(api: NativeApi) {
	const faulted = new Proxy(api, { get(target, property, receiver) {
		if (property !== "registerTool") return Reflect.get(target, property, receiver);
		return (tool: NativeTool) => target.registerTool({ ...tool, execute(callId, params, signal, update, ctx) {
			const sessionManager = new Proxy(ctx.sessionManager, { get(manager, key, self) {
				return key === "getSessionId" ? () => "" : Reflect.get(manager, key, self);
			} });
			return tool.execute(callId, params, signal, update, { ...ctx, sessionManager });
		} });
	} });
	return process.env.WORKFLOW_DOCK_ROLE === "manager" ? manager(faulted) : node(faulted);
}
