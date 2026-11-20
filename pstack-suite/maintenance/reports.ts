import { lstatSync } from "node:fs";
import { sha256 } from "./delivery";
import { readFile } from "./files";
import { text, type Manifest, type RenderedResource } from "./inputs";

export function preview(delivery: readonly RenderedResource[]) {
  let count = 0;
  for (const { output, source, mapping, original, edits } of delivery) {
    let line = 1;
    let offset = 0;
    for (const edit of edits) {
      count++;
      while (offset < edit.start) if (original[offset++] === "\n") line++;
      console.log(`@@ ${output}:${line} [${edit.name}] @@`);
      console.log(`Mapping: ${mapping} (snapshot: ${source})\nReason: ${edit.reason}`);
      for (const [prefix, value] of [["-", edit.before], ["+", edit.after]]) {
        if (value) for (const part of value.split("\n")) console.log(`${prefix}${part}`);
      }
    }
  }
  if (!count) console.log("No mapped edits.");
}

function changedLines(source: string, snapshot: string, local: string) {
  // Keep line terminators with the text so an added or removed final LF is a diff.
  const before = snapshot.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const after = local.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  console.log(`--- snapshot/${source}\n+++ local/${source}`);
  const oldCount = oldEnd - start;
  const newCount = newEnd - start;
  console.log(`@@ -${start + Number(oldCount > 0)},${oldCount} +${start + Number(newCount > 0)},${newCount} @@`);
  for (const [prefix, lines] of [["-", before.slice(start, oldEnd)], ["+", after.slice(start, newEnd)]] as const) {
    for (const line of lines) {
      console.log(`${prefix}${line.endsWith("\n") ? line.slice(0, -1) : `${line}\n\\ No newline at end of file`}`);
    }
  }
}

export function compareUpstream(root: string, local: string, manifest: Manifest): boolean {
  const baseline = lstatSync(local, { throwIfNoEntry: false });
  if (!baseline?.isDirectory() || baseline.isSymbolicLink()) throw new Error(`${local}: expected a real local upstream directory`);
  const { repository, revision, version } = manifest.upstream;
  console.log(`Snapshot: ${repository} @ ${revision} (${version})\nLocal baseline: ${local}`);
  let different = false;
  const compared = new Set<string>();
  for (const { source, kind, origin } of manifest.files) {
    if (origin === "runtime" || compared.has(source)) continue;
    compared.add(source);
    const snapshot = readFile(root, `upstream/${source}`);
    if (!snapshot) throw new Error(`upstream/${source}: missing pinned snapshot input`);
    const candidate = readFile(local, source);
    if (!candidate) {
      different = true;
      console.log(`Missing from local baseline: ${source}`);
    } else if (!snapshot.equals(candidate)) {
      if (kind === "binary") {
        different = true;
        console.log(`${source}: binary differs (snapshot ${snapshot.length} bytes, sha256 ${sha256(snapshot)}; local ${candidate.length} bytes, sha256 ${sha256(candidate)})`);
      } else {
        const before = text(snapshot, `snapshot/${source}`);
        const after = text(candidate, `local/${source}`);
        if (before === after) continue;
        different = true;
        changedLines(source, before, after);
      }
    }
  }
  if (!different) console.log("Local baseline matches all listed snapshot sources.");
  return different;
}
