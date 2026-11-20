import { cpSync } from "node:fs";
import { join, resolve } from "node:path";

const toolkit = resolve(import.meta.dir, "../..");

export function copyPstackPackage(cwd: string): string {
  const root = join(cwd, "pstack-suite");
  for (const entry of ["maintenance", "runtime", "upstream", "mappings", "manifest.json"]) {
    cpSync(join(toolkit, "pstack-suite", entry), join(root, entry), { recursive: true });
  }
  cpSync(join(toolkit, "package.json"), join(cwd, "package.json"));
  return root;
}

export interface CommandEvidence {
  argv: string[];
  exit: number;
  stdout: string;
  stderr: string;
}

export function runPstack(cwd: string, env: NodeJS.ProcessEnv, command: string, ...args: string[]): CommandEvidence {
  const argv = [process.execPath, "run", `pstack:${command}`, "--", ...args];
  const result = Bun.spawnSync(argv, { cwd, env, stdout: "pipe", stderr: "pipe" });
  return { argv, exit: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}
