# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "04-shared-storagemd-14eab083-2900-43d1-839b-a78a",
  "head": "3b3e8a410e562970619e995e5e24412b0b76dc4a",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "04-shared-storage (共同存储并发提交与只读同步)",
  "status": "implemented, verified, committed, worktree handed over clean",
  "branch": "hyper/model-cost-pi-migration/04-shared-storage-e2046d-411dc288ea83",
  "commits": [
    "c60782d 04: adopt another writer's committed document on a read-only synchronization (P32-P34, P38, P39, P57)",
    "3b3e8a4 04: read the detail form beside the file on a synchronization, and record the dock's CRLF limitation"
  ],
  "delivered_behavior": {
    "gap_closed": "the read half of sharing one storage root had no entry at all: `load` is an initialization (creates the root, reads an absent document as a fresh period, pauses on a read failure) and `commit` must write",
    "store": "ConsumptionStore.synchronize(): adopts the file's own document and writes nothing (no lock, no temporary file, no publication — a replacement is atomic). absent (root holds no document, never a fresh period), paused (no re-read), unusable (not JSON / not this schema → pause exactly as a save meeting it does), unreadable (a read that failed → reported, baseline stands, no pause), adopted{periodChanged, changed}. A synchronize before any baseline is a misuse, like commit/reset.",
    "store_reading": "ConsumptionStore.periodSessions(): the period's own records — every harness's, in the document's order.",
    "runtime": "ModelCostRuntime.synchronize({feedback?}): a period change runs the existing periodSwitched() discard (closed generation's accumulation, Round boundaries and Session spans go with it), a same-generation document that really changed is announced, an identical document redraws nothing, each baseline fault is stated once per reason (and again after a successful read), and after the instance's own cleanup the answer is `closed` with no read at all (no effect after disposal).",
    "display": "the accrued line now reads periodSessions(), so the period's total and segments are the whole shared document's; the session tree, identities and version chain stay harness-scoped. Docs updated in presentation/display.ts and GLOSSARY.md (new term Read-only synchronization；Accrued bar cross-harness).",
    "test_support": "store-child extended with harness / syncs / instrumented / ready+go rendezvous and fs call counts (reads, publishes, locks) for its own document; new shared tests/model-cost/support/store-child-runner.ts; scripts/support/efficiency-baseline-fs-instrument.ts gains a namespaceInstrumented() self-check export used to refuse a demanded count from an uninstrumented process."
  },
  "coverage": {
    "P32": "S3 real independent processes: a 4-process batch over one document (saved×2 / conflict / stale-version) where each process's own instrument shows publishes = 1 for an accepted record and 0 for a refused one, reads = 2, and the file holds exactly the accepted records (refusals not retried, failures not claimed as saved). A win32 injection (a handle held open on the document) makes the publication fail: reported {kind:'failed', failure:'io'}, publishes = 0, file byte-identical, and the next new process publishes normally with no lock/staging leftover. In-process mixed batch of 4 commits with per-record outcomes. Deterministic in-flight interleaving via the ready/go rendezvous (sync case) and startAt (batch case).",
    "P33_and_P57_refresh_item": "S3 real processes: the syncing process reports {adopted, periodChanged:false, changed:true}, heldSessions includes the other process's records, fsOperations = {reads:2, publishes:0, locks:0} and the file is byte-for-byte what the other writer published. S2 bound runtime: the adopted records appear in view.own/identity and in the detail reading (target current = 3 saved + 1 in flight; tree = 6 including the adopted descendant) while the uncommitted request stays in memory and the file is untouched; an external period switch is taken on as the period, discards the closed generation's accumulation/spans and the following round_end writes nothing; a second synchronization of the same document changes nothing and produces 0 subscriber notifications; the notice cannot make an unsaved record appear.",
    "P34": "initialization: unreadable target, not-JSON, other schema and legacy documents → unusable + pause + notice naming the file + file kept + no repair. runtime: a corrupt document pauses, is stated once, and a second synchronization (target then a directory) proves the file is not read again; an unreadable target is reported with the baseline standing and the Round's next commit then lands normally. A paused instance still makes a real provider query (a deepseek request past the success TTL produces an actual balance request on the substituted transport, address per the approved rule). A normal next initialization rebuilds the baseline (existing + new cases).",
    "P38": "S2 display: a two-harness literal document yields accrued() = {totalCny: 0.875, sessionCostsCny: [0.5, 0.25, 0.125]} while the target's own tree stays harness-scoped; a session's uncommitted request is neither added nor double counted (0.5 before the save, one share after). S3 real processes: the same id in two harnesses and a per-harness + period reading (heldSessions = this harness's one record, periodSessions = both partitions).",
    "P39": "S3 + store: the same session id under two harnesses keeps its own direct parent, version and consumption; all three commits save; a far lower version in one partition is not refused by the other's higher one; the other partition's record is field-for-field what its own process left."
  },
  "verification_run": [
    {
      "command": "bun run typecheck",
      "result": "clean (tsc --noEmit, no output)"
    },
    {
      "command": "bun test tests/model-cost",
      "result": "376 pass / 0 fail (28 files, 1923 expect) — includes the new tests/model-cost/shared-storage-refresh.test.ts (6 cases) and the extended consumption-store / display / storage-processes suites"
    },
    {
      "command": "bun test tests/framework",
      "result": "378 pass / 0 fail (shared-contract consumer; no framework source changed)"
    },
    {
      "command": "bun run baseline:efficiency --label ticket-04-consumer-check",
      "result": "every invariant held; read-only-refresh sequence unchanged at 0 file operations and 0 requests, confirming the period-source change added no I/O to the read path; the store-child instrumented runs measured the new adoption at 1 read, 0 locks, 0 publishes (for ticket 22's comparison)"
    }
  ],
  "fault_injection_evidence": [
    "A synchronize no longer adopting → 4 cases fail (store + runtime P33)",
    "B synchronize re-publishing the document it adopted → exactly the real-process call-count case fails; the in-process byte comparisons do not, which is why P57 requires counts rather than values",
    "C period change no longer discarding → the external-period-switch case fails",
    "F commits ignoring their harness partition → 3 P39 cases fail (store + real processes)",
    "G a refused item retried once → the real-process batch case fails on the read count",
    "H every adoption discarding local accumulation → the two in-flight-protection cases fail",
    "P38 reverting the period source to a harness filter → the cross-harness accrual case fails",
    "each injection was reverted and the suites re-run green"
  ],
  "unresolved_or_unverified": [
    "POSIX: the publication-failure injection relies on win32 refusing a rename over a name another handle holds open; the rest of the storage behavior was measured on win32 only.",
    "Trigger wiring: no production caller invokes runtime.synchronize() yet, by design — the assembly that owns a completion-notice event (tickets 05 / 06 / 20) is what must call it; nothing polls and no read path gained I/O in the meantime.",
    "tests/harness-dock could not run in this worktree: 45 pass / 12 fail, all traced to the CRLF checkout (patch.diff parses to 0 files with split('\\n'); bun.lock's working-copy sha 7f5c82e6 vs the recorded LF blob 9e9f4833, which matches HEAD:bun.lock after LF normalisation) — an environment fact of the worktree, not this change; a .gitattributes (e.g. '*.diff -text', 'bun.lock text eol=lf') or EOL-robust parsing is suggested for tickets 20 / 21.",
    "Interpretation point for the main agent / human reviewer: at runtime an I/O read failure is reported without pausing (matching the already-approved commit-path classification for the same file, and avoiding turning a transient read failure into a fault only the next initialization could clear); 'unreadable' pausing is demonstrated at initialization. If P34 is meant to require a pause on any runtime read failure, the commit path's classification must change and its existing assertion be migrated — flagged, not silently reinterpreted.",
    "The ticket file itself was left untouched, per the instruction not to modify workflow reports; ticket status bookkeeping is the main agent's."
  ],
  "evidence_record": ".scratch/model-cost-pi-migration/evidence/04-shared-storage.md (committed): delivered behavior, per-promise coverage, commands and results, the fault-injection table, and the uncovered items above"
}
