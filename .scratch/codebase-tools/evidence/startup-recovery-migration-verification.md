# Historical development verification

Extracted from `extensions/codebase-tools/README.md`; these are historical observations, not current guarantees.

The recorded green run, for comparison against what you see: on the isolated exact
`@oh-my-pi/pi-coding-agent@18.5.0` install (win32 x64, Bun 1.4.2, a fresh temporary agent state per
run, `--no-extensions -e <this repository>/entrypoints/omp`) the codebase-tools suite ran
**24 pass / 0 fail across 7 files three times in a row**, the framework suite **78 pass / 0 fail**,
the harness suite **9 pass / 0 fail**, the full run **111 pass / 0 fail across 19 files**, and
`bun run typecheck` reported no diagnostics. That record is historical migration evidence, and it
covers the automatic suites only: the same record lists H1 (this round) as human-led, so the
equivalent UI frames above must not be read as the visual acceptance.

