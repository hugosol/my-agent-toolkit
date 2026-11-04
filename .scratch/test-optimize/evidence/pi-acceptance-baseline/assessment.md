# Test optimization assessment

## Source and protocol

- Initial HEAD: `6c75dc1ed4c5fe98d006b409d2684cc084fccca3`; initial `git status --short` empty.
- Windows x64; executing Bun 1.4.4 (38afee6c8), matching packageManager.
- No source, test, fixture, or runner changes made. Disposable evidence only.
- Canonical full workload: `bun run test` => `bun test --parallel=12`; serial diagnostic: `bun run test:serial`; dock partition parallelism: 4.
- Installed `bun test --help`: parallel uses worker processes and implies isolate; no-isolate retains worker globals/module registry. No recommendation to disable isolation.
- Safe measured workload: `bun test ./tests/pi-suite/pi-acceptance.test.ts --reporter=junit --reporter-outfile=.scratch/test-optimize/evidence/pi-acceptance-baseline/run-N.xml` for N=1,2,3, run sequentially as separate processes.
- File has 10 unconditional tests, no parameterized/generated/skipped/quarantined cases; exact ordered identities matched across all three JUnit reports. Other files excluded from measurement, not from the repository gate.
- Each test owns a fresh OS temporary Git repository; simulated CLI is executed with the running Bun. Record/evidence paths explicitly target that temporary root. Cleanup removes the owned root. Real git, subprocess, lock, and filesystem behavior preserved.
- No competing test command was observed in a process snapshot before measurements. Existing interactive OMP and production backend services remained untouched. No machine-wide exclusive window or CPU/I/O load monitoring established. Existing caches retained, no cold-cache claim.
- Full suite not executed: real-host/shared-installation quiet window and acceptance publication authorization remain unconfirmed. Interactive clarification tool unavailable. Full-suite opportunities below require a baseline before implementation.

## Measurements

| Run | External wall seconds | Exit | Outcomes |
| --- | ---: | ---: | --- |
| 1 | 6.6145424 | 0 | 10 pass, 0 fail, 0 skip, 63 assertions |
| 2 | 6.3227466 | 0 | 10 pass, 0 fail, 0 skip, 63 assertions |
| 3 | 6.3186087 | 0 | 10 pass, 0 fail, 0 skip, 63 assertions |

Median external wall: 6.3227466s. Range: 6.3186087–6.6145424s. First-run/cache effects not independently separated.

Median reported case durations (includes runner-attributed setup): hung CLI 4.130065s; scope promotion sequence 0.684780s; concurrent publications 0.303962s; acceptance exclusions 0.257742s; source evidence 0.248948s; lock timeout 0.194023s; mutation rejection 0.171812s; invalid version 0.144179s; SemVer 0.100697s; legacy flag 0.095546s.

Sum of reported case durations: 6.585248 / 6.300606 / 6.295341s; external wall remainder ~0.019–0.029s. These are serial single-file results, not sums usable to predict the parallel full gate.

## Additional safe representative baselines

After read-only fixture review, ran two additional files separately, three sequential fresh Bun processes each, with the same JUnit reporting protocol; no real-host/full-suite execution. All commands include `--reporter=junit --reporter-outfile=.scratch/test-optimize/evidence/<partition>/run-N.xml`.

| Selection | External wall seconds, runs 1/2/3 | Outcomes each run |
| --- | --- | --- |
| `bun test ./tests/framework/definition.test.ts` | 0.0782605 / 0.0515045 / 0.0531763 | exit 0; 13 pass, 0 fail, 0 skip; 53 assertions |
| `bun test ./tests/connect-bot/state-machine.test.ts` | 0.0896033 / 0.0832006 / 0.0871126 | exit 0; 14 pass, 0 fail, 0 skip; 34 assertions |

Exact ordered test identities match across each file's three reports. These are representative files, not complete directory measurements. Definition tests exercise recording API and temporary stderr interception; state-machine uses injected requests/controlled timer state, not production backend traffic. Each run ends its process to bound global state lifetime. Neither file justifies new isolation infrastructure for runtime savings at observed sub-0.1-second end-to-end duration. Results do not establish their cost under full-suite contention.

## Candidate and preservation boundary

Small candidate: scope Git setup/cleanup hooks to the eight integration scenarios rather than also running them around the two pure checks (`tests/pi-suite/pi-acceptance.test.ts:47-80`). [INFERENCE] This could remove approximately 0.19–0.22s of currently reported pure-case time, an upper-bound-scale estimate rather than demonstrated savings. Setup was not separately instrumented. Small benefit; no need for a new abstraction or shared mutable repository.

| Protected commitment and source | Premises | Observable fault | Proposed preservation |
| --- | --- | --- | --- |
| Strict SemVer precedence and invalid inputs, test lines 63-70 | Existing prerelease/build/large-number/invalid examples | Incorrect comparison or accepting invalid input | Retain all examples/assertions, omit unrelated Git fixture only |
| Legacy flag rejection, lines 73-77 | Both split and equals forms | Accepting removed flag or missing replacement guidance | Retain calls and checks, omit unrelated Git fixture only |
| Integration acceptance scenarios, lines 80-187 | Fresh mutable repo per case; shared record within contention scenario | Bad promotion, overwritten higher version, missed source mutation, missing provenance | Keep per-case roots, real git/subprocess/file locks and cleanup |
| Hung CLI, lines 136-145; support metadataProcess lines 82-97 | Actually nonterminating child | Deadline does not reject/record blocked outcome | Keep real 4-second timeout path; do not fake timers to claim savings |

The existing hung-CLI test asserts rejection and blocked evidence, not an independent OS-level absence-of-process probe; do not overclaim its cleanup proof.

## Repository-wide static findings (not measured hotspots)

- `tests/harness-dock/baseline.ts:276-343`: cold/mismatched OMP cache may run `bun install` in staging and publish `.cache/omp-baseline/<version>`; cache checks are not proof of installation mutual exclusion. `tests/harness-dock/host-patch-artifact.ts:261-309,355-437` also validates hashes/materializes patched artifacts. Separate cold provisioning from warm steady-state measurements.
- `tests/workflow-chat/support/manager-dock.ts:23-49`, `node-dock.ts:18-59`, `prompt-dock.ts:28-91`: per-scenario deployment copies and real host startup are candidate setup costs. [INFERENCE] Immutable deployment preparation may be worth reusing only if measured dominant; keep per-session state/config/runtime roots separate and do not reuse mutable sessions blindly.
- `tests/workflow-chat/support/backend.ts:7-65`: real safe-shell backend requires prebuilt sibling binaries, uses owned temp storage and dynamic loopback ports, with controlled external CLI. Do not replace this seam with mocks to claim equivalent integration proof.
- `tests/workflow-chat/pi-native.test.ts:17-28` plus `scripts/support/pi-acceptance.ts:209-265`: full passing native acceptance updates `framework/docs/pi-acceptance.json`; failures/partial runs still write scratch evidence. This is why full-suite execution requires confirming side effects rather than assuming tests are read-only.
- `tests/harness-dock/env.ts:10-65`: configuration offsets are removed but environment is not a network/credential sandbox. Production services remain untouched.
- Literal scan found parameterized cases in connect-bot/framework/integrations; baseline selection can skip a describe group (`tests/harness-dock/baseline.test.ts:31-32`); storage publication scenario is Windows-specific (`tests/model-cost/foundation/storage/storage-processes.test.ts:647`). Full expanded identity/skip inventory remains unmeasured; static searches do not establish absence of dynamically generated selections.

## Full-gate measurement plan (not executed)

1. Confirm exclusive test/build window, selected host and backend prerequisites, and permission for native acceptance record publication. Keep source stable. Read any generated acceptance changes as provenance, not an optimization patch.
2. Follow repository guidance to warm changed host/patch prefixes with `bun run test:dock:serial`; record this separately from baseline.
3. Run canonical `bun run test` three times sequentially with per-run logs/JUnit and `--timings=<owned-path> --update-timings` when collecting file costs. Note: consuming timings changes scheduling. Keep initial diagnostic timing collection separate; establish a fresh baseline for any timing-informed scheduler comparison.
4. Rank per-file costs and long-tail worker utilization; only then investigate real-host startup/resource reuse or bounded concurrency choices. Compare identical expanded test identities, platform-dependent skips, baseline-dependent skip groups, failures and quarantines rather than equal counts alone.
5. A candidate may retain the existing structure. Do not remove process separation, real timeout tests, contention sharing, or publication/lock-cleanup waits to improve metrics.

## Decision

Keep existing tests/runner as-is in this assessment. Recommend the small hook-scope cleanup only if the user wants a low-cost implementation; estimated local savings are small and not demonstrated full-gate savings. Prioritize an authorized full-gate timing baseline before larger fixture reuse or scheduling changes. Consider duration-aware scheduling with existing Bun `--timings` rather than increasing 12 workers blindly, but only after observing a critical-path tail and comparing the identical workload under a stable protocol. This remains an unmeasured hypothesis, not a recommendation to change the gate immediately.

No before/after speedup claimed; no optimization implemented.
