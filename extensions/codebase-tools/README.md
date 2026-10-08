# codeBaseTools

Routes the agent's code exploration toward the codebase-memory-mcp graph and LSP, controlled by
`/codebase-tools`. The declaration is [`definition.ts`](definition.ts), its shared prompts are in
[`prompts.ts`](prompts.ts), and its OMP assembly is [`runtimes/omp.ts`](runtimes/omp.ts).

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
the declaration in [`definition.ts`](definition.ts), and the recorded green run
[`.scratch/codebase-tools-omp-v1/assets/12/codebase-tools-run1.txt`](../../.scratch/codebase-tools-omp-v1/assets/12/codebase-tools-run1.txt).
The ticket-12 evidence record itself lists H1 as human-led
([`assets/12/README.md`](../../.scratch/codebase-tools-omp-v1/assets/12/README.md) §5).

## H3a — cut over codebase-tools

Precondition: H1 passed. The two shared cutover steps (add the discovery root once, restart the agent
runtime) are in [H3 — permanent cutover and cutover smoke](../../framework/README.md#h3--permanent-cutover-and-cutover-smoke);
the codebase-tools-specific steps are:

1. Remove the superseded implementation: delete `my-omp-toolkit/extensions/codebase-tools` (repository
   `my-omp-toolkit` at revision `@34d7c40`). The parent discovery entry
   `E:/Developer/myhub/my-omp-toolkit/extensions` stays for the remaining unmigrated extensions.
2. Smoke once after the cutover: start the runtime normally (no `--no-extensions`) and run
   `/codebase-tools` on→off, confirming the marker and both notifications, and that exactly one
   `codebase-tools` implementation loads (no duplicate registration).
3. Roll back on failure: restore the deleted directory from the original git revision
   (`git -C ../my-omp-toolkit checkout 34d7c4061a74a73b478067882cba7956821f3c1d -- extensions/codebase-tools`),
   drop the added configuration entry if no other migrated extension still needs that root, and restart.
   Persistence compatibility was deliberately abandoned in both directions, so rollback does not read or
   migrate the new `{enabled}` data.
