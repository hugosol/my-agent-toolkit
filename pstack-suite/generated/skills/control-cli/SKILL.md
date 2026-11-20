---
name: control-cli
description: Build or adapt a local harness to drive, inspect, and profile an interactive CLI or TUI without external services. Use for CLI UX checks, startup regressions, memory leaks, hangs, prompt flows, or terminal demos.
---

# Control CLI

Use a repeatable local harness to exercise an interactive CLI instead of poking at it manually. First reuse the repo's own test/demo harness if it exists; otherwise assemble a temporary harness from standard local tools.

## What It Is Used For

- Reproducing CLI/TUI bugs with deterministic input.
- Verifying keyboard flows, prompts, interrupts, resize behavior, and terminal layout.
- Capturing before/after transcripts for bug fixes.
- Profiling startup time, slow operations, hangs, or memory growth.
- Recording a short terminal demo when output is easier to show than explain.

## Harness Loop

1. Identify the command under test and the smallest reproducible workspace.
2. Discover existing local harnesses: package scripts, e2e tests, demo recorders, expect scripts, or PTY helpers.
3. If no harness exists, launch the CLI in an isolated terminal session with deterministic env vars.
4. Capture the current screen before interacting.
5. Send one action at a time: text, Enter, arrows, Escape, Ctrl-C, resize.
6. Wait for a concrete screen pattern or prompt before the next action.
7. Save the transcript and any profile artifacts.
8. Kill the session cleanly.

## Harness Options

- Repo-native harness: prefer checked-in scripts because they know the app's startup, env, and prompts.
- `tmux`: managed sessions, `capture-pane`, `send-keys`, attach/detach.
- PTY probe: use a short Python, Node, or Expect script when tmux is unavailable.
- Runtime inspector: use Node or Bun inspector for CPU profiles, heap snapshots, and live evaluation.
- Terminal recorder: use repo-local demo tools or asciinema-compatible tools when the user asks for a demo.

## Minimal terminal harness

On Windows use Bun 1.4.4 with its native pseudoterminal; `tmux` and Python `pty` are POSIX options, not Windows tools. Save the probe as `terminal.mjs` in an owned temporary workspace. Run `bun terminal.mjs <ready-text> <one-line-input> <executable> [args...]` there. Supply the actual executable (not a `.cmd` shim) and individual arguments. Pick a foreground command that exits after the input; for a long-lived session, use the repository harness and send its documented quit action.

Keep the raw stdout transcript and stderr (child PID, exit, and diagnostics). A missing prompt, deadline, or nonzero child exit fails the probe. Use the recorded output to check the effect of the input, not just its echo.

```javascript pstack-terminal
const [ready, input, executable, ...args] = process.argv.slice(2);
if (!ready || input === undefined || !executable) {
  throw new Error("Usage: bun terminal.mjs <ready-text> <one-line-input> <executable> [args...]");
}
const decoder = new TextDecoder();
let pending = "";
let sent = false;
let timedOut = false;
const child = Bun.spawn([executable, ...args], {
  terminal: {
    cols: 100, rows: 28,
    data(terminal, bytes) {
      process.stdout.write(bytes);
      const text = decoder.decode(bytes, { stream: true });
      if (sent) return;
      const seen = pending + text;
      if (seen.includes(ready)) {
        sent = true;
        terminal.write(input + "\r");
      } else pending = seen.slice(-ready.length);
    },
  },
});
const deadline = setTimeout(() => { timedOut = true; child.kill(); }, 15_000);
const exit = await child.exited;
clearTimeout(deadline);
child.terminal.close();
console.error(`terminal pid=${child.pid} exit=${exit}`);
if (timedOut) console.error("Terminal deadline expired");
else if (!sent) console.error(`Terminal exited before readiness: ${ready}`);
process.exitCode = timedOut || !sent ? 1 : exit;
```

For Node profiling on an owned target, pass `--inspect=127.0.0.1:0` as a Node argument and read the actual inspector URL from the transcript. Do not use another session’s inspector endpoint.

## Profiling Recipes

- Startup regression: capture baseline and treatment startup timings under the same machine, env, and command.
- Slow operation: start a CPU profile, perform the operation, stop the profile, and compare top self-time functions.
- Memory leak: force GC if available, take a heap snapshot, perform the operation repeatedly, force GC again, and take another snapshot.
- Hang: capture the screen, active handles/resources, and a stack/CPU sample before interrupting.

## Guardrails

- Prefer deterministic waits over sleeps. If you must sleep, explain why.
- Do not send credentials or destructive commands into a controlled session.
- Keep the harness in an owned temporary directory unless the repo already has a testing/demo harness.
- Do not hard-code paths from another repository. Adapt commands to the current repo's scripts and runtime.
- Clean up tmux sessions, temp dirs, inspector processes, and demo artifacts unless the user asks to keep them.
