# Ticket 08 — safe-file interface cutover: verification evidence

Source state: branch
`hyper/framework-capability-cutover/08-files-interface-cutover-f9f984-e1e098c5b064` (the branch
created for this ticket), base revision
`d4d664d65157ea261393eb6100f3b7157a1924ad` (the merged ticket 07 cutover), plus this ticket's
working changes. Dependencies: `bun install --frozen-lockfile` (13 packages); `bun.lock` sha256
`e7ed487b216f5580aff054118ba241ed3c4877f3327617b8d60bba46c0de7f2f`, unchanged. Environment:
Windows 10.0.26200 x64, Bun 1.4.2 (`744846f84`), Node v24.18.0, TypeScript 7.0.2. Every file
coordination run below used real temporary local directories and real child processes; no harness,
provider, credential, external service or formal discovery entry was used for this ticket's file
behavior. `bun run test:framework` includes the recorded isolated
`@oh-my-pi/pi-coding-agent@18.5.0` deployment test, which passed.

## Delivered behavior

- `framework/interface/general/files.ts` is the safe-file module's one extension-facing entry. Its
  runtime exports are exactly `updateFile` and `SafeFileUpdateError`; its type exports are exactly
  `SafeFileUpdateOptions` and `SafeFileUpdateFailureKind`. It exports no lock, queue, recovery,
  temporary-file or retry mechanism.
- The canonical declarations live in `framework/interface/general/files-contract.ts`:
  `SafeFileUpdateOptions` keeps `timeoutMs` and `signal`, `SafeFileUpdateFailureKind` keeps
  `timeout` / `cancelled` / `io` / `corrupt`, and `SafeFileUpdateError` keeps `kind` and `detail`.
  The implementation in `framework/modules/files.ts` imports that same class and throws it, and
  the entry re-exports the same class, so an error thrown inside is recognized by `instanceof`
  outside — one identity, no copy. A direct probe observed
  `{"sameClassAsCanonical":true,"instanceOfPublic":true,"sameConstructor":true,"kind":"io"}` for a
  refused call.
- The entry's runtime connection is the deliberate thin exception:

  ```text
  interface/general/files.ts ──► interface/general/files-contract.ts   (declarations)
  interface/general/files.ts ──► modules/files.ts                      (updateFile re-export)
  modules/files.ts           ──► interface/general/files-contract.ts   (same declarations)
  interface/general/files-contract.ts ──► (no imports)
  ```

  There is no path from the implementation back to the entry, so the connection creates no cycle.
  `tests/framework/import-boundary.test.ts` now allows exactly this file/specifier pair beside the
  existing HTTP one and no other interface import of framework implementation.
- The deep implementation stays in `framework/modules/files.ts`: the per-document in-process
  queue, the cross-process lock directory and its recovery, the re-read inside the lock, the
  same-directory temporary file and rename, and the bounded in-use steps. `WAIT_RESOLUTION_MS`
  remains an internal module export because the session close-out reads it; the interface entry
  does not publish it.
- `framework/public.ts` no longer exports `updateFile`, `SafeFileUpdateError`,
  `SafeFileUpdateOptions` or `SafeFileUpdateFailureKind`; its only remaining export is the
  configuration reader/source types. `framework/modules/files` is removed from the extension
  legacy import exceptions, and no extension imports the implementation module or the old mixed
  entry.
- Consumers migrated: model-cost's `codex-estimate-store.ts` and `consumption-store.ts`; framework
  and model-cost close-out tests; model-cost's period-switch and pi-period-reset tests; the files
  suite and its child process; `scripts/pi-close-out-smoke.ts` and
  `scripts/efficiency-baseline.ts`. Documentation was updated where it named the old source
  (`framework/README.md`, `framework/interface/README.md`,
  `framework/interface/session/README.md`, `framework/docs/framework-capabilities.md`).
- Permanent coverage added only consumer-visible error gaps: the synchronous throw from an update
  function now complements the rejected-promise case as the same error object (unchanged identity,
  not a `SafeFileUpdateError`), and each of the `io` / `corrupt` / `timeout` / `cancelled`
  failures asserts that its `detail` identifies the target document. No path, wiring or
  declaration-move test was added.

## Acceptance mapping

| Ticket acceptance | Promise / partition | Evidence (actual run) | Result |
| --- | --- | --- | --- |
| Only `updateFile`, `SafeFileUpdateOptions`, `SafeFileUpdateError`, `SafeFileUpdateFailureKind` are public; the public error class is the same identity as the one thrown internally; lock, queue, recovery and temporary publication stay internal | P01, P49, P51 (safe-file partition); P42 | Runtime import of the entry printed `["SafeFileUpdateError","updateFile"]` (the other two are type exports); the identity probe printed `sameClassAsCanonical: true`, `instanceOfPublic: true`, `sameConstructor: true`; lexical repository search found the declarations only in `interface/general/files-contract.ts` and the implementation's one `export async function updateFile`; `framework/public.ts` runtime exports `[]`; `bun run typecheck` 0; import-boundary 16/16 | Pass |
| A real temporary local directory and independent child processes compete; the updater sees the latest business value inside the lock; independent counters/content prove completed updates are not lost; no in-process simulated lock stands in | P39 | `tests/framework/files.test.ts`: two independent child processes each run 10 read-modify-publish increments with a real 20 ms hold, final document `{count: 20}`; four rounds of a real dead holder plus 12 racing child processes each commit their own increment with no loss; distinct documents do not wait on each other. Fault injection: with the cross-process lock step removed, the same two-process case failed with `{count: 10}` instead of `{count: 20}` | Pass |
| In real read/write races and the applicable interruption case, readers see only a complete old or complete new document; `updateFile` resolves with the published next document, not only the final file | P40 | `tests/framework/files.test.ts`: 20 republishes of a 20,000-character document are read 300 times concurrently; every read parses a whole document with the intact filler, and the target's inode changed (rename, not in-place rewrite); the sequential test asserts every resolved value and the bytes after each publication; the killed holder case asserts the complete old document is still what a reader sees and the next update reads it. Fault injection: replacing the rename with an in-place copy made the reader case fail with `EBUSY` on the document being rewritten | Pass |
| The wait budget covers in-process queueing and cross-process lock acquisition; waiting timeout, waiting-cancelled, and cancellation after the update began are each observed | P41 | `tests/framework/files.test.ts`: a 300 ms queued call times out without its update function running (`late` empty) and the predecessor still publishes `{count: 1}`; a live external holder makes a 500 ms call time out after ≥500 ms with no write; a signal aborted while waiting reports `cancelled` in <2500 ms with no late write and the holder's `{count: 6}` intact; a signal aborted after the update began is ignored and the call resolves `{count: 1}` with that document on disk; no declared budget waits the contract's 15000 ms | Pass |
| Trigger timeout / cancelled / io / corrupt separately and check kind, detail and public class identity; synchronous and asynchronous business errors keep their own identity, not wrapped as coordination errors | P42 | `tests/framework/files.test.ts`: `failureOf()` asserts `instanceof SafeFileUpdateError` for queue-timeout, lock-timeout, cancelled, missing-directory/relative-target `io` and non-JSON `corrupt`; each asserts `detail` contains its target; the refusal case asserts the synchronous throw and the rejected promise each arrive as the exact same error object while surrounding updates publish `{count: 8}` / `{count: 9}`. Fault injection: wrapping update-function errors into `SafeFileUpdateError("io")` made that case fail on the synchronous identity assertion | Pass |
| Migrate every consumer of this batch, including model-cost storage; retire the old public declarations and the file-implementation legacy exception; reuse file coverage and storage-processes, run the data smoke by impact, and keep real cross-process mechanism evidence | P51, P52 (08 handoff) | Repository search after migration: no import of `framework/public` for files and no extension/test/script import of `framework/modules/files`; the only `framework/public` references are the import-boundary test's own reads and the two config types; `framework/modules/files` removed from the legacy exception list; `bun run test:framework` 628/0, `bun test tests/model-cost` 516/0, `storage-processes` 16/0 (real child processes over one shared root), close-out pair 8/0, `smoke:model-cost-data` 20/0 | Pass |

## Red → green and fault injection

| Slice | Evidence | Result |
| --- | --- | --- |
| Interface entry and declaration ownership | The cutover's structural red was the missing `framework/interface/general/files.ts`: the migrated imports could not resolve until the entry existed. No production behavior was introduced; the existing behavior coverage was reused rather than re-pinned. After the entry and contract were added, `tests/framework/files.test.ts` + `tests/framework/import-boundary.test.ts` ran 33/33 with the error class imported from the new entry | Green |
| Cross-process coordination is what the multi-process case observes | Fault injection: `acquireLock` was temporarily made to return without installing the lock (`OMP_FAULT_NO_LOCK=1`). The targeted two-process case failed with `{count: 10}` where the contract expects `{count: 20}`. The injection was removed and the full files suite reran 17/0 | Fault detected, then restored |
| The error path does not wrap business failures | Fault injection: the update call was temporarily wrapped in a `SafeFileUpdateError("io", …)`. The targeted refusal case failed at the synchronous identity assertion. The injection was removed and the full files suite reran 17/0 | Fault detected, then restored |
| Publication is a replacement, not an in-place rewrite | Fault injection: the replacing `rename` was temporarily changed to `copyFile`. The targeted reader case failed with `EBUSY` while reading the document being rewritten. The injection was removed and the full files suite reran 17/0 | Fault detected, then restored |

All injected changes were removed before the final regression runs; no `FAULT INJECTION` marker or
fault environment branch remains in the tree. The final focused and partition runs below were made
on the restored tree.

## Commands and results

Final tree, run sequentially. The storage-processes, close-out-pair and data-smoke runs preceded the
last edit, which added only assertions inside `tests/framework/files.test.ts`; their relevant source
and fixtures were unchanged, and the files suite reran after that edit.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 13 packages installed; `bun.lock` sha256 unchanged |
| `bun run typecheck` | 0 | no diagnostics |
| `bun test tests/framework/files.test.ts tests/framework/import-boundary.test.ts` | 0 | **33 pass / 0 fail**, 1202 `expect()` calls, 2 files |
| `bun test tests/framework/files.test.ts` after each fault-injection restore | 0 | **17 pass / 0 fail** (the final tree is covered by the combined and partition rows) |
| `bun run test:framework` | 0 | **628 pass / 0 fail**, 3303 `expect()` calls, 53 files (includes files, import-boundary and the real isolated OMP 18.5.0 deployment test) |
| `bun test tests/model-cost` | 0 | **516 pass / 0 fail**, 2892 `expect()` calls, 51 files |
| `bun test tests/model-cost/foundation/storage/storage-processes.test.ts` | 0 | **16 pass / 0 fail**, 118 `expect()` calls (real child processes, one shared temporary root) |
| `bun test tests/framework/close-out-deadline.test.ts tests/model-cost/integration/close-out-deadline.test.ts` | 0 | **8 pass / 0 fail**, 60 `expect()` calls |
| `bun run smoke:model-cost-data` | 0 | **20 passed / 0 failed**, 20 checks |
| `bun -e '… import("./framework/interface/general/files.ts") …'` | 0 | `[ "SafeFileUpdateError", "updateFile" ]` |
| `bun -e '… import("./framework/modules/files.ts") …'` | 0 | `[ "WAIT_RESOLUTION_MS", "updateFile" ]` (internal module; not the interface) |
| `bun -e '… import("./framework/public.ts") …'` | 0 | `[]` (only type exports remain) |
| Fault-injection targeted runs | 1 each (injected) | three failures recorded above; all reverted |

## Scope limits and unverified items

- This ticket closes P39–P42 and its P01/P49/P51 safe-file partition, plus the P52 handoff for
  ticket 08. It does not close those promises globally: configuration (ticket 09), the single
  internal port (10), final legacy retirement (11), the five real entry regressions (12–13) and the
  final handoff (14) remain later tickets.
- No harness dock, real host session, provider account, external service or physical terminal was
  run. The production files here are the harness-independent safe-file module and model-cost shared
  logic; no adapter, harness assembly or discovery entry changed, and the ticket's required
  cross-process evidence is the real child-process coverage above.
- P48 terminal readability was not judged. Focused green is not a claim of full-repository green or
  harness support certification; the codebase-tools and connect-bot partitions and every dock were
  not run for this ticket because no consumer of theirs changed.
- The one-off identity probe used an invalid relative target to observe the public class identity;
  the same identity is exercised by every failure case in the permanent suite.
