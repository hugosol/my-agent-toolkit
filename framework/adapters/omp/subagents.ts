/**
 * OMP's subagent execution observations: native subscriptions, payload mapping and
 * per-subscription execution identities. The assembly supplies Session/Owner facts
 * from `./session`; no native payload or mutable execution record leaves this module.
 */
import { isPlainMapping } from "../../core/assembly";
import { describeValue } from "../../core/config";
import type { FeedbackTransport, OwnerReference, SessionFacts, SubagentRuntimeDelivery } from "../../core/protocol";
import type { OmpAgentRef, OmpExtensionApi, OmpSessionContext } from "../omp";

type ExecutionOwner = (ref: OmpAgentRef, sessionId: string) => OwnerReference;
type ObservationFrame = Pick<SubagentRuntimeDelivery, "session" | "owner" | "hasUI" | "feedback">;

/**
 * The name the harness runs its own delegation tool under, and the two channels its own subagent
 * frames travel on.
 *
 * One subagent *execution*'s own measured duration is stated in two places on this native surface,
 * and the adapter reads both because neither of them carries every execution. The delegation tool's
 * payloads state the spawns one call runs — each spawn gets a reading of what it had run when the
 * payload was built, and its settled result carries the final one — and the harness's own subagent
 * channels state every execution of every agent, including the follow-up turns a kept-alive
 * subagent runs: those turn in an existing session with no delegation call of their own, so the
 * tool's payloads never carry them, and what is accumulated from that route alone would keep the
 * agent's first runtime forever. The frames are the harness's own statement of the same metric — an
 * execution's own elapsed run, emitted while it runs and once more as it settles — and no session's
 * creation-to-last-record span is a substitute for any of it: a span counts the idle gaps between
 * executions as if they were execution time.
 */
const SUBAGENT_TOOL_NAME = "task";

/** The harness channel one execution's live progress frames are published on, as it names it. */
const SUBAGENT_PROGRESS_CHANNEL = "task:subagent:progress";

/** The harness channel the frames opening and settling one execution are published on, as it names it. */
const SUBAGENT_LIFECYCLE_CHANNEL = "task:subagent:lifecycle";

/** One native fact stated as a non-empty string, or nothing when the host stated none. */
function statedText(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The per-execution entries one payload of the harness's delegation tool carries, as the host
 * stated them: the running spawns' progress frames for a frame still in flight, and the settled
 * spawns' own results for a result that has landed. Either list may be the one a given host mode
 * fills, so the one that fits the reading's own moment is preferred and the other answers when it
 * is absent.
 */
function subagentEntries(payload: unknown, status: "running" | "ended"): readonly Readonly<Record<string, unknown>>[] {
	if (!isPlainMapping(payload)) return [];
	const details = payload.details;
	if (!isPlainMapping(details)) return [];
	const preferred = status === "running" ? details.progress : details.results;
	const fallback = status === "running" ? details.results : details.progress;
	const list = Array.isArray(preferred) ? preferred : Array.isArray(fallback) ? fallback : [];
	return list.filter(isPlainMapping);
}

/**
 * The actual session facts of one execution's own session, read from the harness's own agent graph.
 *
 * The delegation payload names the *agent* a spawn ran as, not the session it ran in, so the
 * execution's session is resolved the same way a delivery's owner and a session's direct parent
 * already are: through the harness's own registry, never from a display name, a depth or a string
 * that merely looks hierarchical. The direct parent is one hop of the same graph, and the name is
 * the execution's own session manager's, so a fact this host cannot obtain is named in
 * `unavailable` rather than guessed.
 */
function executionSessionFacts(pi: OmpExtensionApi, ref: OmpAgentRef, sessionId: string): SessionFacts {
	const unavailable: string[] = [];
	const spawningId = ref.parentId;
	const parentSession =
		spawningId === undefined ? undefined : pi.pi?.AgentRegistry?.global()?.get(spawningId)?.session;
	const parentId = statedText(parentSession?.sessionManager?.getSessionId());
	if (parentId === undefined) unavailable.push("direct parent session");
	const name = statedText(ref.session?.sessionManager?.getSessionName?.());
	if (name === undefined) unavailable.push("session name");
	return {
		sessionId,
		kind: ref.kind === "main" ? "main" : "sub",
		...(parentId === undefined ? {} : { parentSessionId: parentId }),
		...(name === undefined ? {} : { name }),
		unavailable,
	};
}

/**
 * The identities one subagent's executions are reported under, as the harness's own frames bracket
 * them.
 *
 * The harness names an execution by the agent that runs it — the id its agent graph, its messaging
 * and its delegation payloads all use — and it reuses that name for every later execution of the
 * same agent, which is what a kept-alive subagent's follow-up turn is: the same registry id running
 * again. A consumer accumulates a duration per execution and retires an execution's identity once
 * its end has been observed, so a later execution reported under that same name would be read as a
 * repeat of the first and contribute nothing. What the harness does state is the boundary between
 * two of an agent's executions: a `started` lifecycle frame opens one. This bracket numbers the
 * executions of each agent as those frames open them, so the first execution observed under an
 * agent keeps the agent's own id — the identity the delegation tool's payloads state for it too —
 * and every later one is named `<agent id>#<execution number>`. Readings of one execution therefore
 * carry one identity however many of them arrive, and a follow-up is a new one.
 *
 * The count is this adapter's own observation of the frames, and it is ordered by the harness's own
 * emission: the frame opening an execution is published before any reading of it, and both routes
 * that carry readings reach this adapter from that same process. An execution this adapter began
 * observing after its opening frame is therefore the first one it knows of that agent, and takes the
 * agent's own id like any other first execution.
 *
 * The same object keeps this adapter's own memory of which executions it has attributed to a session
 * (see {@link SubagentExecutions.attributedBefore}), because that is the one fact that tells a spawn's
 * creation apart from an execution this host read and then lost: a reading of either resolves no
 * session — the registry may not hold the spawn's agent yet, or hold it without a live session — and
 * only an earlier attribution says which of the two a reading belongs to.
 */
interface SubagentExecutions {
	/** The identity one agent's readings belong under, or nothing when no agent was named. */
	readonly identityOf: (agentId: string | undefined) => string | undefined;
	/** Applies one lifecycle frame's own statement about an execution's opening. */
	readonly opened: (payload: unknown) => void;
	/**
	 * Whether some earlier reading of one execution already attributed it to a session.
	 *
	 * This is this adapter's own memory of its readings, and it is the one fact that tells a spawn's
	 * creation apart from an execution this host read and then lost. A spawn's readings begin before
	 * the session it will run in exists — on the delegation route, before the registry holds its agent
	 * at all — so a reading of either state names no session, and only the absence of any earlier
	 * attribution says which of the two this is.
	 */
	readonly attributedBefore: (identity: string) => boolean;
	/** Records that one reading attributed this execution to the session it actually ran in. */
	readonly recordAttribution: (identity: string) => void;
}

/** Build the execution brackets of one subscription. */
function subagentExecutions(): SubagentExecutions {
	/** How many executions of each agent this adapter has seen opened, by agent id. */
	const openedCounts = new Map<string, number>();
	/** The execution identities this adapter has already attributed to a session. */
	const attributed = new Set<string>();
	return {
		identityOf: agentId => {
			if (agentId === undefined) return undefined;
			const count = openedCounts.get(agentId) ?? 1;
			openedCounts.set(agentId, count);
			return count === 1 ? agentId : `${agentId}#${count}`;
		},
		opened: payload => {
			if (!isPlainMapping(payload) || payload.status !== "started") return;
			const agentId = statedText(payload.id);
			if (agentId === undefined) return;
			openedCounts.set(agentId, (openedCounts.get(agentId) ?? 0) + 1);
		},
		attributedBefore: identity => attributed.has(identity),
		recordAttribution: identity => {
			attributed.add(identity);
		},
	};
}

/**
 * The subagent-runtime delivery one observation of one execution states.
 *
 * The execution's identity is the harness's own: the agent id a payload or frame names, resolved
 * through the harness's agent graph for the session that execution ran in, so the delivery names the
 * actual session, its direct parent and its latest name rather than a display name, a depth or a
 * payload field, and the owner is the nearest top-level main session above it. `identity` is what a
 * consumer accumulates under — the agent's own id for the execution it is currently running, and a
 * bracketed name for a later execution of that agent (see {@link subagentExecutions}). An
 * observation whose execution, session or duration this host cannot read is delivered as the fact
 * that it is `unavailable`, anchored to the session the observation was made in rather than dropped:
 * an execution was reported, and an operator has to be told which reading could not be obtained
 * rather than be shown a zero or a span in its place. The one exception is a *running* reading of an
 * execution this host has never attributed to a session — a spawn whose session does not exist yet,
 * or which the registry does not hold at all — which states no runtime and produces no delivery, so a
 * session's creation is never reported as an unavailable reading of the main session that spawned it;
 * nothing is lost, as the readings of an execution are cumulative and the first one that resolves a
 * session states the whole duration. An execution already attributed once, and one whose execution is
 * over, are outside that window: their unattributable reading is that `unavailable` fact.
 */
function subagentRuntimeDelivery(
	pi: OmpExtensionApi,
	frame: {
		readonly session: SessionFacts;
		readonly owner: OwnerReference;
		readonly hasUI: boolean;
		readonly feedback: FeedbackTransport;
	},
	observation: {
		/** The harness's own agent id the reading names, when it named one. */
		readonly agentId: string | undefined;
		/** The identity this execution's readings are reported under, when one is known. */
		readonly identity: string | undefined;
		/** The duration the host stated at that instant, as it stated it. */
		readonly runtimeMs: unknown;
		readonly status: "running" | "ended";
	},
	executions: SubagentExecutions,
	ownerOfExecution: ExecutionOwner,
): SubagentRuntimeDelivery | undefined {
	const registry = pi.pi?.AgentRegistry?.global();
	const ref = observation.agentId === undefined ? undefined : registry?.get(observation.agentId);
	const sessionId = statedText(ref?.session?.sessionManager?.getSessionId());
	// A spawn's readings begin before the harness has a session for it — and, on the harness's own
	// delegation route, before its agent registry holds the agent at all — so the *running* readings
	// published in that window are about an execution this adapter has never attributed: that is the
	// creation transition, and it states no runtime at all, not an unavailable one. Nothing is lost by
	// withholding it, because the readings of an execution are cumulative: the first one that does
	// resolve a session states the whole duration elapsed, not the part of it after the attach. An
	// execution already attributed and one whose execution is reported over are outside that window:
	// their unattributable reading is that `unavailable` fact, never silence.
	if (
		observation.status === "running" &&
		observation.identity !== undefined &&
		sessionId === undefined &&
		!executions.attributedBefore(observation.identity)
	) {
		return undefined;
	}
	if (observation.identity === undefined || ref === undefined || sessionId === undefined) {
		return {
			event: { kind: "subagent_runtime" } as const,
			owner: frame.owner,
			session: frame.session,
			runtime: {
				kind: "unavailable" as const,
				reason:
					observation.agentId === undefined
						? "子代理执行身份"
						: `子代理执行「${observation.agentId}」所属 Session`,
			},
			hasUI: frame.hasUI,
			feedback: frame.feedback,
		};
	}
	// This reading resolved the session the execution runs in, which is the fact a later reading of the
	// same execution is read against: once attributed, an execution whose session can no longer be
	// resolved is an observation an operator has to be told about rather than a creation to wait out.
	executions.recordAttribution(observation.identity);
	const runtimeMs = observation.runtimeMs;
	const usable = typeof runtimeMs === "number" && Number.isFinite(runtimeMs) && runtimeMs >= 0 ? runtimeMs : undefined;
	return {
		event: { kind: "subagent_runtime" } as const,
		owner: ownerOfExecution(ref, sessionId),
		session: executionSessionFacts(pi, ref, sessionId),
		runtime:
			usable === undefined
				? {
						kind: "unavailable" as const,
						reason: `子代理执行「${observation.agentId}」的运行耗时（${describeValue(runtimeMs)}）`,
					}
				: {
						kind: "reading" as const,
						executionId: observation.identity,
						runtimeMs: usable,
						status: observation.status,
					},
		hasUI: frame.hasUI,
		feedback: frame.feedback,
	};
}

/**
 * The subagent-runtime deliveries one payload of the harness's delegation tool states.
 *
 * Each entry names one execution and the duration the host measured for it. An entry whose own
 * runtime this adapter cannot state — no execution identity, no session the harness's graph
 * resolves for it, or a duration the host did not state as a usable number — is delivered as the
 * fact that it is `unavailable`, not dropped: an execution was reported, and an operator has to be
 * told which reading could not be obtained rather than be shown a zero or a span in its place. Such
 * an observation is anchored to the session it was read in, which is why `frame` carries that
 * session's own facts, owner and channel. A payload that names no execution at all states no
 * runtime either, and produces no delivery — as does a running entry about an execution this adapter
 * has never attributed to a session (see {@link subagentRuntimeDelivery}).
 */
function subagentRuntimeDeliveries(
	pi: OmpExtensionApi,
	frame: {
		readonly session: SessionFacts;
		readonly owner: OwnerReference;
		readonly hasUI: boolean;
		readonly feedback: FeedbackTransport;
	},
	payload: unknown,
	status: "running" | "ended",
	executions: SubagentExecutions,
	ownerOfExecution: ExecutionOwner,
): readonly SubagentRuntimeDelivery[] {
	return subagentEntries(payload, status).flatMap(entry => {
		const agentId = statedText(entry.id);
		const delivery = subagentRuntimeDelivery(
			pi,
			frame,
			{
				agentId,
				identity: executions.identityOf(agentId),
				runtimeMs: entry.durationMs,
				status,
			},
			executions,
			ownerOfExecution,
		);
		return delivery === undefined ? [] : [delivery];
	});
}

/**
 * The subagent-runtime deliveries one frame of the harness's own subagent channel states.
 *
 * The frame carries the progress of one execution: the agent it runs, the status the harness holds
 * it in and the number of milliseconds it had run when the frame was built. The status is read in
 * the harness's own vocabulary — an execution still going is a reading that replaces the previous
 * one, and the three terminal statuses are its final reading — and a frame stating neither a usable
 * status nor the agent it belongs to states no runtime either and produces no delivery. One
 * delivery at most: a frame is the progress of exactly one execution, and a running one about an
 * execution this adapter has never attributed to a session produces none either (see
 * {@link subagentRuntimeDelivery}).
 */
function subagentFrameDeliveries(
	pi: OmpExtensionApi,
	frame: {
		readonly session: SessionFacts;
		readonly owner: OwnerReference;
		readonly hasUI: boolean;
		readonly feedback: FeedbackTransport;
	},
	payload: unknown,
	executions: SubagentExecutions,
	ownerOfExecution: ExecutionOwner,
): readonly SubagentRuntimeDelivery[] {
	const progress = isPlainMapping(payload) ? payload.progress : undefined;
	if (!isPlainMapping(progress)) return [];
	const agentId = statedText(progress.id);
	if (agentId === undefined) return [];
	const status = progress.status;
	const moment: "running" | "ended" | undefined =
		status === "running" || status === "pending"
			? "running"
			: status === "completed" || status === "failed" || status === "aborted"
				? "ended"
				: undefined;
	if (moment === undefined) return [];
	const delivery = subagentRuntimeDelivery(
		pi,
		frame,
		{
			agentId,
			identity: executions.identityOf(agentId),
			runtimeMs: progress.durationMs,
			status: moment,
		},
		executions,
		ownerOfExecution,
	);
	return delivery === undefined ? [] : [delivery];
}

/**
 * Observes both native routes with one execution record per subscription.
 * Bus frames have no context of their own: they use the latest actual delivery,
 * while tool observations retain their own delivery's context.
 */
export function observeSubagentRuntime(
	pi: OmpExtensionApi,
	handler: (delivery: SubagentRuntimeDelivery) => void,
	context: {
		readonly frame: (ctx: OmpSessionContext) => ObservationFrame;
		readonly latest: () => OmpSessionContext | undefined;
		readonly executionOwner: ExecutionOwner;
	},
): void {
	const executions = subagentExecutions();
	const report = (payload: unknown, ctx: OmpSessionContext, status: "running" | "ended"): void => {
		const frame = context.frame(ctx);
		for (const delivery of subagentRuntimeDeliveries(pi, frame, payload, status, executions, context.executionOwner)) {
			handler(delivery);
		}
	};
	pi.on("tool_execution_update", (event, ctx) => {
		if (event.toolName !== SUBAGENT_TOOL_NAME) return;
		report(event.partialResult, ctx, "running");
	});
	pi.on("tool_execution_end", (event, ctx) => {
		if (event.toolName !== SUBAGENT_TOOL_NAME) return;
		report(event.result, ctx, "ended");
	});
	const events = pi.events;
	if (events !== undefined) {
		events.on(SUBAGENT_PROGRESS_CHANNEL, payload => {
			const ctx = context.latest();
			if (ctx === undefined) return;
			const frame = context.frame(ctx);
			for (const delivery of subagentFrameDeliveries(pi, frame, payload, executions, context.executionOwner)) {
				handler(delivery);
			}
		});
		events.on(SUBAGENT_LIFECYCLE_CHANNEL, payload => executions.opened(payload));
	}
}
