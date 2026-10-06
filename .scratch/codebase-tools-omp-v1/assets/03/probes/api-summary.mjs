import { readFileSync } from "node:fs";
const m = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const [provider, value] of Object.entries(m)) {
  if (!/deepseek|codex/i.test(provider)) continue;
  const rows = Array.isArray(value) ? value : Object.values(value).flat();
  const apis = {};
  for (const row of rows) {
    const api = row?.api ?? "?";
    apis[api] = (apis[api] ?? 0) + 1;
  }
  console.log(provider, JSON.stringify(apis), "rows=" + rows.length, "sample=" + JSON.stringify(rows[0]?.id ?? rows[0]));
}
