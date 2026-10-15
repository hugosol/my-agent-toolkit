/**
 * Wayfinder ticket 06 — nested delegation probe (real model).
 *
 * Spawns one top-level agent of type `nested-ok` (a custom agent definition with
 * `allowed_subagents: all`, the opt-in that makes the nested Agent tool exist at all).
 * That parent must call its nested Agent tool once, producing a grandchild run.
 *
 * Hard cap for this ticket: 4 subagent executions total. This file spends the two
 * needed to observe real nesting (parent + grandchild).
 *
 * Writes JSONL to $WF06_LOG. Never logs credentials.
 */
import { appendFileSync, readdirSync } from "node:fs";

const LOG = process.env.WF06_LOG ?? "";
const SESSIONS_DIR = process.env.WF06_SESSIONS ?? "";
const MODEL = "deepseek/deepseek-flash";
const PARENT_TYPE = "nested-ok";
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
const NESTED_PROMPT = [
  "Call the Agent tool exactly once now, with exactly these arguments:",
  '  subagent_type: "general-purpose"',
  '  description: "nested ok check"',
  '  prompt: "Reply with exactly OK"',
  "Then reply with exactly: NESTED_RESULT=<the text the nested agent returned>",
  "No other tools, no other text.",
].join("\n");

type Dict = Record<string, unknown>;

interface PiLike {
  events: {
    on(channel: string, handler: (data: unknown) => void): () => void;
    emit(channel: string, data: unknown): void;
  };
  on(event: string, handler: (event: Dict) => void): () => void;
  getAllTools(): Array<{ name?: unknown }>;
}

function asDict(value: unknown): Dict | undefined {
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
  return { getRecord: (id: string) => (getRecord as (value: string) => unknown).call(slot as object, id) };
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
    const requestId = `wf06-nested-${++seq}-${Date.now()}`;
    pi.events.on(`${channel}:reply:${requestId}`, (data) => resolve(asDict(data) ?? {}));
    pi.events.emit(channel, { ...params, requestId });
    return promise;
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
      startedAt: rec.startedAt ?? null,
      completedAt: rec.completedAt ?? null,
      lifetimeUsage: rec.lifetimeUsage ?? null,
      toolUses: rec.toolUses ?? null,
      result: typeof rec.result === "string" ? rec.result.slice(0, 500) : (rec.result ?? null),
      error: rec.error ?? null,
    };
  };

  const sessionFiles = (): string[] => {
    try {
      return readdirSync(SESSIONS_DIR).sort();
    } catch {
      return [];
    }
  };

  for (const ch of CHANNELS) {
    pi.events.on(`subagents:${ch}`, (data) => {
      const payload = asDict(data) ?? {};
      if (ch === "ready") flags.ready = true;
      if ((ch === "completed" || ch === "failed") && typeof payload.id === "string") {
        terminals.set(payload.id, payload);
        const consumeId = `wf06-nested-consume-${++seq}-${Date.now()}`;
        pi.events.on(`subagents:rpc:consume:reply:${consumeId}`, (reply) =>
          log({ at: "consume.reply", agentId: payload.id, reply: asDict(reply) ?? {} }),
        );
        pi.events.emit("subagents:rpc:consume", { requestId: consumeId, agentId: payload.id });
      }
      log({ at: "bus.event", channel: `subagents:${ch}`, data: payload });
    });
  }

  const waitTerminal = async (id: string, timeoutMs: number): Promise<Dict | null> => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const hit = terminals.get(id);
      if (hit) return hit;
      await sleep(250);
    }
    return null;
  };

  const run = async (): Promise<void> => {
    const until = Date.now() + 8000;
    while (!flags.ready && Date.now() < until) await sleep(100);
    log({ at: "phase", phase: "ready", ready: flags.ready, sessionsBefore: sessionFiles() });

    const reply = await rpc("subagents:rpc:spawn", {
      type: PARENT_TYPE,
      prompt: NESTED_PROMPT,
      options: { model: MODEL, thinkingLevel: "off", maxTurns: 3, description: "nested parent probe", inheritContext: false },
    });
    const data = asDict(reply.data);
    const parentId = typeof data?.id === "string" ? data.id : undefined;
    log({ at: "spawn.reply", label: "P-nested2", reply, id: parentId ?? null, record: parentId ? summary(parentId) : null });

    const terminal = parentId ? await waitTerminal(parentId, 300000) : null;
    log({ at: "terminal", label: "P-nested2", terminal, record: parentId ? summary(parentId) : null });
    log({ at: "sessions.after", sessions: sessionFiles() });
    log({ at: "phase", phase: "done" });
  };

  pi.on("session_start", () => {
    log({ at: "session_start", tools: pi.getAllTools().map((t) => ({ name: t.name })) });
    pi.on("before_provider_request", (event) => log({ at: "before_provider_request", keys: Object.keys(event ?? {}).sort() }));
    pi.on("after_provider_response", (event) => log({ at: "after_provider_response", keys: Object.keys(event ?? {}).sort() }));
    void run().catch((error) => {
      log({ at: "error", error: String(error) });
      log({ at: "phase", phase: "done", failed: true });
    });
  });
}
