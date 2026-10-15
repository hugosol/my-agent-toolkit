/**
 * Wayfinder ticket 06 — passive watcher consumer (real model).
 * Logs the subagents bus and root provider activity; never consumes results, so
 * completion notifications and their auto-continue turns stay visible.
 * Writes JSONL to $WF06_LOG. Never logs credentials.
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

export default function (pi: PiLike) {
  for (const ch of CHANNELS) {
    pi.events.on(`subagents:${ch}`, (data) => log({ at: "bus.event", channel: `subagents:${ch}`, data: asDict(data) ?? {} }));
  }
  pi.on("session_start", () => {
    log({ at: "session_start", tools: pi.getAllTools().map((t) => ({ name: t.name })) });
    pi.on("before_provider_request", (event) => log({ at: "root.before_provider_request", keys: Object.keys(event ?? {}).sort() }));
    pi.on("after_provider_response", (event) => log({ at: "root.after_provider_response", keys: Object.keys(event ?? {}).sort() }));
    log({ at: "watch.ready" });
  });
}
