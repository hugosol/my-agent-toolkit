import { randomUUID } from "node:crypto";
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Walk every ancestor without following links or junctions. Stops at the first
// absent directory on a read; a write can create only its own required parents.
export function fileAt(root: string, relative: string, effects?: string[]) {
  const parts = relative.split("/");
  const path = join(root, relative);
  let parent = root;
  for (let i = 0; i < parts.length - 1; i++) {
    parent = join(parent, parts[i]);
    const entry = lstatSync(parent, { throwIfNoEntry: false });
    if (!entry) {
      if (!effects) return { path, stat: undefined };
      mkdirSync(parent);
      effects.push(`Created directory ${parts.slice(0, i + 1).join("/")}`);
    } else if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`${parent}: expected a real directory, not a file or link`);
    }
  }
  return { path, stat: lstatSync(path, { throwIfNoEntry: false }) };
}

export function readFile(root: string, relative: string) {
  const { path, stat } = fileAt(root, relative);
  if (!stat) return undefined;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${path}: expected a regular file, not a link or directory`);
  return readFileSync(path);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function writeFile(root: string, relative: string, bytes: Buffer, effects: string[]) {
  const { path } = fileAt(root, relative, effects);
  const temporary = join(dirname(path), `.pstack-write-${randomUUID()}`);
  const fd = openSync(temporary, "wx");
  try {
    try {
      writeFileSync(fd, bytes);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch (cleanup) {
      effects.push(`Could not clean temporary file ${temporary}: ${errorMessage(cleanup)}`);
    }
    throw error;
  }
  effects.push(`Wrote ${relative}`);
}
