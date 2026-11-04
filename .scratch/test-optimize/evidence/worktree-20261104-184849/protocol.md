# Fresh-worktree benchmark protocol

- User authorized creating a worktree and measuring build/test from scratch, then evaluating optimizations. No production/test/config optimization edits authorized or made.
- Source commit: 6c75dc1ed4c5fe98d006b409d2684cc084fccca3.
- Source checkout had only earlier untracked `.scratch/test-optimize/` evidence. It is not copied to the worktree.
- Detached worktree: `E:/Developer/myhub/my-agent-toolkit-test-bench-20261104-184849`.
- Bun 1.4.4, Windows x64. Original machine retains interactive agents and production services; these are not stopped or accessed by benchmark fixtures. Pre-run process inventory found no running Bun test command or compilation job (the existing cargo run is the already-running production backend launcher). No independent machine-wide exclusive load guarantee.
- New worktree initially has no `node_modules`, `.cache`, or `framework/.runtime`. No existing local caches are copied. Existing machine-level Bun downloads, OS filesystem cache, local Pi CLI and prebuilt sibling herdr safe-shell/fixture binaries are retained. This measures a fresh worktree on this developer machine, not a blank machine or a cold registry/network installation.
- `OMP_BASELINE_RECORD_ROOT` points to original checkout for read-only recorded sibling anchor/oracle resolution. Worktree is a sibling of original so backend paths also resolve without changing them. Install/host caches/test data/acceptance updates are worktree-owned.
- Run evidence is stored outside tested worktree under this directory, avoiding mutation of its untracked-source digest by the benchmark logger. Test-owned acceptance evidence remains at default locations inside worktree.
- Sequence: worktree add; `bun install --frozen-lockfile`; `bun run typecheck`; `bun run test:dock:serial` for required cold-prefix warm-up; then `bun run test` three times sequentially.
- Repository has no separate build script. Typecheck includes `tsc --noEmit` and `check:authoring`.
- Every test command retains original script selection and concurrency; appends JUnit and timing-output arguments. Each phase uses a new nonexistent `--timings` file plus `--update-timings`; no historical timing input is used to reorder later trials. No bail/retry/timeout relaxation/skip filters.
- Serial dock preparation is a separately reported diagnostic/preparation stage, not a replacement for canonical 12-worker full-suite runs. Its full time is included in the documented fresh-worktree path; comparison excludes it from warm full-test timings.
- First worktree-cold result is provisional (one cold trial); warm full selection is repeated to assess variation. Do not interpret the serial cold dock versus parallel full suite difference as cache savings.
- Preserve complete failure logs, expanded test identities and skip outcomes. Product/test failures are not fixed or expectations altered as part of timing. Any resulting acceptance record changes remain in detached worktree and are not propagated to original checkout.
