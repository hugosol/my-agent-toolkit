# Fresh-worktree findings (measurement notes)

## Confirmed observations

- Detached source at 6c75dc1, new worktree with no node_modules/.cache/runtime copied.
- Worktree creation: 1.1040374s; frozen install: 1.2492080s; typecheck/authoring: 3.4045661s; all exit 0. Typecheck reported 79 authoring files, 6 declarations, 0 diagnostics.
- Cold serial dock: 965.7982991s, exit 1; 166 pass, 7 fail, 0 skipped, 173 reported testcase identities, 48 files.
- Six model-cost-modes host readiness failures consume 541.435s of that serial dock; each waits the 90-second readiness deadline with no frames/stderr/session files and the process still running when diagnostics are captured.
- The other cold failure is activity-facts' initial hook at 5.001s. Source `tests/harness-dock/activity-facts.test.ts:78-82` invokes cold `ensureIsolatedHarness` in a beforeAll without an explicit timeout; default Bun deadline is 5s. The install implementation (`baseline.ts:284-343`) spawns bun install and stages/renames a host prefix. In subsequent full runs the three real activity scenarios pass. This is strong cold-preparation boundary evidence; the installation itself was not separately profiled and the hook failure must not be hidden by extending its deadline.
- Cold hook failure changes reported identities: an unnamed failure substitutes for three activity scenarios. Full dock subset contains 175 cases versus cold 173; this is not a changed test selection or intentional exclusion.
- Full run 1: 619.1710761s, exit 1; 1809 pass, 6 fail, 0 skip, 1815 cases, 229 files. Model-cost-modes file: 542.589s.
- Full run 2: 618.1610077s, exit 1; same 1815 identities and same six readiness failures; same assertion total 12043. Model-cost-modes file: 541.585s.
- First workflow sum through first full result: 1590.7271867s (26m30.7s), including required serial dock preparation. This is time to a failed result, not time to a green gate; excludes human/analysis gaps between commands. The direct install+typecheck+full-1 sum excludes required cold preparation and must not be presented as the complete cold workflow.

## Third run and focused diagnostics

- Full run 3: 364.7612214s, exit 1; 1811 pass, 4 fail, 0 skip, same 1815 identities and 229 files, 12081 assertions. Model-cost-modes file now takes 288.232s: its first three host scenarios still hit 90-second readiness timeout, while the last three run and pass. An additional `tests/integrations/cli.test.ts` case (`model-cost pi uses its selected assembly output rather than the generic optional factory`) hits the default 5-second test deadline (5.030006s).
- Full-run median: 618.1610077s; range: 364.7612214–619.1710761s. Because failures differ, this is a description of failed runs, not healthy-suite performance or a demonstrated improvement.
- Same first failed mode scenario, run alone after all full runs: 4.454822s, exit 0; one executed case passes, seven cases excluded by the explicit name filter and reported skipped. This is a diagnostic selection, not a full-gate measurement.
- Full integration CLI file alone: 11.9334183s, six pass, zero skipped, 32 assertions.
- Full activity-facts file alone after cache preparation: 8.3325839s, three pass, zero skipped, 25 assertions.
- Entire model-cost-modes file alone: 32.3829848s, eight pass, zero skipped, 71 assertions. This preserves all cases in the file, but differs from the full gate in load, ordering, and cache history; it is NOT an optimized replacement gate or a before/after speedup.
- Thus the observed startup problem is intermittent/history-sensitive. Neither purely 12-worker saturation nor a deterministic missing dependency is established. Cold serial failure rules out a concurrency-only explanation, but later passing runs do not rule out lazy cache/download effects. No CPU/I/O/load profiler or controlled cache-ablation experiment was run.
- Final worktree status: only tracked change is test-generated `framework/docs/pi-acceptance.json`; three untracked native acceptance evidence files. Original checkout still only contains this investigation's untracked `.scratch/test-optimize/` evidence. No tests, fixtures, dependencies, or product source were edited.
- Final process snapshot found no remaining command line naming this worktree or benchmark driver. This is a bounded cleanup observation, not proof against renamed/detached descendants. Node v24.18.0; Bun 1.4.4.

## Ranked candidates, not implemented

1. Diagnose/repair model-cost-modes real-host startup setup first. Repeated serial/parallel failures establish this is not merely an initial download or 12-worker capacity symptom. `model-cost-modes.test.ts:47-54` copies source into OS temp with no yaml dependency materialization; `framework/core/config.ts:28` imports yaml. Other passing fixture patterns either explicitly copy yaml (`workflow-chat/support/manager-dock.ts:35`) or put deployment below repository node_modules ancestry (`consumer-regression.test.ts:100-107`). Missing dependency availability is an evidence-backed hypothesis, not yet a proven cause of the host readiness hang. Keep actual models, real host, isolated home/storage, display/persistence/assertion scenarios.
2. Separate immutable host provisioning from the behavior-test hook/default deadline. Existing install helpers can stage/validate baseline and patch artifacts. A dedicated preparation stage may avoid the cold hook failure and repeated full serial behavior execution solely to warm prefixes; retain exact version/hash/native checks and complete canonical tests. No time saving is measured yet, and helper count/prefix completeness needs an explicit inventory before implementation. Do not solve by adding retries, relaxing deadlines, or dropping the serial policy without replacing its preparation guarantees.
3. After a healthy baseline, investigate long-tail scheduling using Bun's existing per-file timings; keep bounded process isolation. Current file timing and total wall establish a dominant long file but do not record worker start/end timestamps; no exact critical-path saving can be asserted.
4. Keep real deadline scenarios unless their mechanism can be preserved. Full-1 measured HTTP built-in 30-second timeout at 30.003s; real backend offline window case 35.024s; file lock default 15-second budget case 15.080s. These are contract costs, not arbitrary sleeps. Consumer regression's refused-provider/retry case is 35.263s of its 46.139s file; do not replace real refusal/retry behavior with mock success.
5. Root dependency installation and typecheck are not current bottlenecks (combined 4.654s). The earlier ~0.2s pure-case fixture improvement remains low priority relative to the startup failure.

## Preservation map

| Commitment/source | Required premise and detectable fault | Candidate boundary |
| --- | --- | --- |
| Mode/display/accounting scenarios, model-cost-modes.test.ts | Real OMP session executes selected model, actual captured requests/widgets/persistence; catches hidden unwanted widgets, wrong budgets/currency/accounting across switches | Repair deployment/startup prerequisite only; retain all six model scenarios and assertions, actual host and independent per-case storage |
| Activity/Round lifecycle, activity-facts.test.ts | Cold-ready verified host then actual tool continuation, next prompt and switch observations | Move artifact provisioning outside behavior hook; still run all three cases and baseline/hash verification |
| Artifact identity, baseline.ts and host-patch-artifact.ts | Exact host version and frozen patch/source hashes; detects stale/wrong artifacts | Any reusable immutable cache must validate complete identity and publish atomically; no mutable session/config/storage sharing |
| Default HTTP/lock/offline timing | Real platform cancellation, real lock contention or backend lifecycle with observer | Keep mechanisms and deadlines; do not replace with fake clocks merely to shorten wall time |

No implementation, permanent test edits, concurrency tuning, or claimed speedup in this pass.
