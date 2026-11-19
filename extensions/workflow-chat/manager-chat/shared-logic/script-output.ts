import { setTimeout as wait } from "node:timers/promises";
import type { WorkflowResponse } from "../../common/requests";

interface ScriptOutputNode {
	readonly nodeId: string;
	readonly nodeName: string;
	readonly executionId: string;
	readonly status: "running" | "succeeded" | "failed";
	readonly lines: readonly string[];
	readonly lastOutputAt: number | null;
}

interface ScriptOutputSnapshot {
	readonly runId: string;
	readonly observedAt: number;
	readonly nodes: readonly ScriptOutputNode[];
}

export interface ScriptOutputObservation {
	readonly status: "observing" | "finished" | "cancelled" | "unavailable";
	readonly snapshot?: ScriptOutputSnapshot;
	/** The display clock freezes when observation stops, even if collect is still waiting. */
	readonly displayedAt?: number;
}

const sampleMs = 500;

function readSnapshot(response: WorkflowResponse): ScriptOutputSnapshot | undefined {
	const document = response.body as Partial<ScriptOutputSnapshot> | null;
	if (response.isError || response.httpStatus !== 200 || typeof document?.runId !== "string" ||
		typeof document.observedAt !== "number" || !Number.isFinite(document.observedAt) || !Array.isArray(document.nodes)) return undefined;
	const nodes: ScriptOutputNode[] = [];
	for (const node of document.nodes as ScriptOutputNode[]) {
		if (typeof node?.nodeId !== "string" || typeof node.nodeName !== "string" || typeof node.executionId !== "string" ||
			(node.status !== "running" && node.status !== "succeeded" && node.status !== "failed") ||
			(node.lastOutputAt !== null && !Number.isFinite(node.lastOutputAt)) ||
			!Array.isArray(node.lines) || node.lines.some(line => typeof line !== "string")) return undefined;
		nodes.push({ nodeId: node.nodeId, nodeName: node.nodeName, executionId: node.executionId, status: node.status,
			lastOutputAt: node.lastOutputAt, lines: node.lines.slice(-5) });
	}
	return { runId: document.runId, observedAt: document.observedAt, nodes };
}

/** A single collect call owns its timer, latest complete snapshot and at most one request in flight. */
export async function collectWithScriptOutput<T extends WorkflowResponse>(
	collect: () => Promise<T>,
	readOutput: (signal: AbortSignal) => Promise<WorkflowResponse>,
	lifetime: AbortSignal,
	publish: (observation: ScriptOutputObservation) => void,
): Promise<T & { readonly scriptOutput: ScriptOutputObservation }> {
	const stopSampling = new AbortController();
	const collectEnded = new AbortController();
	const signal = AbortSignal.any([lifetime, stopSampling.signal]);
	const delaySignal = AbortSignal.any([signal, collectEnded.signal]);
	let snapshot: ScriptOutputSnapshot | undefined;
	let receivedAt = 0;
	let stopped: ScriptOutputObservation | undefined;
	const freeze = (status: ScriptOutputObservation["status"]): ScriptOutputObservation => ({ status, ...(snapshot && {
		snapshot, displayedAt: Math.round(snapshot.observedAt + performance.now() - receivedAt),
	}) });
	const result = collect().finally(() => collectEnded.abort());
	const sampling = (async () => {
		if (!signal.aborted) publish({ status: "observing" });
		while (!signal.aborted) {
			const startedAt = performance.now();
			let next: ScriptOutputSnapshot | undefined;
			try { next = readSnapshot(await readOutput(signal)); } catch { /* A failed snapshot never changes the collect response. */ }
			if (lifetime.aborted) break;
			if (!next || signal.aborted) {
				stopped = freeze("unavailable");
				if (!collectEnded.signal.aborted) publish(stopped);
				break;
			}
			snapshot = next; // Replace, never merge: a retry or new Run must not inherit old rows.
			receivedAt = performance.now();
			if (collectEnded.signal.aborted) break;
			publish({ status: "observing", snapshot, displayedAt: next.observedAt });
			try { await wait(Math.max(0, sampleMs - (performance.now() - startedAt)), undefined, { signal: delaySignal }); }
			catch { /* A settled collect wakes the delay early for one last sample. */ }
		}
	})();
	try {
		const response = await result;
		if (response.isError) stopSampling.abort();
		const deadline = setTimeout(() => stopSampling.abort(), sampleMs);
		try { await sampling; } finally { clearTimeout(deadline); }
		return { ...response, scriptOutput: lifetime.aborted
			? { ...(stopped ?? freeze("cancelled")), status: "cancelled" }
			: stopped ?? freeze(response.isError ? "unavailable" : "finished") };
	} finally {
		stopSampling.abort();
		await sampling;
	}
}

export function displayScriptOutput(details: unknown): readonly string[] | undefined {
	const observation = (details as { scriptOutput?: ScriptOutputObservation } | null)?.scriptOutput;
	if (!observation) return undefined;
	const { status, snapshot, displayedAt } = observation;
	if (status === "finished" && !snapshot?.nodes.length) return undefined;
	const title = status === "cancelled" ? "Script output · observation cancelled (scripts not cancelled)"
		: status === "unavailable" ? "Script output · observation stopped (connection or snapshot failed)"
		: status === "finished" ? "Script output · final snapshot" : "Script output · observing";
	return [title, ...(snapshot?.nodes ?? []).flatMap(node => {
		const age = node.lastOutputAt === null || displayedAt === undefined ? "no output yet"
			: `${Math.floor(Math.max(0, displayedAt - node.lastOutputAt) / 1000)}s since output`;
		const name = node.nodeName === node.nodeId ? node.nodeName : `${node.nodeName} (${node.nodeId})`;
		return [`${node.status} · ${age} · ${name}`, ...node.lines];
	})];
}
