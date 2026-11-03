# pi-suite

Pi-only fixed extension: [`entrypoints/pi/pi-suite.ts`](../../entrypoints/pi/pi-suite.ts).
It is a native integration, not a framework-mediated capability or a second MCP manager.
Deploy the entrypoint with this repository's source tree, as with the other toolkit entries.
Pi supplies the public `@earendil-works/pi-coding-agent` runtime import; toolkit does not
bundle or install another copy of the harness.

## Factory-time configuration channel

The launcher sets **`PI_SUITE_CONFIG` to an absolute UTF-8 JSON file path** before starting Pi.
The factory reads the file on each factory invocation, not at module import or session_start.
The document must already be completely published and readable, and remain available for
native reload. Relative paths and malformed/missing configuration fail extension loading;
they are not interpreted as an empty Suite. A selected Suite always states its mode explicitly:

```json
{
  "version": 1,
  "codemode": "only",
  "mcpServers": {
    "documents": {
      "url": "http://127.0.0.1:3000/mcp",
      "exposure": "codemode"
    }
  }
}
```

`codemode` is exactly `on` or `only`. `mcpServers` is a name-to-native-McpServerConfig object;
resolve centralized references before publishing it. Native `registerMcpServer` validates each
server and Pi retains its own file override, equivalent-server and disabled-server rules.
Use absolute command/cwd/resource paths in resolved native configurations: the document's
location does not rebase native MCP fields. An empty object adds no servers and does not
turn off the user's or trusted project's native MCP sources.

If no Suite is selected, **remove the environment variable** (do not point at an empty or old
file). The factory then returns without registering servers, tools, events, commands or changing
active tools. Native codemode and MCP configuration remain authoritative.

The launcher owns publication, lifecycle and removal of its config file. This channel carries
only Suite MCP declarations and mode; it is not an agent directory. Never change the native
agent directory for a Suite, copy authentication/model/history files, or write the resolved MCP
list into a project `mcp.json`. Child launches must explicitly retain or remove the variable
according to their selected Suite; it must not accidentally leak into an unrelated launch.

## Native loading and codemode ownership

Keep **`builtin:mcp`** loaded. pi-suite calls only public `registerMcpServer`; it neither
replaces the native config reader nor registers `/mcp`, connection handling or resource tools.
Connections, errors and management remain Pi's responsibility. Successful factory loading is
not a claim that every MCP connection is ready.

For a selected Suite, load pi-suite **instead of** builtin codemode. It invokes the public
`createCodemodeExtension({ mode })` once and activates `codemode` at session_start without
removing active underlying tools. In `only`, Pi filters model declarations while tools remain
callable through codemode. Do not load two codemode instances. The launcher's explicit extension
list is responsible for avoiding the builtin instance, not a runtime monkey patch. For example:

```sh
# PI_SUITE_CONFIG=/absolute/path/suite.json is set in the child environment.
pi --no-extensions -e builtin:mcp -e builtin:tool-search \
  -e /absolute/toolkit/entrypoints/pi/pi-suite.ts
```

Preserve the deployment's other fixed and selected extension entries explicitly in that list.
`--no-extensions` here disables extension discovery, not MCP file sources; **do not add
`--no-mcp`**. This example does not prescribe skill filtering or other Suite assembly policy.

Without a Suite, retain native codemode (and its native activation policy) alongside the inert
fixed entry:

```sh
# PI_SUITE_CONFIG is absent.
pi --no-extensions -e builtin:mcp -e builtin:codemode -e builtin:tool-search \
  -e /absolute/toolkit/entrypoints/pi/pi-suite.ts
```

## Extension-side regression

```sh
bun test tests/pi-suite
bun run typecheck
bun run check:integrations
bun run test
```

The regression resolves the installed Pi CLI (`PI_CLI` may name an installed bundle), runs its
actual public CLI bundle under the repository's required Bun runtime, and loads the shipped
entrypoint. The exercised combination is Pi **1.5.0**, Windows x64 and Bun **1.4.4**;
this does not promote a repository-wide harness support row. Pi must publicly export
`createCodemodeExtension` and provide `registerMcpServer`. With the same installed Pi bundle
under Windows Node **24.18.0**, the real file-call assertions succeeded, but normal EOF after
QuickJS use aborted in libuv (`UV_HANDLE_CLOSING`, exit 9). That Node shutdown path is not
verified clean and is not hidden by the Bun regression. To reproduce the exercised launch,
use `bun <installed-pi-package>/dist/bundle/cli.js` in place of `pi` in the commands above. It owns isolated native state, dynamic loopback model/MCP servers and file sentinels;
it continuously consumes process output and awaits process exit on success and failed startup.
It compares no-Suite native baselines, both mode overrides, real `tools.read` in `only`, empty
and additive MCP, native `/mcp` status, unchanged native configuration, and invalid factory input.
Only the test harness uses isolated agent directories; production never redirects one for Suite.

These are extension regressions, **not** the full Herdr S4 acceptance or a claim that
P19/P23/P24/P26/P27 are complete across repositories. MCP responses and model decisions are
controlled; Pi loading, codemode execution, native config consumption, transport and disk I/O
remain real. Native noninteractive `/mcp` reports state but not the TUI source column: source
preservation is checked by consuming an endpoint declared only in native `mcp.json` and leaving
that file byte-identical.
