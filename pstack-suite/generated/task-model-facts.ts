import { readFileSync } from "node:fs";
import { join } from "node:path";

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
interface ToolResult {
  toolName: string;
  content: Content[];
  details: unknown;
}
interface Omp {
  on(event: "tool_result", handler: (result: ToolResult, context: {
    model?: { provider: string; id: string };
  }) => { content: Content[] } | undefined): void;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export default function taskModelFacts(omp: Omp): void {
  let roster: Record<string, unknown> | undefined;
  try {
    roster = record(JSON.parse(readFileSync(join(import.meta.dir, "roles.local.json"), "utf8")));
  } catch (error) {
    if (record(error)?.code === "ENOENT") return; // Setup has not published any bindings yet.
    throw error;
  }
  if (!roster) throw new Error("pstack roles.local.json must contain a role roster");
  const roles = roster;
  omp.on("tool_result", (event, context) => {
    if (event.toolName !== "task") return;
    const results = record(event.details)?.results;
    if (!Array.isArray(results)) return;
    const facts = results.flatMap(value => {
      const row = record(value);
      const id = text(row?.id);
      const agent = text(row?.agent);
      if (!row || !id || !agent || !Object.prototype.hasOwnProperty.call(roles, agent)) return [];
      const binding = record(roles[agent]);
      const configuredModel = text(binding?.model);
      if (!configuredModel) return [];
      const expected = configuredModel === "inherit-parent"
        ? context.model && `${context.model.provider}/${context.model.id}`
        : configuredModel;
      const actualModel = text(row.resolvedModelIdentity);
      const providerEnd = actualModel?.indexOf("/") ?? -1;
      const nativeSelectors = Array.isArray(row.modelOverride)
        ? row.modelOverride.filter((value): value is string => typeof value === "string")
        : typeof row.modelOverride === "string" ? [row.modelOverride] : [];
      const deviations: string[] = [];
      if (expected && nativeSelectors.length && (nativeSelectors.length !== 1 || nativeSelectors[0] !== expected)) {
        deviations.push("effective-selector-differs");
      }
      if (!actualModel) deviations.push("resolved-model-unknown");
      else if (expected && actualModel !== expected) deviations.push("resolved-model-differs");
      if (row.resolvedModelIsFallback === true) deviations.push("native-retry-fallback");
      return [{ id, agent, configuredModel, configuredThinking: text(binding?.thinking), nativeSelectors,
        actualModel: actualModel ?? null, provider: providerEnd > 0 ? actualModel?.slice(0, providerEnd) : null,
        actualThinking: text(row.resolvedThinkingLevel) ?? null, deviations }];
    });
    if (!facts.length) return;
    return { content: [...event.content, { type: "text", text: `pstack task facts: ${JSON.stringify(facts)}` }] };
  });
}
