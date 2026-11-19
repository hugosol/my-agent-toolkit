import type { SessionEventDelivery } from "../../../../framework/interface/session";
import { pushEvent } from "./client";
import { connectBotConfig } from "./config";
import type { SessionFacts } from "../session/session";

const CLAIMS: unique symbol = Symbol.for("my-agent-toolkit.connect-bot.launch-claims");

interface ProcessClaims {
	[CLAIMS]?: Set<string>;
}

interface LaunchOwner {
	readonly ownerKey: string;
	readonly sessionId: string;
	readonly data: Record<string, string | number>;
	readonly publications: AbortController;
	ready: boolean;
}

type LaunchKind = "launch_identity" | "launch_ready" | "launch_ended";
type NativeLaunchFacts = Pick<SessionFacts, "agentType" | "sessionId" | "cwd"> & { readonly sessionFile?: string | undefined };

/** One managed invocation can claim its initial owner, never an in-process replacement. */
export class LaunchReports {
	#active: LaunchOwner | undefined;

	started(delivery: SessionEventDelivery, readNative: () => NativeLaunchFacts | undefined): void {
		const launchId = process.env.HERDR_BOT_LAUNCH_ID;
		const targetId = process.env.HERDR_BOT_LAUNCH_TARGET_ID;
		if (!launchId || !targetId || delivery.owner.kind !== "owner" || delivery.session.kind !== "main") return;
		const scope = globalThis as ProcessClaims;
		const claims = scope[CLAIMS] ??= new Set();
		if (claims.has(launchId)) return;
		const native = readNative();
		if (native === undefined) return;
		const { sessionId, agentType, sessionFile, cwd } = native;
		if (sessionId !== delivery.session.sessionId || !sessionId || !cwd) return;

		// The claim survives native extension reloads; a replacement binding must not adopt
		// this process's launch association, even if it happens to reopen the original ID.
		claims.add(launchId);
		const owner: LaunchOwner = {
			ownerKey: delivery.owner.key, sessionId,
			data: { launchId, targetId, agentType, pid: process.pid, cwd, ...(sessionFile ? { sessionFile } : {}) },
			publications: new AbortController(), ready: false,
		};
		this.#active = owner;
		this.#report("launch_identity", owner, owner.publications.signal);
	}

	ready(delivery: SessionEventDelivery): void {
		const owner = this.#active;
		if (owner === undefined || owner.ready || delivery.owner.kind !== "owner" ||
			delivery.owner.key !== owner.ownerKey || delivery.session.sessionId !== owner.sessionId) return;
		owner.ready = true;
		this.#report("launch_ready", owner, owner.publications.signal);
	}

	ended(delivery: SessionEventDelivery): void {
		const owner = this.#active;
		if (owner === undefined || delivery.owner.kind !== "owner" ||
			delivery.owner.key !== owner.ownerKey || delivery.session.sessionId !== owner.sessionId) return;
		this.#active = undefined;
		owner.publications.abort();
		// This is a withdrawal of launch evidence, not an unregister or a change in online state.
		this.#report("launch_ended", owner);
	}

	#report(kind: LaunchKind, { sessionId, data }: LaunchOwner, signal?: AbortSignal): void {
		const { endpoint, requestTimeoutMs } = connectBotConfig();
		// Terminal exit can prevent delivery; the receiver must also validate current target life
		// and reject late reports after withdrawal. This notification does not retry or block input.
		void pushEvent(endpoint, { sessionId, kind, data }, requestTimeoutMs, signal).catch(() => {});
	}
}
