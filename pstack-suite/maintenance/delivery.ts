import { createHash } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { errorMessage, fileAt, readFile, writeFile } from "./files";
import { parseJson, record, relativePath } from "./inputs";

const resourceLedger = "generated-ownership.json";

interface Delivery {
  output: string;
  bytes: Buffer;
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function loadOwnership(root: string, ledger: string): Map<string, string> {
  const bytes = readFile(root, ledger);
  if (!bytes) return new Map();
  const data = record(parseJson(bytes, ledger), ledger);
  if (data.version !== 1) throw new Error(`${ledger}: expected ownership version 1`);
  const entries = Object.entries(record(data.files, `${ledger}: files`));
  const seen = new Set<string>();
  return new Map(entries.map(([path, hash]) => {
    const output = relativePath(path, ledger);
    if (seen.has(output.toLowerCase())) throw new Error(`${ledger}: ambiguous owned path ${output}`);
    seen.add(output.toLowerCase());
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`${ledger}: invalid SHA-256 for ${output}`);
    return [output, hash];
  }));
}

export function check(root: string, delivery: readonly Delivery[], ledger = resourceLedger): string[] {
  const owned = loadOwnership(root, ledger);
  const differences: string[] = [];
  for (const { output, bytes } of delivery) {
    const path = `generated/${output}`;
    const current = readFile(root, path);
    if (!current) differences.push(`Missing ${path}`);
    else if (!current.equals(bytes)) differences.push(`Changed ${path}`);
    if (owned.get(output) !== sha256(bytes)) differences.push(`Ownership differs for ${path}`);
    owned.delete(output);
  }
  for (const output of owned.keys()) differences.push(`Expired ownership for generated/${output}`);
  return differences;
}

export function build(root: string, delivery: readonly Delivery[], effects: string[], ledger = resourceLedger) {
  const owned = loadOwnership(root, ledger);
  const previous = new Map(owned);
  const spellings = new Map([...previous.keys()].map(path => [path.toLowerCase(), path]));
  const desired = new Set(delivery.map(file => file.output));
  let failed: unknown;
  try {
    for (const { output, bytes } of delivery) {
      const known = spellings.get(output.toLowerCase());
      if (known !== undefined && known !== output) throw new Error(`Case-only output rename ${known} -> ${output}; remove the previous output in a separate build`);
      const path = `generated/${output}`;
      const { stat } = fileAt(root, path);
      if (stat && !owned.has(output)) throw new Error(`Refusing to overwrite unowned path ${path}`);
      const current = readFile(root, path);
      if (!current?.equals(bytes)) writeFile(root, path, bytes, effects);
      owned.set(output, sha256(bytes));
    }
    for (const [output, hash] of previous) {
      if (desired.has(output)) continue;
      const relative = `generated/${output}`;
      const { path, stat } = fileAt(root, relative);
      if (stat) {
        if (stat.isFile() && !stat.isSymbolicLink() && sha256(readFileSync(path)) === hash) {
          unlinkSync(path);
          effects.push(`Removed expired ${relative}`);
        } else {
          effects.push(`Preserved modified expired ${relative} (relinquished ownership)`);
        }
      }
      owned.delete(output);
    }
  } catch (error) {
    failed = error;
  }
  try {
    if (owned.size !== previous.size || [...owned].some(([path, hash]) => previous.get(path) !== hash)) {
      const sorted = [...owned.keys()].sort().map(path => [path, owned.get(path)]);
      const bytes = Buffer.from(`${JSON.stringify({ version: 1, files: Object.fromEntries(sorted) }, null, 2)}\n`);
      writeFile(root, ledger, bytes, effects);
    }
  } catch (error) {
    const primary = failed ? `${errorMessage(failed)}\n` : "";
    throw new Error(`${primary}Could not save ownership after publication: ${errorMessage(error)}`);
  }
  if (failed) throw failed;
}
