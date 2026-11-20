import { dirname, isAbsolute, parse } from "node:path";
import { build, check } from "./delivery";
import { errorMessage } from "./files";
import { loadManifest, render } from "./inputs";
import { compareUpstream, preview } from "./reports";

const root = dirname(import.meta.dir);
const effects: string[] = [];
const [command, ...rawArgs] = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

const help = `pstack resource maintenance (run from the toolkit root)

  bun run pstack:build                  Build from the pinned snapshot and named mappings.
  bun run pstack:check                  Check delivery bytes and ownership without writing.
  bun run pstack:preview                Show named local edits and reasons without writing.
  bun run pstack:upstream -- --local <absolute-directory>
                                        Compare listed sources to a local upstream baseline.
  bun run pstack:build -- --help         Show this help (-h also works on every command).

Examples:
  bun run pstack:preview
  bun run pstack:build
  bun run pstack:check
  bun run pstack:upstream -- --local "C:/src/cursor/plugins"
  bun run pstack:upstream -- --local "/home/me/src/cursor/plugins"

Exit codes:
  0  Success (or no differences for check and upstream).
  1  Check found delivery drift, or upstream found differences.
  2  Invalid invocation, input/mapping error, or filesystem failure.

Stop pstack sessions using this package before building; start new sessions afterward.
Build failures report completed file effects and can leave partial delivery. No
command fetches upstream or touches running sessions. See pstack-suite/README.md.
`;

function run(): number {
  if ((args.length === 1 && ["--help", "-h"].includes(args[0])) || command === "--help" || command === "-h") {
    console.log(help.trimEnd());
    return 0;
  }
  if (command === "upstream") {
    const [option, local] = args;
    if (args.length !== 2 || option !== "--local" || !isAbsolute(local) || parse(local).root.length < (process.platform === "win32" ? 3 : 1)) {
      throw new Error("Pass an absolute upstream directory: bun run pstack:upstream -- --local <absolute-directory>");
    }
    return compareUpstream(root, local, loadManifest(root)) ? 1 : 0;
  }

  if (command !== "build" && command !== "check" && command !== "preview") throw new Error(`Unknown command ${command}; use --help`);
  if (args.length) throw new Error(`Unexpected arguments for ${command}; use --help`);
  const delivery = render(root, loadManifest(root).files);
  if (command === "check") {
    const differences = check(root, delivery);
    if (differences.length) {
      console.error(differences.join("\n"));
      return 1;
    }
    console.log("Generated resources match the snapshot and mappings.");
  } else if (command === "preview") {
    preview(delivery);
  } else {
    build(root, delivery, effects);
    console.log(effects.length ? effects.join("\n") : "Generated resources already match.");
  }
  return 0;
}

try {
  process.exitCode = run();
} catch (error) {
  console.error(`pstack: ${errorMessage(error)}`);
  if (command === "build") console.error(effects.length ? `File effects before failure:\n${effects.join("\n")}` : "No files changed.");
  process.exitCode = 2;
}
