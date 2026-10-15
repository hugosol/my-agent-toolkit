/**
 * Wayfinder ticket 06 — remaining bus-driven scenarios (real model, deepseek-flash).
 *
 *  1. in-flight cancel: spawn a long, tool-free text run, stop it mid-flight
 *  2. per-request facts: spawn a tool-using run (read + answer) and read the child
 *     session transcript's per-assistant-message usage afterwards
 *  3. error envelopes: spawn with a missing cwd and with an unknown model (no model call)
 *
 * Consumes each terminal result so no completion notification reaches the root.
 * Writes JSONL to $WF06_LOG. Never logs credentials.
 */
import { appendFileSync, readFileSync } from "node:fs";

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
  "Do not use any tools. Output the integers from 1 to 5000, one per line, and nothing else. Do not stop early.";
const TOOL_PROMPT =
  "Read the file ./hello.txt using the read tool, then reply with exactly: FILE=<the file contents>";

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
    const requestId = `wf06-rem-${++seq}-${Date.now()}`;
    pi.events.on(`${channel}:reply:${requestId}`, (data) => resolve(asDict(data) ?? {}));
    pi.events.emit(channel, { ...params, requestId });
    return promise;
  };

  const recordOf = (id: string): Dict | undefined => asDict(managerSlot()?.getRecord(id));

  const recordSummary = (id: string): Dict | null => {
    const rec = recordOf(id);
    if (!rec) return null;
    return {
      id: rec.id,
      type: rec.type,
      status: rec.status,
      sessionFile: rec.sessionFile ?? null,
      startedAt: rec.startedAt ?? null,
      completedAt: rec.completedAt ?? null,
      lifetimeUsage: rec.lifetimeUsage ?? null,
      toolUses: rec.toolUses ?? null,
      result: typeof rec.result === "string" ? rec.result.slice(0, 300) : (rec.result ?? null),
      error: rec.error ?? null,
    };
  };

  const assistantUsages = (sessionFile: unknown): Array<Dict> => {
    if (typeof sessionFile !== "string") return [];
    const out: Array<Dict> = [];
    try {
      for (const line of readFileSync(sessionFile, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const entry = asDict(JSON.parse(line));
        const message = asDict(entry?.message);
        if (message?.role === "assistant" && message.usage !== undefined) {
          out.push({ model: message.model ?? null, provider: message.provider ?? null, usage: message.usage });
        }
      }
    } catch (error) {
      return [{ error: String(error) }];
    }
    return out;
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
        const consumeId = `wf06-rem-consume-${++seq}-${Date.now()}`;
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
    const id = asDict(reply.data)?.id;
    const agentId = typeof id === "string" ? id : undefined;
    log({ at: "spawn.reply", label, reply, id: agentId ?? null, record: agentId ? recordSummary(agentId) : null });
    return agentId;
  };

  const run = async (): Promise<void> => {
    const until = Date.now() + 8000;
    while (!flags.ready && Date.now() < until) await sleep(100);
    log({ at: "phase", phase: "ready", ready: flags.ready });

    const [aId, cId] = await Promise.all([
      spawn("A2-cancel", LONG_PROMPT, { model: MODEL, thinkingLevel: "off", maxTurns: 1, description: "cancel target" }),
      spawn("C-tool", TOOL_PROMPT, { model: MODEL, thinkingLevel: "off", maxTurns: 3, description: "tool usage probe" }),
    ]);

    await sleep(3000);
    if (aId) {
      const before = recordOf(aId);
      log({ at: "check.before.stop", id: aId, status: before?.status ?? null, record: recordSummary(aId) });
      log({ at: "stop.reply", id: aId, reply: await rpc("subagents:rpc:stop", { agentId: aId }) });
    }

    const aTerm = aId ? await waitTerminal(aId, 180000) : null;
    log({ at: "terminal", label: "A2-cancel", terminal: aTerm, record: aId ? recordSummary(aId) : null });
    const cTerm = cId ? await waitTerminal(cId, 180000) : null;
    log({ at: "terminal", label: "C-tool", terminal: cTerm, record: cId ? recordSummary(cId) : null });
    if (cId) {
      const rec = recordOf(cId);
      log({ at: "per-request", label: "C-tool", sessionFile: rec?.sessionFile ?? null, assistantUsages: assistantUsages(rec?.sessionFile) });
    }

    // Error envelopes: no model call is expected for either.
    log({ at: "error.probe", label: "bad-cwd", reply: await rpc("subagents:rpc:spawn", { type: AGENT_TYPE, prompt: "never runs", options: { cwd: "Z:/wf06-missing-dir" } }) });
    log({ at: "error.probe", label: "bad-model", reply: await rpc("subagents:rpc:spawn", { type: AGENT_TYPE, prompt: "never runs", options: { model: "no-such-provider/no-such-model" } }) });

    log({ at: "phase", phase: "done" });
  };

  pi.on("session_start", () => {
    log({ at: "session_start", tools: pi.getAllTools().map((t) => ({ name: t.name })) });
    pi.on("before_provider_request", (event) => log({ at: "before_provider_request", keys: Object.keys(event ?? {}).sort() }));
    void run().catch((error) => {
      log({ at: "error", error: String(error) });
      log({ at: "phase", phase: "done", failed: true });
    });
  });
}
