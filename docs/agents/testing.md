# Test tiers

Use the smallest relevant scope while iterating; broaden it at ticket completion and final integration. Explicit task acceptance requirements take precedence over these defaults. Tests supplement, rather than replace, exercising the changed behavior through its smoke or real-host observation seam.

## Select a tier

| Stage | Run | Completion evidence |
| --- | --- | --- |
| Iteration: implementation, debugging, or expectation changes | Affected test files (`bun test <test-file>`). Run `bun run typecheck` after TypeScript changes, including test/support code. | The affected behavior is observed; record failures before broadening the run. |
| Ticket completion | The owning test partition (`bun test <test-directory>`), plus affected consumers of changed shared APIs/behavior. For harness-facing changes, include the corresponding real-host dock files. Run `bun run typecheck` for TypeScript changes. | Each acceptance criterion has evidence or an explicit verification limit; focused green is not a claim of full-repository green. |
| Final integration: assembled changes or independent acceptance | `bun run typecheck` and `bun run test`, plus any smoke/candidate verification explicitly required by the task. | Record the commands, exit statuses, failures, and the source/environment state to which the results apply. |

Read `package.json` for existing script names. Use a direct test-directory command when a partition has no named script. Select consumers from the changed contract/callers, not just the directory being edited. If impact remains uncertain, broaden the scope. Documentation-only changes need link/example checks, not a default full test run.

## Keep runs attributable

1. Complete focused runs and any fault injection; restore injected changes before starting final regression.
2. Run expensive suites sequentially in a shared working tree. Agree on a quiet window with peers for real-host or full-repository runs. Inside one run, `bun run test:dock` uses four isolated Bun workers because every dock file owns its temporary state and capture directories; use `bun run test:dock:serial` to diagnose cross-file interference or when four real sessions exceed the machine's budget. This intra-run parallelism does not relax the quiet-window rule for multiple people or agents. Warm changed harness or patch prefixes with `bun run test:dock:serial` once before parallel runs, and treat repeated timing or cleanup failures under load as a signal to reduce or remove intra-run parallelism rather than as automatic product failures.
3. Keep tested source and fixtures unchanged until the run finishes. To continue editing, use an isolated snapshot that includes the changes under test. Treat results from a tree changed mid-run as non-final evidence.
4. Save long-run output to a run-specific log so truncated terminal output does not require another suite run just to recover failures or counts.

Reuse an earlier result only when the relevant source, fixtures, dependencies, and environment are unchanged; cite its scope and source state. Rerun after relevant changes, an unstable observation, or an explicit acceptance requirement—not just to reproduce a summary table.

When a failure matches a previously recorded one, compare the case, error signature, and applicable source/environment before citing it. Keep it visible in the result; investigate new or changed failures rather than classifying them by name alone.
