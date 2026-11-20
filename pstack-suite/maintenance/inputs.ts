import { readFile } from "./files";

interface Resource {
  source: string;
  output: string;
  kind: "text" | "binary";
  mapping?: string;
}

interface Operation {
  name: string;
  reason: string;
  anchor: string;
  find?: string;
  replace: string;
}

interface Edit {
  name: string;
  reason: string;
  start: number;
  before: string;
  after: string;
}

export interface RenderedResource {
  source: string;
  output: string;
  mapping?: string;
  bytes: Buffer;
  original: string;
  edits: Edit[];
}

export interface Manifest {
  upstream: { repository: string; revision: string; version: string };
  files: Resource[];
}

function inputFile(root: string, path: string): Buffer {
  const bytes = readFile(root, path);
  if (!bytes) throw new Error(`${path}: missing input file`);
  return bytes;
}

export function parseJson(bytes: Buffer, path: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : error}`);
  }
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: expected an object`);
  return value as Record<string, unknown>;
}

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}: expected non-empty text`);
  return value;
}

export function relativePath(value: unknown, label: string): string {
  const path = required(value, label);
  if (path.split("/").some(part => !part || /[. ]$|[\\:*?"<>|\x00-\x1f]/.test(part)
    || /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(part))) {
    throw new Error(`${label}: expected a portable relative file path, got ${JSON.stringify(path)}`);
  }
  return path;
}

export function loadManifest(root: string): Manifest {
  const label = "manifest.json";
  const input = record(parseJson(inputFile(root, label), label), label);
  const provenance = record(input.upstream, `${label}: upstream`);
  if (!Array.isArray(input.files)) throw new Error(`${label}: expected a files array`);
  const outputs = new Set<string>();
  const sources = new Map<string, Resource["kind"]>();
  const files = input.files.map((item, index): Resource => {
    const where = `${label}: files[${index}]`;
    const row = record(item, where);
    const source = relativePath(row.source, `${where}.source`);
    const output = relativePath(row.output, `${where}.output`);
    if (outputs.has(output.toLowerCase())) throw new Error(`${where}: duplicate output ${output}`);
    outputs.add(output.toLowerCase());
    const kind = row.kind;
    if (kind !== "text" && kind !== "binary") throw new Error(`${where}: kind must be text or binary`);
    const priorKind = sources.get(source.toLowerCase());
    if (priorKind && priorKind !== kind) throw new Error(`${where}: conflicting kinds for ${source}`);
    sources.set(source.toLowerCase(), kind);
    const mapping = row.mapping === undefined ? undefined : relativePath(row.mapping, `${where}.mapping`);
    if (mapping !== undefined && kind !== "text") throw new Error(`${where}: binary resources cannot have mappings`);
    return { source, output, kind, mapping };
  });
  return {
    upstream: {
      repository: required(provenance.repository, `${label}: upstream.repository`),
      revision: required(provenance.revision, `${label}: upstream.revision`),
      version: required(provenance.version, `${label}: upstream.version`),
    },
    files,
  };
}

export function text(bytes: Buffer, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, "\n");
  } catch {
    throw new Error(`${path}: declared text is not valid UTF-8`);
  }
}

function loadMapping(root: string, path: string): Operation[] {
  const input = parseJson(inputFile(root, path), path);
  if (!Array.isArray(input) || input.length === 0) throw new Error(`${path}: expected a non-empty operation array`);
  const names = new Set<string>();
  return input.map((item, index) => {
    const row = record(item, `${path}: operation ${index + 1}`);
    const name = required(row.name, `${path}: operation ${index + 1} name`);
    const label = `${path} [${name}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || names.has(name)) throw new Error(`${label}: invalid or duplicate operation name`);
    names.add(name);
    if (typeof row.replace !== "string") throw new Error(`${label}: expected a replacement string (empty to delete)`);
    return {
      name,
      reason: required(row.reason, `${label}: reason`),
      anchor: required(row.anchor, `${label}: anchor`),
      find: row.find === undefined ? undefined : required(row.find, `${label}: find`),
      replace: row.replace,
    };
  });
}

function editsFor(original: string, resource: Resource, operations: readonly Operation[]): Edit[] {
  const edits = operations.map(op => {
    const label = `${resource.source} -> ${resource.output} (${resource.mapping} [${op.name}])`;
    const anchor = original.indexOf(op.anchor);
    if (anchor === -1) throw new Error(`${label}: missing anchor`);
    if (original.indexOf(op.anchor, anchor + 1) !== -1) throw new Error(`${label}: ambiguous anchor`);
    const before = op.find ?? op.anchor;
    const offset = op.anchor.indexOf(before);
    if (offset === -1) throw new Error(`${label}: find text is not inside the anchor`);
    if (op.anchor.indexOf(before, offset + 1) !== -1) throw new Error(`${label}: ambiguous find inside anchor`);
    if (before === op.replace) throw new Error(`${label}: replacement makes no change`);
    return { name: op.name, reason: op.reason, start: anchor + offset, before, after: op.replace };
  });
  edits.sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++) {
    const previous = edits[i - 1];
    const current = edits[i];
    if (current.start < previous.start + previous.before.length) {
      throw new Error(`${resource.source} -> ${resource.output} (${resource.mapping} [${current.name}]): conflicting edit with [${previous.name}]`);
    }
  }
  return edits;
}

export function render(root: string, files: readonly Resource[]): RenderedResource[] {
  return files.map(resource => {
    const { source, output, kind, mapping } = resource;
    const input = inputFile(root, `upstream/${source}`);
    if (kind === "binary") return { source, output, mapping, bytes: input, original: "", edits: [] };
    const original = text(input, source);
    const edits = mapping ? editsFor(original, resource, loadMapping(root, `mappings/${mapping}`)) : [];
    const chunks: string[] = [];
    let end = 0;
    for (const edit of edits) {
      chunks.push(original.slice(end, edit.start), edit.after);
      end = edit.start + edit.before.length;
    }
    chunks.push(original.slice(end));
    return { source, output, mapping, bytes: Buffer.from(chunks.join("")), original, edits };
  });
}
