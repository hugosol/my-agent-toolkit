import { readFileSync, readdirSync } from "node:fs";
const dir = process.argv[2];
for (const name of readdirSync(dir).filter(n => n.startsWith("request-")).sort()) {
  const r = JSON.parse(readFileSync(`${dir}/${name}`, "utf8"));
  const sys = typeof r.messages[0]?.content === "string" ? r.messages[0].content : JSON.stringify(r.messages[0]?.content);
  const roles = r.messages.map(m => m.role).join(",");
  const hasInit = JSON.stringify(r.messages).includes("codebase-memory-mcp") ? "INIT?" : "-";
  const toolCalls = r.messages.flatMap(m => (m.tool_calls || []).map(t => t.function?.name));
  console.log(`${name} | msgs=${r.messages.length} | sysLen=${sys?.length} | roles=${roles} | init=${hasInit} | toolCalls=${toolCalls.join("+") || "-"}`);
  const sysHead = sys?.slice(0, 80).replace(/\n/g, " ");
  console.log(`    sys: ${JSON.stringify(sysHead)}`);
}
