# codeBaseTools

Routes the agent's code exploration toward the codebase-memory-mcp graph and LSP, controlled by
`/codebase-tools`. The declaration is [`definition.ts`](definition.ts), its shared prompts are
under [`shared-logic/prompts/`](shared-logic/prompts), including its text-loading entry `index.ts`. Its thin assemblies are [`harnesses/omp.ts`](harnesses/omp.ts) and
[`harnesses/pi.ts`](harnesses/pi.ts) for manual mode, and [`harnesses/omp-auto.ts`](harnesses/omp-auto.ts)
and [`harnesses/pi-auto.ts`](harnesses/pi-auto.ts) for automatic startup mode; all four consume the same
unchanged definition and prompt resources through the shared assembly modules
([`omp-assembly.ts`](harnesses/omp-assembly.ts), [`pi-assembly.ts`](harnesses/pi-assembly.ts)).

## Startup modes

The extension has two startup modes. The mode is chosen by the entrypoint the host loads — the host's normal
`-e`/`--extension` parameter and nothing else — and both modes share the definition, the adapter assembly and
every behavior. The only difference is the startup policy document each entrypoint selects
([`entrypoints/startup/manual.yaml`](../../entrypoints/startup/manual.yaml) and
[`entrypoints/startup/auto.yaml`](../../entrypoints/startup/auto.yaml)):

| Mode | pi entrypoint | OMP entrypoint | A session with no history starts |
| --- | --- | --- | --- |
| Manual (existing) | `entrypoints/pi/codebase-tools.ts` | `entrypoints/omp/codebase-tools.ts` | off; `/codebase-tools` enables it |
| Automatic startup | `entrypoints/pi-auto/codebase-tools.ts` | `entrypoints/omp-auto/codebase-tools.ts` | on, before the first model request is planned |

```bash
# pi — manual mode (the original invocation)
pi --no-extensions -e <repository>/entrypoints/pi/codebase-tools.ts

# pi — automatic startup mode
pi --no-extensions -e <repository>/entrypoints/pi-auto/codebase-tools.ts

# OMP — manual mode (the original invocation; the discovery root holds only manual entrypoints)
omp --no-extensions -e <repository>/entrypoints/omp --model <provider>/<model>

# OMP — automatic startup mode
omp --no-extensions -e <repository>/entrypoints/omp-auto/codebase-tools.ts --model <provider>/<model>
```

Load one mode's entrypoint for this extension, never both: the host adds extension sources rather than
merging them, so both modes in one process would bind the extension twice (two State stores, two commands,
two marker lines). There is no duplicate-name detection, automatic merge or misuse warning behind that rule —
the load source is the only place the choice exists. The choice is per extension: a mixed session names
each extension's chosen entrypoint file, while a discovery directory contributes only the modes it contains
(`entrypoints/omp` is manual-only, `entrypoints/omp-auto` is automatic-only). The selected policy document
is read once at binding, so an edit takes effect with the next process, not the running session.

These instructions cover codebase-tools' existing pi and OMP combinations. They do not add another host
or change the support record.

What the automatic mode does, and does not do:

- It applies its choice at the process's **first main session start**, synchronously, so the first model
  request already carries the init prompt; it records the enabling value in the existing session-entry format,
  so a later process — in either mode — restores it.
- **A session restored at startup is the process's first start.** The record in its branch is the history:
  `{enabled: true}` and `{enabled: false}` both win over the selected mode's opposite default. Only a branch
  with no recorded value takes the mode's default, which is why a session that never recorded a value starts
  on when an independent automatic-startup process resumes it, and why a recorded off value stays off.
- Because the record belongs to the session rather than to the mode, a session the automatic entrypoint
  enabled opens enabled under the manual entrypoint too; the restore writes no second record.
- It is a target, not a command. It never types `/codebase-tools`, and it does not run the toggle's
  notification; the marker line is on the area from the session's own start.
- It applies once per process. A new, resumed or forked session **after** startup follows the ordinary
  session rules — no entry default, no record — and `/codebase-tools` after startup is the same toggle it
  always was. A navigation that keeps the same owner (a same-file resume or reload) is not a boundary at all.
- Startup does not reset prompt-injection progress, rewrite history, or change subagent `follow` behavior.
  A restored enabled session continues with the reminder when its branch already carries the init.

The full behavior is specified in
[extension startup modes and the startup policy](../../framework/docs/framework-capabilities.md#extension-startup-modes-and-the-startup-policy).

## pi adapter

Load only the pi entrypoint, not the implementation directories:

```bash
pi --no-extensions -e <repository>/entrypoints/pi/codebase-tools.ts
```

`/codebase-tools` uses the existing framework toggle and injection rules. The pi adapter returns a
hidden custom message at run initiation; pi appends it after the user's input, retains it in the
message list and writes it to session history. Later requests retain earlier contributions; disabling
stops new contributions and does not remove old messages. Existing history is preserved, not a promise
of provider cache hits. MCP/LSP tool availability remains the user's pi environment's responsibility.

Subagent integration is the framework's, and this extension's activation reaches its subagents: the
declaration opts in with `inheritance: "follow"`, and each mode's pi assembly states the entry a subagent
provider loads into the sessions it spawns — the mode's own entrypoint
(`entrypoints/pi/codebase-tools.ts` or `entrypoints/pi-auto/codebase-tools.ts`) — which is what makes a
spawned session follow the owning session's current activation value instead of reading the declared
default. Where the session runs in another process, the value is read through the framework's local
access ([framework capabilities](../../framework/docs/framework-capabilities.md#local-access-adapter-facing)):
the owning session's process publishes it, the spawned session's process reads it, and while that
access is not reached the spawned session keeps working on the declared default. The loading itself
belongs to the pinned provider, not to this assembly. Startup policy is a main-session rule: a spawned
session is not its own owner, so loading the automatic entrypoint there neither enables it nor registers
anything else; it follows the owner it was spawned under instead. The same rule in both modes is
asserted in [`tests/codebase-tools/startup-modes-follow.test.ts`](../../tests/codebase-tools/startup-modes-follow.test.ts),
where the owner's command is the only thing that changes the value the subagent's runs read.

The repeatable isolated check is `bun scripts/pi-codebase-tools-smoke.ts`; `--pi <CLI path>` or `PI_CLI`
selects the installed pi, `PI_NODE` selects the Node executable for a script/shim installation, and
`--mode auto` drives the automatic entrypoint (manual is the default). Its follow phase loads the pinned
`pi-subagents` provider beside the mode entrypoint: the provider spawns a real detached child for one
delegation under each Owner value, and the check reads that child's own outbound request, session journal
and provider launch record — the launch record names the mode's own entrypoint, the child carries the
extension's contribution only while the owner is enabled, and it records no State of its own. The two
children straddle a command that changes the owner between them, so the phase observes the current value
rather than a startup default. `--follow-only` runs just that phase; `--keep` keeps the run roots. It
uses temporary state (including the provider's own temporary root, redirected under the run root), dummy
credentials and a local capture server, never the formal configuration. Use Node 22.19.0 via `PI_NODE`:
the longer phase on Node 24.18.0 still hits the Windows/libuv `UV_HANDLE_CLOSING` assertion recorded in
the framework's [pi support evidence](../../framework/docs/harness-support.md#pi-codebase-tools-adapter-evidence),
which also states the exercised host version and the remaining limitations.

## H1 — interactive TUI acceptance (visual)

Run each host with its own temporary agent state, session and working directories. Do not use your normal configuration or a running session. From the repository root, set up both launch commands. If you set `OMP_CLI`, use an absolute path. Authenticate a model in each isolated agent directory before making requests.

```bash
REPO="$PWD"
ACCEPT_ROOT=$(mktemp -d)
mkdir -p "$ACCEPT_ROOT"/{omp,pi}/{agent-state,sessions,work}

omp_run() (
	cd "$ACCEPT_ROOT/omp/work" || exit
	PI_CODING_AGENT_DIR="$ACCEPT_ROOT/omp/agent-state" "${OMP_CLI:-omp}" \
		--no-extensions -e "$REPO/entrypoints/$1/codebase-tools.ts" \
		--session-dir "$ACCEPT_ROOT/omp/sessions" "${@:2}"
)
pi_run() (
	cd "$ACCEPT_ROOT/pi/work" || exit
	PI_CODING_AGENT_DIR="$ACCEPT_ROOT/pi/agent-state" pi \
		--no-extensions -e "$REPO/entrypoints/$1/codebase-tools.ts" \
		--session-dir "$ACCEPT_ROOT/pi/sessions" "${@:2}"
)

omp_run omp --model '<provider>/<model>'
pi_run pi --model '<provider>/<model>'
```

### Startup and toggle

1. Start a fresh process with the manual entrypoint. Check that the marker is absent and the first turn adds no contribution. Run `/codebase-tools` and check for `codeBaseTools enabled` and the `◈ codeBaseTools` marker above the editor. Run two turns and check that the marker remains visible. Toggle off and check for `codeBaseTools disabled` and no marker.
2. Start a fresh process with `omp_run omp-auto` or `pi_run pi-auto`, passing the same model selection. Check that the marker appears without an enabled notice and the first request carries the init prompt. Toggle off and verify the next turn adds nothing. Toggle on and check that the next turn adds the reminder, not a second init.
3. Use `/new` in that process. Check that this session starts off until you enable it with `/codebase-tools`.

### Resume from a fresh process

For each host, seed one session per row below. Send a turn so the host writes the session, then exit. Select the JSONL that the seed process wrote under its host’s session directory. Use `find "$ACCEPT_ROOT/pi/sessions" -type f -name '*.jsonl' -print` to include Pi subdirectories. Repeat the selection for each case; do not reuse an OMP session file in Pi.

| Session record | Seed | Resume entrypoint | Expected |
| --- | --- | --- | --- |
| `{enabled: true}` | Automatic; leave enabled | Manual | Marker is visible before the first input. No enabled notice. First turn contributes the reminder. |
| `{enabled: false}` | Automatic; toggle off before the turn | Automatic | No marker or new contribution. `/codebase-tools` can still enable the session. |
| No record | Manual; never toggle | Automatic | Marker is visible at startup without an enabled notice. First turn contributes the init prompt. |

Use `--resume` for OMP and `--session` for Pi. For the first case, set `OMP_SESSION_FILE` and `PI_SESSION_FILE` to their respective absolute paths, then run:

```bash
omp_run omp --resume "$OMP_SESSION_FILE"
pi_run pi --session "$PI_SESSION_FILE"
```

Use `omp-auto` and `pi-auto` for the other two cases. Restoring an existing record must not append a second startup record. Only a branch without a record takes the automatic default.

The OMP [startup dock](../../tests/codebase-tools/startup-modes-dock.test.ts) and [recovery dock](../../tests/codebase-tools/startup-recovery-dock.test.ts) check contribution, state records and marker frames. On Pi, run `bun scripts/pi-codebase-tools-smoke.ts --mode manual` and `bun scripts/pi-codebase-tools-smoke.ts --mode auto`. Frames are not a substitute for observing the rendered marker.

## H3a — cut over codebase-tools

After H1 passes on the isolated installation, follow the load-source and restart rules in [H3](../../framework/README.md#h3--permanent-cutover-and-cutover-smoke).

1. Save the previous implementation and load configuration. Stop discovering the old `codebase-tools` and configure exactly one new entrypoint. Keep any discovery source that other extensions still need, but exclude the old implementation from it.
2. Restart normally. Run `/codebase-tools` on and off, check both notifications and the marker, and confirm that only one implementation loaded.
3. To roll back, restore the previous implementation and its configuration, remove the replacement from the load set, and restart. Do not copy or translate the replacement's State records into the old implementation.
