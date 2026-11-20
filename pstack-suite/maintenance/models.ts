import { readFileSync } from "node:fs";
import { readFile } from "./files";
import { parseJson, record, type RenderedResource } from "./inputs";

export const bindingsPath = "models.local.json";
export const modelLedger = "models-ownership.local.json";
const coreRoles = ["poteto-agent", "comment-sicko"] as const;
const panelRoles = {
  "swarm-worker": "Work a specified swarm slice or race arm and report reproducible evidence.",
  "arena-runner": "Produce and verify an independent candidate in the assigned workspace.",
  "arena-judge": "Independently score candidate artifacts against the supplied rubric without editing them.",
  "interrogate-reviewer": "Try to falsify the scoped change and report only findings demonstrated by a run.",
} as const;
const efforts = ["off", "minimal", "low", "medium", "high", "xhigh"];

function panelRole(name: string): keyof typeof panelRoles | undefined {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(name)) return;
  return (Object.keys(panelRoles) as (keyof typeof panelRoles)[]).find(role => name.startsWith(`${role}-`));
}
// Native OMP uses @default alone in a persona to inherit the active parent model.
const inheritSelector = "@default";

interface Binding {
  model: string;
  thinking: string;
}
type Bindings = Record<string, Binding>;

function parseBindings(input: unknown, label: string): Bindings {
  const values = record(input, label);
  const seats = Object.keys(values).filter(key => !coreRoles.some(role => role === key));
  for (const seat of seats) {
    if (!panelRole(seat)) throw new Error(`${label}: unknown role ${seat}`);
  }
  const bindings: Bindings = {};
  for (const role of [...coreRoles, ...seats]) {
    const binding = record(values[role], role);
    if (Object.keys(binding).some(key => key !== "model" && key !== "thinking")) {
      throw new Error(`${role}: expected only model and thinking`);
    }
    const { model, thinking } = binding;
    if (typeof model !== "string" || (model !== "inherit-parent" && !/^[\w.-]+\/[\w./:@+-]+$/.test(model))) {
      throw new Error(`${role}: choose an exact provider/model selector or inherit-parent`);
    }
    if (model === "inherit-parent" && thinking !== "inherit") {
      throw new Error(`${role}: inherit-parent requires thinking: inherit`);
    }
    if (typeof thinking !== "string" || (model !== "inherit-parent" && thinking !== "default" && !efforts.includes(thinking))) {
      throw new Error(`${role}: invalid thinking level ${JSON.stringify(thinking)}`);
    }
    bindings[role] = { model, thinking };
  }
  return bindings;
}

export function confirmedBindings(proposal: string, catalogPath: string): Bindings {
  const bindings = parseBindings(parseJson(readFileSync(proposal), proposal), proposal);
  const catalog = record(parseJson(readFileSync(catalogPath), catalogPath), catalogPath);
  if (!Array.isArray(catalog.models)) throw new Error(`${catalogPath}: expected OMP models --json output`);
  const models = new Map<string, Record<string, unknown>>();
  for (const raw of catalog.models) {
    const model = record(raw, catalogPath);
    if (model.kind !== "chat" || typeof model.selector !== "string") continue;
    if (models.has(model.selector)) throw new Error(`${catalogPath}: duplicate model ${model.selector}`);
    models.set(model.selector, model);
  }
  for (const [name, { model, thinking }] of Object.entries(bindings)) {
    if (model === "inherit-parent") continue;
    const row = models.get(model);
    if (!row) throw new Error(`${name}: unavailable model ${model}`);
    if (thinking === "default") continue;
    const supported = Array.isArray(row.thinking) ? row.thinking.includes(thinking) : row.reasoning === false && thinking === "off";
    if (!supported) throw new Error(`${name}: unsupported thinking level ${thinking} for ${model}`);
  }
  return bindings;
}

export function savedBindings(root: string): Bindings | undefined {
  const bytes = readFile(root, bindingsPath);
  if (!bytes) return undefined;
  const saved = record(parseJson(bytes, bindingsPath), bindingsPath);
  if (saved.confirmed !== true) throw new Error(`${bindingsPath}: expected confirmed setup settings`);
  return parseBindings(saved.roles, bindingsPath);
}

export function modelResources(resources: readonly RenderedResource[], bindings: Bindings | undefined) {
  if (resources.some(resource => {
    const [directory] = resource.output.toLowerCase().split("/", 1);
    return directory === "agents" || directory === "roles.local.json";
  })) {
    throw new Error("Static resources cannot use the models-owned generated/agents or generated/roles.local.json paths");
  }
  if (!bindings) return [];
  function sourceTemplate(role: typeof coreRoles[number]): string {
    const output = `persona-templates/${role}.md`;
    const template = resources.find(resource => resource.output === output)?.bytes.toString("utf8");
    if (!template?.startsWith("---\n")) throw new Error(`${output}: missing persona template or frontmatter`);
    return template;
  }
  const worker = sourceTemplate("poteto-agent");
  const reviewer = sourceTemplate("comment-sicko");
  const bodyStart = worker.indexOf("\n---\n", 4);
  if (bodyStart < 0) throw new Error("persona-templates/poteto-agent.md: missing closing frontmatter");
  const workerBody = worker.slice(bodyStart + "\n---\n".length);
  const delivery = Object.entries(bindings).map(([role, { model, thinking }]) => {
    const panel = panelRole(role);
    const tools = panel === "arena-judge" ? "tools: [read, grep, find]\n" : "";
    const template = panel
      ? `---\nname: ${role}\ndescription: ${panelRoles[panel]}\nblocking: true\n${tools}---\n${workerBody}`
      : role === "poteto-agent" ? worker : reviewer;
    const native = model === "inherit-parent" ? inheritSelector : model;
    const effort = thinking === "inherit" || thinking === "default" ? "" : `thinking-level: ${thinking}\n`;
    const bytes = Buffer.from(`---\nmodel: ${JSON.stringify(native)}\n${effort}${template.slice(4)}`);
    return { output: `agents/${role}.md`, bytes };
  });
  delivery.push({ output: "roles.local.json", bytes: Buffer.from(`${JSON.stringify(bindings, null, 2)}\n`) });
  return delivery;
}
