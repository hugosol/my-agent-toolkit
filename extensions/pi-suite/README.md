# pi-suite

Pi-only fixed extension: [`entrypoints/pi/pi-suite.ts`](../../entrypoints/pi/pi-suite.ts).
It is a native integration, not a framework-mediated capability or a second MCP manager.
Deploy the entrypoint with this repository's source tree, as with the other toolkit entries.
Pi supplies the public `@earendil-works/pi-coding-agent` runtime import; toolkit does not
bundle or install another copy of the harness.

## Factory-time configuration channel

The launcher passes **`--pi-suite-config /absolute/path/suite.json`** as a public string flag.
The factory registers that flag and reads the UTF-8 JSON file on each factory invocation,
not at module import or session_start. Pi 1.5 binds parsed extension flag values only after
factories load; this entry seeds its registered default from the public launch argv and
then reads `getFlag`, so native MCP registration still occurs during factory loading.
The former environment-variable channel is not consumed: an existing Herdr pane does not
inherit the backend process environment.
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

If no Suite is selected, **omit the flag** (do not point at an empty or old
file). Apart from registering its inert flag, the factory returns without registering servers, tools, events, commands or changing
active tools. Native codemode and MCP configuration remain authoritative.

The launcher owns publication, lifecycle and removal of its config file. This channel carries
only Suite MCP declarations and mode; it is not an agent directory. Never change the native
agent directory for a Suite, copy authentication/model/history files, or write the resolved MCP
list into a project `mcp.json`. Child launches must explicitly retain or omit the flag
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
# The config flag reaches factories even in an existing Herdr pane.
pi --no-extensions -e builtin:mcp -e builtin:tool-search \
  -e /absolute/toolkit/entrypoints/pi/pi-suite.ts --pi-suite-config /absolute/path/suite.json
```

Preserve the deployment's other fixed and selected extension entries explicitly in that list.
`--no-extensions` here disables extension discovery, not MCP file sources; **do not add
`--no-mcp`**. This example does not prescribe skill filtering or other Suite assembly policy.

Without a Suite, retain native codemode (and its native activation policy) alongside the inert
fixed entry:

```sh
# --pi-suite-config is absent.
pi --no-extensions -e builtin:mcp -e builtin:codemode -e builtin:tool-search \
  -e /absolute/toolkit/entrypoints/pi/pi-suite.ts
```

## Extension-side regression

```sh
bun test tests/pi-suite
```

The regression loads the shipped entrypoint with an installed Pi CLI bundle under Bun. Set `PI_CLI` to select the bundle. The exercised combination is Pi 1.5.0, Windows x64 and Bun 1.4.4. Pi must export `createCodemodeExtension` and provide `registerMcpServer`. To reproduce the launch manually, use `bun <installed-pi-package>/dist/bundle/cli.js` in place of `pi` in the loading examples. For the Windows Node EOF caveat and scoped version policy, see [Pi acceptance versions](../../docs/agents/testing.md#pi-acceptance-versions). The Bun regression does not verify Node shutdown.

The test uses isolated native state, loopback model and MCP servers, and real file I/O. It checks both modes, `tools.read` in `only`, native `/mcp` status, empty and additive server lists, and rejection of invalid factory input. Noninteractive `/mcp` does not show the TUI source column. To check that native file configuration still works, the test calls an endpoint declared only in `mcp.json` and checks that the file is unchanged. Controlled MCP and provider responses verify extension behavior, not real model decisions, full Herdr acceptance or general Pi support.
