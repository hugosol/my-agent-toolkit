import { expect } from "bun:test";
import type { RoleDock } from "./prompt-dock";

/** Read the actual native RPC state, never a fixture identity. */
export async function nativeIdentity(dock: RoleDock): Promise<string> {
	const state = await dock.session.request({ type: "get_state" });
	const data = state.data;
	if (!data || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string" || !data.sessionId) throw new Error("Missing real OMP Session identity");
	return data.sessionId;
}

/** Native tool result is the approved S1 observation, including failed tools. */
export function lastRoleResult(dock: RoleDock): { body: unknown; isError?: boolean; details?: { httpStatus?: number; body: unknown } } {
	const frames = dock.session.frames().filter(frame => frame.type === "tool_execution_end");
	const frame = frames[frames.length - 1];
	const result = frame?.result as { content?: { text?: string }[]; isError?: boolean; details?: { httpStatus?: number; body: unknown } } | undefined;
	const text = result?.content?.[0]?.text;
	if (typeof text !== "string") throw new Error("No actual OMP tool text");
	return { ...result, body: JSON.parse(text) };
}

export function beginRoleCall(dock: RoleDock, name: string, params: unknown) {
	dock.select(name, params);
	return dock.session.prompt("Execute exactly the selected explicit role tool once; no automatic retries.");
}

export async function roleCall(dock: RoleDock, name: string, params: unknown) {
	expect((await beginRoleCall(dock, name, params)).status).toBe("completed");
	return lastRoleResult(dock);
}
