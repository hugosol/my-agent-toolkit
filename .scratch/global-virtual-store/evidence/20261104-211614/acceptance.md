# Bun global virtual store configuration acceptance

## Retained changes

- New root `bunfig.toml`: `[install]`, `linker = "isolated"`, `globalStore = true`.
- No committed machine-specific cache path. Default Bun user cache used; README documents `BUN_INSTALL_CACHE_DIR` override.
- README uses `bun install --frozen-lockfile` once per checkout/worktree, explains global-store sharing, local fallbacks, lifecycle/cleanup and temporary deployment boundaries.
- Seven existing YAML dependency materialization calls now use `cpSync(..., { recursive: true, dereference: true })`: tests/framework/local-access.test.ts, tests/framework/pi-subagent-provider-path.test.ts, tests/workflow-chat/pi-native.test.ts, and workflow-chat/support/{manager-dock,node-dock,prompt-dock,role-contract-dock}. This preserves actual package-content copying under linked install layouts, without requiring Windows symlink privileges or changing assertions.
- docs/agents/testing.md records dependency-content copying under shared layouts.
- No dependency version, package.json, lockfile, production module, timeout, test selection or runner scheduling changed. No permanent tests added. model-cost-modes remains untouched.

## Source and execution scope

Initial source status contained only prior `.scratch/test-optimize/` evidence. Runtime Bun 1.4.4. The existing detached worktree `E:/Developer/myhub/my-agent-toolkit-test-bench-20261104-184849` at 6c75dc1 was reused for full regression; its earlier native acceptance record/evidence changes were preserved. Config and all seven changed test/support files in the tested worktree match main by SHA-256. Documentation-only changes are in main, not copied to test worktree. Test-generated acceptance record changes stay in the validation worktree; logs are outside the tested tree to avoid changing its provenance digest mid-run. Existing host caches were already prepared and not rebuilt/re-pinned.

## Installation and real sharing proof

- Main `bun install --frozen-lockfile`: exit 0, 0.748728s.
- Validation worktree same command: exit 0, 0.210774s.
- SHA-256 of both bun.lock files remains the initial value; no lockfile update.
- realpath comparison for yaml, typescript, typescript-compiler, bun-types and pi-subagents shows identical global entry targets in both worktrees. See shared-layout.json.
- Example YAML target: `C:/Users/hugos/.bun/install/cache/links/yaml@2.9.1-7bda248e74259b8d/node_modules/yaml`.
- These timings are single observed installations, not a controlled performance benchmark or promised speedup.

## Verification

| Check | Outcome |
| --- | --- |
| Main `bun run typecheck`, before and after compatibility changes | exit 0; final 1.397534s; authoring 79 files, 6 declarations, 0 diagnostics |
| Main `bun run check:integrations` | exit 0, 5.282485s; actual CLI exercised |
| Temporary deployment smoke | Dereference-copy real installed YAML into owned OS-temp node_modules, assert destination is not a link and has different realpath, launch actual Bun child importing bare `yaml`, verify parsed `{enabled:true,budget:7}`, remove owned temp root; pass |
| Focused tests: framework/pi-subagent-provider-path, framework/local-access, workflow-chat/manager-status, connect-bot/harness-exit-budget | 39 pass / 0 fail / 0 skip, 179 assertions, exit 0, 7.411187s |
| Final canonical `bun run test` in validation worktree, with JUnit/timings outputs | 1809 pass / 6 fail / 0 skip; 1815 identities, 12043 assertions; exit 1; 609.585246s |

Full commands and external wall times are in summary.json. JUnit and raw logs are retained separately. Each timings file was new at invocation, so no historical timing-informed scheduling was introduced.

## Failures retained visibly

Initial full regression after enabling linked layout failed 60 cases: 59 were `EPERM ... symlink ... yaml` at existing cpSync materialization sites; these drove the seven compatibility changes. One additional ENOENT arose while copying a transient framework/.runtime owner-access staging file in harness-exit-budget; no unrelated fix was made, its focused run and final full run passed.

Final six failures are all in `tests/harness-dock/model-cost-modes.test.ts`: original 90000ms ready deadline. The six case identities and first-line error signatures exactly match the pre-change full-1 baseline under `.scratch/test-optimize/evidence/worktree-20261104-184849/`. All 1815 selected identities also match that baseline. This is not a green full suite; the previously diagnosed missing-dependency/implicit-install issue in that fixture was deliberately not fixed as part of this request. No new linked-copy errors remain in the final full run.

The first throwaway smoke attempt had an incorrectly escaped generated JavaScript string and failed with Unterminated string literal; it cleaned up its root. Corrected harness then exercised the real deployment path successfully. The failed attempt log is retained rather than misclassified as a product failure.

## Cleanup and limits

Final process snapshot found no commands referencing the validation worktree and no safe_shutdown_shell/herdr-fixture processes. Shared cache was not cleared, production services were not stopped, unrelated source changes were not removed. Validation worktree keeps the applied config/compatibility changes and its test-generated acceptance evidence for inspection.

Only current Windows/Bun platform exercised. No concurrent cold-install stress test, untrusted-user sharing, cache-pruning test or alternate dependency graph trial. Configuration is enabled and actual cross-worktree package sharing verified; full-repository green is not claimed.
