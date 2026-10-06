import { readFileSync, existsSync } from "node:fs";
const reqPath = process.argv[2];
const sessPath = process.argv[3];
if (reqPath && existsSync(reqPath)) {
  const req = JSON.parse(readFileSync(reqPath, "utf8"));
  console.log("=== CAPTURE REQUEST ===");
  console.log("keys:", Object.keys(req).join(","), "| model:", req.model, "| stream:", req.stream);
  for (const [i, m] of (req.messages||[]).entries()) {
    const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    const tc = m.tool_calls ? " tool_calls=" + JSON.stringify(m.tool_calls.map(t => ({ name: t.function?.name, args: t.function?.arguments }))) : "";
    const tcid = m.tool_call_id ? " tool_call_id=" + m.tool_call_id : "";
    console.log(`  [${i}] role=${m.role} len=${c?.length ?? 0}${tcid}${tc} :: ${JSON.stringify(String(c).slice(0,110))}`);
  }
  console.log("tools:", (req.tools||[]).map(t => t.function?.name ?? t.name).join(","));
} else console.log("no capture request at", reqPath);
if (sessPath && existsSync(sessPath)) {
  console.log("\n=== SESSION JSONL ===");
  const lines = readFileSync(sessPath, "utf8").trim().split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
  for (const [i, e] of lines.entries()) {
    const t = e.type ?? "?";
    const ct = e.customType ?? "";
    const summary = JSON.stringify(e.data ?? e.message ?? e.content ?? e).slice(0, 200);
    console.log(`  [${i}] type=${t} customType=${ct} :: ${summary}`);
  }
} else console.log("no session file at", sessPath);
