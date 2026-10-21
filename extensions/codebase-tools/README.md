# codeBaseTools

Routes the agent's code exploration toward the codebase-memory-mcp graph and LSP, controlled by
`/codebase-tools`. The declaration is [`definition.ts`](definition.ts), its shared prompts are
under [`shared-logic/`](shared-logic). Its thin assemblies are [`harnesses/omp.ts`](harnesses/omp.ts) and
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
two marker lines).

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

```bash
# from the repository root; <state> is a throwaway directory, e.g. .cache/tui-accept/agent-state
PI_CODING_AGENT_DIR=<state> bun \
  .cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts \
  --no-extensions -e entrypoints/omp --model <provider>/<model>
```

Accept only when all of these hold in the real TUI:

1. a clean session starts default-off: no marker, nothing contributed;
2. `/codebase-tools` → notification `codeBaseTools enabled` and the marker `◈ codeBaseTools` appears;
3. the marker is republished on every enabled turn (run two turns and watch it settle again);
4. `/codebase-tools` again → notification `codeBaseTools disabled` and the marker is cleared.

Compare the visuals against the automatic equivalents — same strings, observed as RPC/UI frames
rather than rendered output: notify frames in
[`tests/codebase-tools/command-toggle.test.ts`](../../tests/codebase-tools/command-toggle.test.ts), the
marker area (`semantic-extensions`, above the editor, text `◈ codeBaseTools`) in
[`tests/codebase-tools/marker-lifecycle.test.ts`](../../tests/codebase-tools/marker-lifecycle.test.ts),
the startup-mode frames in
[`tests/codebase-tools/startup-modes-dock.test.ts`](../../tests/codebase-tools/startup-modes-dock.test.ts),
the declaration in [`definition.ts`](definition.ts), and the migration's recorded green run below.

## H1b — automatic startup mode interactive acceptance (visual)

Same isolated state directory and exact harness install as H1; the only change is the entrypoint:

```bash
# from the repository root; <state> is a throwaway directory, e.g. .cache/tui-accept/agent-state-auto
PI_CODING_AGENT_DIR=<state> bun \
  .cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts \
  --no-extensions -e entrypoints/omp-auto/codebase-tools.ts --model <provider>/<model>
```

Accept only when all of these hold in the real TUI:

1. a clean session starts **enabled with no command typed**: the marker `◈ codeBaseTools` is on the
   framework's area from the session's start, and the first turn's request carries the init prompt;
2. no `codeBaseTools enabled` notification appears: startup is not a command and announces nothing;
3. `/codebase-tools` → notification `codeBaseTools disabled` and the marker is cleared; the next turn
   adds no new contribution;
4. `/codebase-tools` again → notification `codeBaseTools enabled`, the marker returns, and the next turn
   contributes again (the reminder, not a second init);
5. start a new session in the same TUI (`/new`): it starts **off** (no marker, no contribution) until its
   own `/codebase-tools` — the startup choice applies once per process;
6. restart the harness with `--resume <the enabled session file>`: the marker is on from the session's
   start, the first turn contributes, and the session file gains no second startup record.

The automated face of every point above is asserted in
[`tests/codebase-tools/startup-modes-dock.test.ts`](../../tests/codebase-tools/startup-modes-dock.test.ts)
on the real OMP harness and in
`bun scripts/pi-codebase-tools-smoke.ts --mode auto` on the real pi CLI; the visual check confirms only
what a rendered terminal shows.

## H1c — startup recovery interactive acceptance (P9, human-led marker display)

The recovery rule is automated at both seams — see the dock suite and both pi smoke modes below —
but whether the marker *renders* on the restored session's start is a terminal observation. Use a
throwaway state and session directory; never the formal configuration or a running session.

Prepare one state set for both hosts and keep the state directory out of the formal location:

```bash
ACCEPT_ROOT=.cache/startup-recovery-accept   # any throwaway directory
mkdir -p "$ACCEPT_ROOT/agent-state" "$ACCEPT_ROOT/sessions" "$ACCEPT_ROOT/work"
```

**Scenario A — a recorded true restored under the opposite (manual) default.** Seed an enabled
session with the automatic entrypoint, exit, then resume it with the manual entrypoint:

```bash
# 1. seed: automatic entrypoint, type one prompt, confirm the marker appears, then exit
PI_CODING_AGENT_DIR="$PWD/$ACCEPT_ROOT/agent-state" bun \
  .cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts \
  --no-extensions -e entrypoints/omp-auto/codebase-tools.ts \
  --session-dir "$PWD/$ACCEPT_ROOT/sessions" --cwd "$PWD/$ACCEPT_ROOT/work" \
  --model <provider>/<model>

# 2. restore: manual entrypoint, resuming the session file the seed saved
SESSION_FILE=$(ls -t "$PWD/$ACCEPT_ROOT/sessions"/*.jsonl | head -1)
PI_CODING_AGENT_DIR="$PWD/$ACCEPT_ROOT/agent-state" bun \
  .cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts \
  --no-extensions -e entrypoints/omp/codebase-tools.ts \
  --session-dir "$PWD/$ACCEPT_ROOT/sessions" --resume "$SESSION_FILE"
```

Capture the second terminal right after the resume: the marker `◈ codeBaseTools` must already be
on the framework's area before you type anything, no `codeBaseTools enabled` notification may
appear, and the first turn must carry the extension's contribution even though the manual policy
states `false`. A recording of both launches, or screenshots of the restored area before the first
turn and after it, is the evidence for the ticket.

**Scenario B — a recorded false restored under the enabling automatic default.** Seed with the
automatic entrypoint, type `/codebase-tools` (the marker clears), exit, and resume with the
automatic entrypoint. The restored terminal must show **no** marker at its start and its first turn
must add no contribution; `/codebase-tools` then announces `codeBaseTools enabled` and the marker
returns.

**Scenario C — no record at a startup resume uses the automatic default.** Seed with the manual
entrypoint (a turn with no marker, no state entry), exit, then resume the file with the automatic
entrypoint. The restored terminal must show the marker from its start and the first turn must carry
the init prompt.

On pi the same three scenarios use the pi entrypoints and pi's session storage:

```bash
PI_CODING_AGENT_DIR="$PWD/$ACCEPT_ROOT/agent-state" \
  pi --no-extensions -e entrypoints/pi-auto/codebase-tools.ts \
  --session-dir "$PWD/$ACCEPT_ROOT/sessions" --model <provider>/<model>
PI_CODING_AGENT_DIR="$PWD/$ACCEPT_ROOT/agent-state" \
  pi --no-extensions -e entrypoints/pi/codebase-tools.ts \
  --session-dir "$PWD/$ACCEPT_ROOT/sessions" --session "$SESSION_FILE"
```

The automated face of every step is
[`tests/codebase-tools/startup-recovery-dock.test.ts`](../../tests/codebase-tools/startup-recovery-dock.test.ts)
on the real OMP harness, and the recovery phases of
`bun scripts/pi-codebase-tools-smoke.ts --mode manual` / `--mode auto` on the real pi CLI. Both
assert the captured request, the session-entry payloads and the adapter's `setWidget` frames; only
the rendered terminal marker is left to this check.

The recorded green run, for comparison against what you see: on the isolated exact
`@oh-my-pi/pi-coding-agent@18.5.0` install (win32 x64, Bun 1.4.2, a fresh temporary agent state per
run, `--no-extensions -e <this repository>/entrypoints/omp`) the codebase-tools suite ran
**24 pass / 0 fail across 7 files three times in a row**, the framework suite **78 pass / 0 fail**,
the harness suite **9 pass / 0 fail**, the full run **111 pass / 0 fail across 19 files**, and
`bun run typecheck` reported no diagnostics. That record is historical migration evidence, and it
covers the automatic suites only: the same record lists H1 (this round) as human-led, so the
equivalent UI frames above must not be read as the visual acceptance.

## H3a — cut over codebase-tools

Precondition: H1 passed. The two shared cutover steps (add the discovery root once, restart the agent
harness) are in [H3 — permanent cutover and cutover smoke](../../framework/README.md#h3--permanent-cutover-and-cutover-smoke);
the codebase-tools-specific steps are:

1. Remove the superseded implementation: delete `my-omp-toolkit/extensions/codebase-tools` (repository
   `my-omp-toolkit` at revision `@34d7c40`). The parent discovery entry
   `E:/Developer/myhub/my-omp-toolkit/extensions` stays for the remaining unmigrated extensions.
2. Smoke once after the cutover: start the harness normally (no `--no-extensions`) and run
   `/codebase-tools` on→off, confirming the marker and both notifications, and that exactly one
   `codebase-tools` implementation loads (no duplicate registration).
3. Roll back on failure: restore the deleted directory from the original git revision
   (`git -C ../my-omp-toolkit checkout 34d7c4061a74a73b478067882cba7956821f3c1d -- extensions/codebase-tools`),
   drop the added configuration entry if no other migrated extension still needs that root, and restart.
   Persistence compatibility was deliberately abandoned in both directions, so rollback does not read or
   migrate the new `{enabled}` data.
