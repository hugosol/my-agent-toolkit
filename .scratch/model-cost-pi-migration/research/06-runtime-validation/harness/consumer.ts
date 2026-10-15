/**
 * Wayfinder ticket 06 — minimal third-party consumer used only inside the isolated
 * validation environment. Records what a same-bus consumer can observe:
 *  - extension factory / session_start / session_shutdown timing
 *  - registered tools via pi.getAllTools()
 *  - the pi-subagents manager registry slot
 *  - the 11 documented `subagents:*` bus channels
 *  - the documented `subagents:rpc:ping` request/reply contract
 *
 * Writes JSONL to $WF06_LOG. No model calls, no repo access.
 */
import { appendFileSync } from "node:fs";

const LOG = process.env.WF06_LOG ?? "";
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
const PING_CHANNEL = "subagents:rpc:ping";

interface ToolInfoLike {
  name?: unknown;
  exposure?: unknown;
  source?: unknown;
}

interface PiLike {
  events: {
    on(channel: string, handler: (data: unknown) => void): () => void;
    emit(channel: string, data: unknown): void;
  };
  on(event: "session_start" | "session_shutdown", handler: (event: SessionEventLike) => void): () => void;
  getAllTools(): ToolInfoLike[];
}

interface SessionEventLike {
  reason?: unknown;
}

function log(record: Record<string, unknown>): void {
  if (!LOG) return;
  appendFileSync(LOG, `${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
}

function registryKeys(): unknown {
  // globalThis is not indexable by symbol in TS; a symbol-keyed global registry needs this single widening.
  const globals = globalThis as unknown as Record<string | symbol, unknown>;
  const reg = globals[Symbol.for("pi-subagents:manager")];
  if (!reg || typeof reg !== "object") return null;
  return Object.keys(reg).sort();
}

function tools(pi: PiLike): unknown {
  try {
    return pi.getAllTools().map((t) => ({ name: t.name, exposure: t.exposure, source: t.source }));
  } catch (error) {
    return { error: String(error) };
  }
}

export default function (pi: PiLike) {
  let gotReply = false;
  let pending = 0;

  const ping = (why: string): void => {
    const requestId = `wf06-${why}-${++pending}-${Date.now()}`;
    log({ at: "ping.send", why, requestId, registry: registryKeys() });
    pi.events.on(`${PING_CHANNEL}:reply:${requestId}`, (data: unknown) => {
      gotReply = true;
      log({ at: "ping.reply", why, requestId, data });
    });
    pi.events.emit(PING_CHANNEL, { requestId });
  };

  log({ at: "factory", tools: tools(pi), registry: registryKeys() });

  for (const ch of CHANNELS) {
    pi.events.on(`subagents:${ch}`, (data: unknown) => log({ at: "bus.event", channel: `subagents:${ch}`, data }));
  }

  const rpcCall = (channel: string, params: Record<string, unknown>, label: string): void => {
    const requestId = `wf06-${label}-${++pending}-${Date.now()}`;
    log({ at: "rpc.send", channel, label, requestId, params });
    pi.events.on(`${channel}:reply:${requestId}`, (data: unknown) => {
      log({ at: "rpc.reply", channel, label, requestId, data });
    });
    pi.events.emit(channel, { ...params, requestId });
  };

  pi.on("session_start", (event) => {
    log({ at: "session_start", reason: event?.reason, tools: tools(pi), registry: registryKeys() });
    ping("session_start");
    rpcCall("subagents:rpc:stop", { agentId: "wf06-does-not-exist" }, "stop_missing");
    rpcCall("subagents:rpc:consume", { agentId: "wf06-does-not-exist" }, "consume_missing");
    let tries = 0;
    const timer = setInterval(() => {
      if (gotReply || tries >= 20) {
        clearInterval(timer);
        log({ at: "ping.done", gotReply, tries });
        return;
      }
      tries += 1;
      ping(`retry_${tries}`);
    }, 250);
  });

  pi.on("session_shutdown", (event) => {
    log({ at: "session_shutdown", reason: event?.reason, registry: registryKeys() });
  });
}
