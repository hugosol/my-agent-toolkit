# connect-bot — historical execution records extracted from README

These are historical observations, not current test results or a completed human acceptance claim. The permanent README retains operator instructions, support limitations and acceptance requirements.

## Pi entrypoint observation

Original location: `extensions/connect-bot/README.md`, Startup modes.

**Pi verification limit:** basic entrypoint/registration scenarios were observed, but full lifecycle
parity is not established. On the exercised Pi 1.4.0 RPC path, `new_session` triggered a new
automatic registration rather than preserving the process-first-start-only policy described below;
closing RPC stdin while armed did not produce an unregister within the observation window.
These are known runtime gaps, not a complete lifecycle acceptance. Use `/connect-bot off` before
closing that path. Exact evidence and limitations live in the
[Pi connect-bot record](../../../framework/docs/harness-support.md#pi-connect-bot-entrypoint-evidence).

## Migration release gate

Original location: `extensions/connect-bot/README.md`, H3b.

Its record must name the frozen source baseline
(`my-omp-toolkit` `master@34d7c40`, extension commit `d3648a0`), the runtime
(`@oh-my-pi/pi-coding-agent@18.5.0` + `bun --version` + the lockfiles), the panel revision
(`omp-bot@d50e35c`), the `config.yaml` content, the executor and the date; the automated
precondition is the recorded release gate — `bun test` 367 pass / 0 fail across 42 files and a clean
`tsc --noEmit` on those baselines (recorded 2026-10-07).
