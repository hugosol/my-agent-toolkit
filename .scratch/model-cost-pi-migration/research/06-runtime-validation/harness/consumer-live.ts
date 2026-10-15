/**
 * Wayfinder ticket 06 — live (real-model) consumer for the isolated tintinweb runtime validation.
 *
 * Executions (hard cap 4, model deepseek/deepseek-flash):
 *   1. A-long  : long output, stopped via RPC mid-flight (cancel path)
 *   2. B-ok    : minimal "reply OK" run (single-agent + usage + duration)
 *   3. P-nested: top-level agent that must call the Agent tool once (nested delegation)
 *   4. (child) : the nested subagent spawned by P
 *
 * Observes only public surfaces: the 11 `subagents:*` bus channels, the four
 * `subagents:rpc:*` request/reply channels, and the documented manager registry.
 * Records are read as a cross-check but are private fields, not public contract.
 *
 * Cost policy: the terminal event's `usage.cost.total` (USD) is the primary reading;
 * a case whose cost is unreadable is retried once when execution budget allows and
 * abandoned otherwise (user-approved for this ticket).
 *
 * Writes JSONL to $WF06_LOG. Never logs credentials.
 */
import { appendFileSync } from "node:fs";

const LOG = process.env.WF06_LOG ?? "";
const MODEL = "deepseek/deepseek-flash";
const AGENT_TYPE = "general-purpose";
const CHANNELS = [
  "created",
  "started",
  "completed",
  "failed",
  "steered",
  "compacted",
  "scheduled",
  "settings_loaded",
  "settings_changed",
  "ready",
  "scheduler_ready",
];
const LONG_PROMPT =
  "Write the integers from 1 to 3000, one per line, and nothing else. Do not stop before 3000.";
const NESTED_PROMPT = [
  "You must use the Agent tool exactly once, right now, before answering.",
  "Call it with exactly these arguments:",
  '  subagent_type: "general-purpose"',
  '  description: "nested ok check"',
  '  prompt: "Reply with exactly OK"',
  "After the tool returns, reply with exactly: NESTED_RESULT=<the text the nested agent returned>",
  "Do not call any other tool and do not add any other text.",
].join("\n");

type Dict = Record<string, unknown>;

interface ToolInfoLike {
  name?: unknown;
}
interface PiLike {
  events: {
    on(channel: string, handler: (data: unknown) => void): () => void;
    emit(channel: string, data: unknown): void;
  };
  on(event: string, handler: (event: Dict) => void): () => void;
  getAllTools(): ToolInfoLike[];
}

function asDict(value: unknown): Dict | undefined {
  // Narrowing helper for JSON-ish payloads; no schema is available at this throwaway boundary.
  return value !== null && typeof value === "object" ? (value as Dict) : undefined;
}

function log(record: Dict): void {
  if (!LOG) return;
  appendFileSync(LOG, `${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
}

function managerSlot(): { getRecord(id: string): unknown } | undefined {
  const globals = globalThis as unknown as Record<string | symbol, unknown>; // symbol-keyed global registry
  const slot = globals[Symbol.for("pi-subagents:manager")];
  const getRecord = asDict(slot)?.getRecord;
  if (typeof getRecord !== "function") return undefined;
  const holder = slot as object;
  return { getRecord: (id: string) => (getRecord as (value: string) => unknown).call(holder, id) };
}

export default function (pi: PiLike) {
  const terminals = new Map<string, Dict>();
  const flags = { ready: false };
  let seq = 0;

  const sleep = (ms: number): Promise<void> => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    return promise;
  };

  const rpc = (channel: string, params: Dict): Promise<Dict> => {
    const { promise, resolve } = Promise.withResolvers<Dict>();
    const requestId = `wf06-live-${++seq}-${Date.now()}`;
    pi.events.on(`${channel}:reply:${requestId}`, (data) => resolve(asDict(data) ?? {}));
    pi.events.emit(channel, { ...params, requestId });
    return promise;
  };

  const idFrom = (reply: Dict): string | undefined => {
    const id = asDict(reply.data)?.id;
    return typeof id === "string" ? id : undefined;
  };

  const summary = (id: string): Dict | null => {
    const rec = asDict(managerSlot()?.getRecord(id));
    if (!rec) return null;
    return {
      id: rec.id,
      type: rec.type,
      status: rec.status,
      parentAgentId: rec.parentAgentId ?? null,
      rootSessionId: rec.rootSessionId ?? null,
      sessionFile: rec.sessionFile ?? null,
      outputFile: rec.outputFile ?? null,
      startedAt: rec.startedAt ?? null,
      completedAt: rec.completedAt ?? null,
      lifetimeUsage: rec.lifetimeUsage ?? null,
      result: typeof rec.result === "string" ? rec.result.slice(0, 400) : (rec.result ?? null),
      error: rec.error ?? null,
      toolUses: rec.toolUses ?? null,
    };
  };

  const waitTerminal = async (id: string, timeoutMs: number): Promise<Dict | null> => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const hit = terminals.get(id);
      if (hit) return hit;
      await sleep(250);
    }
    return null;
  };

  for (const ch of CHANNELS) {
    pi.events.on(`subagents:${ch}`, (data) => {
      const payload = asDict(data) ?? {};
      if (ch === "ready") flags.ready = true;
      if ((ch === "completed" || ch === "failed") && typeof payload.id === "string") {
        terminals.set(payload.id, payload);
        // Suppress the completion notification (and its parent model turn) for a result
        // we are reporting ourselves; must fire synchronously inside this handler.
        const consumeId = `wf06-live-consume-${++seq}-${Date.now()}`;
        pi.events.on(`subagents:rpc:consume:reply:${consumeId}`, (reply) =>
          log({ at: "consume.reply", agentId: payload.id, reply: asDict(reply) ?? {} }),
        );
        pi.events.emit("subagents:rpc:consume", { requestId: consumeId, agentId: payload.id });
      }
      log({ at: "bus.event", channel: `subagents:${ch}`, data: payload });
    });
  }

  const spawn = async (label: string, prompt: string, options: Dict): Promise<string | undefined> => {
    const reply = await rpc("subagents:rpc:spawn", { type: AGENT_TYPE, prompt, options });
    const id = idFrom(reply);
    log({ at: "spawn.reply", label, reply, id: id ?? null, record: id ? summary(id) : null });
    return id;
  };

  const run = async (): Promise<void> => {
    const until = Date.now() + 8000;
    while (!flags.ready && Date.now() < until) await sleep(100);
    log({ at: "phase", phase: "ready", ready: flags.ready });

    const [aId, bId] = await Promise.all([
      spawn("A-long", LONG_PROMPT, { model: MODEL, thinkingLevel: "off", maxTurns: 1, description: "long output to stop" }),
      spawn("B-ok", "Reply with exactly OK", { model: MODEL, thinkingLevel: "off", maxTurns: 1, description: "ok probe" }),
    ]);

    await sleep(6000);
    if (aId) {
      log({ at: "check.before.stop", id: aId, record: summary(aId) });
      log({ at: "stop.reply", id: aId, reply: await rpc("subagents:rpc:stop", { agentId: aId }) });
    }
    const bTerm = bId ? await waitTerminal(bId, 180000) : null;
    log({ at: "terminal", label: "B-ok", terminal: bTerm, record: bId ? summary(bId) : null });
    const aTerm = aId ? await waitTerminal(aId, 180000) : null;
    log({ at: "terminal", label: "A-long", terminal: aTerm, record: aId ? summary(aId) : null });

    const pId = await spawn("P-nested", NESTED_PROMPT, {
      model: MODEL,
      thinkingLevel: "off",
      maxTurns: 3,
      description: "nested probe",
      inheritContext: false,
    });
    const pTerm = pId ? await waitTerminal(pId, 300000) : null;
    log({ at: "terminal", label: "P-nested", terminal: pTerm, record: pId ? summary(pId) : null });

    log({ at: "phase", phase: "done" });
  };

  pi.on("session_start", () => {
    log({ at: "session_start", tools: pi.getAllTools().map((t) => ({ name: t.name })) });
    // Root-activation provider probes: any hit means the root session itself called a model
    // (subagent sessions have their own activations, so they never reach these).
    pi.on("before_provider_request", (event) => log({ at: "before_provider_request", keys: Object.keys(event ?? {}).sort() }));
    pi.on("after_provider_response", (event) => log({ at: "after_provider_response", keys: Object.keys(event ?? {}).sort() }));
    void run().catch((error) => {
      log({ at: "error", error: String(error) });
      log({ at: "phase", phase: "done", failed: true });
    });
  });
}
