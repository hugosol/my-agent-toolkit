import { dirname, isAbsolute, parse } from "node:path";
import { build, check } from "./delivery";
import { errorMessage, readFile, writeFile } from "./files";
import { loadManifest, render } from "./inputs";
import { bindingsPath, confirmedBindings, modelLedger, modelResources, savedBindings } from "./models";
import { compareUpstream } from "./reports";
import { updateUpstream } from "./upstream-update";
import { writeMappingHtml } from "./mapping-html";

const root = dirname(import.meta.dir);
const effects: string[] = [];
const [command, ...rawArgs] = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

const help = `pstack resource maintenance (run from the toolkit root)

  bun run pstack:setup -- --confirm <proposal.json> --catalog <omp-models.json>
                                        Save confirmed Suite bindings and generate native personas.
  bun run pstack:setup -- --cancel      Leave settings and generated resources unchanged.
  bun run pstack:build                  Build resources, saved Suite personas and mapping.html.
  bun run pstack:check                  Check delivery bytes and ownership without writing.
  bun run pstack:update -- --local <absolute-directory>
                                        Copy listed sources from local Git HEAD and record its version.
  bun run pstack:upstream -- --local <absolute-directory>
                                        Compare listed sources to a local upstream baseline.
  bun run pstack:build -- --help         Show this help (-h also works on every command).

Examples:
  bun run pstack:update -- --local "C:/src/cursor/plugins"
  bun run pstack:build
  bun run pstack:check
  bun run pstack:upstream -- --local "C:/src/cursor/plugins"
  bun run pstack:upstream -- --local "/home/me/src/cursor/plugins"

Exit codes:
  0  Success (or no differences for check and upstream).
  1  Check found delivery drift, or upstream found differences.
  2  Invalid invocation, input/mapping error, or filesystem failure.

Stop pstack sessions using this package before building or confirming setup; start new sessions afterward.
Publication failures report completed file effects and can leave partial delivery. No
command fetches upstream or touches running sessions. See pstack-suite/README.md.
`;

function run(): number {
  if ((args.length === 1 && ["--help", "-h"].includes(args[0])) || command === "--help" || command === "-h") {
    console.log(help.trimEnd());
    return 0;
  }
  if (command === "upstream" || command === "update") {
    const [option, local] = args;
    if (args.length !== 2 || option !== "--local" || !isAbsolute(local) || parse(local).root.length < (process.platform === "win32" ? 3 : 1)) {
      throw new Error(`Pass an absolute upstream directory: bun run pstack:${command} -- --local <absolute-directory>`);
    }
    const manifest = loadManifest(root);
    if (command === "upstream") return compareUpstream(root, local, manifest) ? 1 : 0;
    updateUpstream(root, local, manifest, effects);
    console.log(effects.length ? effects.join("\n") : "Snapshot already matches local Git HEAD.");
    console.log("Review mappings, then run pstack:build and pstack:check; update does not build delivery.");
    return 0;
  }

  if (command === "setup") {
    if (args.length === 1 && args[0] === "--cancel") {
      console.log("Setup cancelled; no files changed.");
      return 0;
    }
    const [decision, proposal, catalogOption, catalog] = args;
    if (args.length !== 4 || decision !== "--confirm" || catalogOption !== "--catalog") {
      throw new Error("Use --confirm <proposal.json> --catalog <omp-models.json>, or --cancel; nothing saved.");
    }
    const bindings = confirmedBindings(proposal, catalog);
    const delivery = modelResources(render(root, loadManifest(root).files), bindings);
    const bytes = Buffer.from(`${JSON.stringify({ confirmed: true, roles: bindings }, null, 2)}\n`);
    if (!readFile(root, bindingsPath)?.equals(bytes)) writeFile(root, bindingsPath, bytes, effects);
    build(root, delivery, effects, modelLedger);
    console.log(effects.length ? effects.join("\n") : "Model bindings already match.");
    console.log("Start a new pstack session to use these bindings.");
    return 0;
  }

  if (command !== "build" && command !== "check") throw new Error(`Unknown command ${command}; use --help`);
  if (args.length) throw new Error(`Unexpected arguments for ${command}; use --help`);
  const manifest = loadManifest(root);
  const delivery = render(root, manifest.files);
  const models = modelResources(delivery, savedBindings(root));
  if (command === "check") {
    const differences = [...check(root, delivery), ...check(root, models, modelLedger)];
    if (differences.length) {
      console.error(differences.join("\n"));
      return 1;
    }
    console.log("Generated resources match the snapshot and mappings.");
  } else {
    build(root, delivery, effects);
    build(root, models, effects, modelLedger);
    writeMappingHtml(root, manifest, delivery, effects);
    console.log(effects.length ? effects.join("\n") : "Generated resources already match.");
  }
  return 0;
}

try {
  process.exitCode = run();
} catch (error) {
  console.error(`pstack: ${errorMessage(error)}`);
  if (command === "build" || command === "setup" || command === "update") console.error(effects.length ? `File effects before failure:\n${effects.join("\n")}` : "No files changed.");
  process.exitCode = 2;
}
