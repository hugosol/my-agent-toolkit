/**
 * Wayfinder ticket 06 — cancel retry: the first in-flight cancel produced a terminal
 * event with null usage (no cost reading), so this re-runs that case once per the
 * user's cost-unavailable policy. Writes JSONL to $WF06_LOG.
 */
import { appendFileSync, readFileSync } from "node:fs";

const LOG = process.env.WF06_LOG ?? "";
const MODEL = "deepseek/deepseek-flash";
const LONG_PROMPT =
  "Do not use any tools. Output the integers from 1 to 5000, one per line, and nothing else. Do not stop early.";

type Dict = Record<string, unknown>;

interface PiLike {
  events: { on(channel: string, handler: (data: unknown) => void): () => void; emit(channel: string, data: unknown): void };
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
  let terminal: Dict | null = null;
  let agentId: string | undefined;
  let ready = false;
  let seq = 0;

  const sleep = (ms: number): Promise<void> => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    return promise;
  };
  const rpc = (channel: string, params: Dict): Promise<Dict> => {
    const { promise, resolve } = Promise.withResolvers<Dict>();
    const requestId = `wf06-cancel-${++seq}-${Date.now()}`;
    pi.events.on(`${channel}:reply:${requestId}`, (data) => resolve(asDict(data) ?? {}));
    pi.events.emit(channel, { ...params, requestId });
    return promise;
  };

  pi.events.on("subagents:ready", () => {
    ready = true;
  });
  pi.events.on("subagents:completed", (data) => {
    const d = asDict(data);
    if (d && d.id === agentId) terminal = d;
    log({ at: "bus.event", channel: "subagents:completed", data: d ?? {} });
  });
  pi.events.on("subagents:failed", (data) => {
    const d = asDict(data);
    if (d && d.id === agentId) terminal = d;
    log({ at: "bus.event", channel: "subagents:failed", data: d ?? {} });
  });

  pi.on("session_start", () => {
    log({ at: "session_start", tools: pi.getAllTools().map((t) => ({ name: t.name })) });
    void (async () => {
      const until = Date.now() + 8000;
      while (!ready && Date.now() < until) await sleep(100);
      const reply = await rpc("subagents:rpc:spawn", {
        type: "general-purpose",
        prompt: LONG_PROMPT,
        options: { model: MODEL, thinkingLevel: "off", maxTurns: 1, description: "cancel retry" },
      });
      const id = asDict(reply.data)?.id;
      agentId = typeof id === "string" ? id : undefined;
      log({ at: "spawn.reply", reply, id: agentId ?? null });
      await sleep(2500);
      const rec = agentId ? asDict(managerSlot()?.getRecord(agentId)) : undefined;
      log({ at: "check.before.stop", id: agentId ?? null, status: rec?.status ?? null });
      log({ at: "stop.reply", reply: agentId ? await rpc("subagents:rpc:stop", { agentId }) : null });
      const until2 = Date.now() + 120000;
      while (!terminal && Date.now() < until2) await sleep(200);
      log({ at: "terminal", terminal });
      if (agentId) {
        const after = asDict(managerSlot()?.getRecord(agentId));
        const sessionFile = after?.sessionFile;
        let assistantUsages: Array<Dict> = [];
        if (typeof sessionFile === "string") {
          try {
            for (const line of readFileSync(sessionFile, "utf8").split("\n")) {
              if (!line.trim()) continue;
              const m = asDict(asDict(JSON.parse(line))?.message);
              if (m?.role === "assistant" && m.usage !== undefined) assistantUsages.push({ model: m.model ?? null, usage: m.usage });
            }
          } catch (error) {
            assistantUsages = [{ error: String(error) }];
          }
        }
        log({ at: "after.cancel", record: { status: after?.status ?? null, lifetimeUsage: after?.lifetimeUsage ?? null, completedAt: after?.completedAt ?? null }, sessionFile: sessionFile ?? null, assistantUsages });
      }
      log({ at: "phase", phase: "done" });
    })().catch((error) => {
      log({ at: "error", error: String(error) });
      log({ at: "phase", phase: "done", failed: true });
    });
  });
}
