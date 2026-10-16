# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "07-owner-statemd-5c35ef49-faad-4ddd-ba68-66b9cc8",
  "head": "8969f37fc402d4c4fb02b9491cd7fd0f7a695185",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "07: Owner State 实时读取、降级与恢复",
  "status": "implementation_complete_with_recorded_verification_limits",
  "commit": "8969f37 (branch hyper/model-cost-pi-migration/07-owner-state-72b774-411dc288ea83, base 38888c6)",
  "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-EwXqpz (clean; handed off for independent integration)",
  "delivered_behavior": {
    "follow_read_at_use_point": "A `follow` field's subagent reads the Owner's current value: this process's own cell first (in-process direct read, no access opened), otherwise the value the Owner's framework local-access states; declared default while it is not reached. One read rule drives all three public consumptions (injected prompt at run initiation, marker area, capability handed to a handler).",
    "degradation": "The read never waits for another process; the default answer writes nothing back to the Owner, records nothing in the reader's own medium and is not presented as a read of the Owner's value; the same read returns the Owner's real value once the access is back.",
    "recovery": "Per-read: concurrent reads of one target merge into one attempt; a failed attempt spaces the next (baseMs×2^(n-1), capped at maxMs); a connected access is never polled (changes are pushed); an ended access is spent and never reused, the read after the spacing opens a fresh one; `StateStore.dispose()` releases every access and stops following for good (pi adapter releases on session_shutdown quit/reload).",
    "observation_authority": "A delivery whose session is not its own Owner hands out a read-only handle (reads via the field's inheritance rule, every write and notice dropped; same for a handle used after the delivery and for one retained from an owner session_end).",
    "followed_seat_rendering": "A store that has read an Owner also answers that seat, and the run initiation re-renders the area from the current value, so a line added/removed by the other process does not stay stale.",
    "consumer_migration": "extensions/codebase-tools/harnesses/pi.ts now states its childEntry (without it the only `follow` consumer was unreachable on pi; ticket 06 recorded this as this ticket's/consumer's wiring). Docs synced: framework/README.md, GLOSSARY.md, docs/framework-capabilities.md, docs/harness-support.md (state.subagent-follow, lifecycle.owner-scope), extensions/codebase-tools/README.md."
  },
  "criteria_evidence": {
    "P14 (S1)": "tests/framework/owner-follow.test.ts — seat states false => run contributes nothing (access opened with the assembly's bounded waitMs=2000 recorded); Owner changes to true after the child started => next consumption (contribution + marker line) is true; change back followed; a persisted payload the child's boundary carried was not used as the value. In-process: cell answers, zero opens.",
    "P15 (S1)": "inheritance none reads the declared default with the Owner on and zero opens; unresolved same; unreachable owner (a) answers the default, (b) leaves the seat's own value untouched, (c) records nothing, (d) is not replaced by a persisted payload the boundary carried, and (e) reads the Owner's real value once reached — so the earlier false was not a measurement.",
    "P16 (S1)": "6 reads in one turn merge into 1 open and all answer the default; after landing they are the Owner's value; an ended access is released (dispose count 1) and the next read reopens and reads the new value with no replayed delivery; spacing asserted exactly as attempts at [0,25,75,135,195,255] ms for {waitMs:20,baseMs:20,maxMs:60} (doubling would place the 6th at 620ms); 200 virtual-clock reads on a healthy access add no open and issue no request; after dispose, 600s of virtual time adds none.",
    "P16 (S2)": "tests/framework/owner-follow-processes.test.ts — two real child processes over a real named pipe/socket and a real shared config: follower reads the Owner's true after reaching it; Owner set false/true is followed; Owner's seat withdrawn => follower works on the declared default (its previous true not kept) => a second real serving process restores the value => follower reads true again; a disposed follower reads nothing and opens nothing.",
    "P17 (S1)": "One binding declares owner- and session-scoped groups; on the child's own delivery the session-side capability read observes the Owner's value but its write(false) against the Owner's true and its notify produce no persist record, no marker rendering, no feedback, no cell in this process, and the Owner's own value stays true; the retained child handle behaves the same after the delivery; a child-side command records nothing while the Owner's own command persists {enabled:false} and notifies; a handle retained from the owner session_end is inert from birth. Negative evidence uses real write attempts and effect counts, not widget values (P57's P17 item).",
    "assembly_wiring (S1)": "tests/framework/owner-follow.test.ts drives the real piAdapter with CODEBASE_TOOLS + childEntry: the owner session offers its seat, the spawned session resolves {kind:inherited,key:main:pi-follow-owner} and its run renders the Owner's line; the none-inheritance control offers nothing and renders nothing."
  },
  "verification_run": {
    "bun run typecheck": "clean (exit 0)",
    "bun test tests/framework": "466 pass / 0 fail, 2236 expect, 38 files (was 451 before this ticket; +15 new cases) — log .scratch/model-cost-pi-migration/evidence/logs/07-framework.log",
    "bun test tests/model-cost tests/codebase-tools tests/connect-bot": "555 pass / 5 fail, 2964 expect, 56 files — log logs/07-consumers.log; all 5 failures are environmental: tests/connect-bot needs the real omp-bot interop binary (C:/Users/hugos/AppData/Local/Temp/omp-bot/backend/target/release/omp-bot.exe) which is not built on this machine; the throw happens before any State path is loaded, and the cases are unrelated to this change. tests/model-cost and tests/codebase-tools had no failures.",
    "fault_injection": "8 mutations each killed exactly the intended cases and were restored (green 15/15 after restore): follow read reverted to view (7 pass/8 fail), non-owner capability reverted to the owner's (11/4), no in-flight merge (10/5), no spacing ceiling (14/1), ended access reused (13/2), marker gate ignoring a followed seat (13/2), dispose still following (14/1), failures unspaced (14/1).",
    "test_design": "No wall-clock waits in the S1 suite (vi.useFakeTimers drives the framework's own spacing; attempts are awaited through the reader's own promise). The S2 suite waits only on events that belong to the other process, bounded by the condition, because deterministic time control cannot reach another process."
  },
  "unverified_or_incomplete": [
    "Real pi host run (S2 'actual loading'): NOT executed. The ticket's real cross-process facts come from two real independent processes with the real carrier; the 'real pi process, real provider-spawned child session follows the Owner across processes' run was not performed. Reason: tests/harness-dock is not runnable in this worktree (same host-patch artifact-chain gap ticket 06 recorded) and the two-process pi smoke script was not finished before the run budget ended. Recorded as a limitation, never as passing (evidence §5).",
    "POSIX not executed (win32 machine); the reading half reuses ticket 06's carrier, whose own POSIX branch is likewise unverified.",
    "tests/harness-dock (real OMP host) not executed.",
    "Real TUI readability and real provider account-side checks belong to other tickets/human acceptance.",
    "The codebase-tools childEntry declaration is judged to be in scope ('migrate the affected shared State consumer') because without it this ticket's promise has no production consumer on pi; its real-host loading is left to the later real-host regression (ticket 21).",
    "5 connect-bot cases in this machine's environment require a missing external binary; they are not claimed as passing."
  ],
  "evidence_record": ".scratch/model-cost-pi-migration/evidence/07-owner-state.md (committed, with logs/07-typecheck.log, logs/07-framework.log, logs/07-consumers.log)",
  "handoff": "Work committed on the ticket branch, worktree clean; integration subagent may take over. Do not treat the unverified items above as passed."
}
