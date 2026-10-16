# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "06-local-process-connectionmd-28676e45-105e-48aa",
  "head": "db70897d6862e3e584b4a7e2e87c0011fa864c29",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "06-local-process-connection",
  "status": "implemented, committed, handed off",
  "commit": "db70897 (branch hyper/model-cost-pi-migration/06-local-process-connection-2eec5e-411dc288ea83, parent 304451e)",
  "delivered": {
    "new": [
      "framework/modules/local-access.ts",
      "tests/framework/local-access.test.ts",
      "tests/framework/support/local-access-child.ts",
      "tests/framework/support/local-access-child-runner.ts",
      ".scratch/model-cost-pi-migration/evidence/06-local-process-connection.md (+ raw logs)"
    ],
    "changed": [
      "framework/core/state.ts (StateRules.localAccess, per-owner offer/withdraw, change announcement)",
      "framework/adapters/pi.ts (process publisher built only for childEntry x follow)",
      "framework/adapters/omp.ts (documented: no access, all sessions in-process)",
      "framework/config.yaml (runtimeDir: .runtime)",
      ".gitignore",
      "framework/README.md, framework/docs/framework-capabilities.md, framework/GLOSSARY.md",
      "tests/framework/support/pi-surface-double.ts (optional stated definition)"
    ],
    "untouched": [
      "extensions/**, framework/behaviors/**, host-patches/**, other tickets, workflow reports, the integration branch worktree"
    ]
  },
  "behaviour": {
    "carrier": "real Windows named pipe (\\\\.\\pipe\\my-agent-toolkit-access-<random-id>); POSIX socket file beside the runtime directory (code path only here)",
    "protocol": "closed: declared hello -> welcome with the seat's values; declared read -> value; changes pushed one way. No write frame, no method name/argument list; any other frame refused.",
    "verification": "one location record per seat ({extension, owner, endpoint, verification, pid}) under the runtime directory, no values/State/business data; both ends check seat + this access's verification before anything crosses; unreadable/foreign/incomplete records are read as no record",
    "sameProcess": "a seat served here is answered by the source itself - no config read, no record read, no endpoint",
    "lifecycle": "seat withdrawal removes its record, stops observations, releases its connections; last seat closes the endpoint (POSIX socket file removed); dispose withdraws all and closes the endpoint; caller.ended() true at release; bounded handshake/read/request waits, releaseable by AbortSignal",
    "configuration": "runtimeDir from the shared config file, relative resolved against that file's own directory; missing/empty/office value/non-string/unreadable file -> LocalAccessConfigurationError naming the file reached; never substituted by tmpdir, cwd or storageDir"
  },
  "criteria": [
    {
      "criterion": "real named pipe/socket runs one-way push + on-demand State request/response; same-process direct call; no business documents/file queues/directory scans",
      "evidence": "tests/framework/local-access.test.ts: 'an independent process publishes...' (real child process, pushed change + on-demand read + unknown field absent), 'reading in the process that serves the seat opens nothing...' (config path absent yet the read works), 'the endpoint serves its own seat and refuses a frame for any other' (raw protocol); docs/framework-capabilities.md"
    },
    {
      "criterion": "runtimeDir missing/empty/illegal/relative + multi-process consistent location; no fallback to hidden dir/cwd/storageDir; Windows pipe name vs disk directory recorded separately",
      "evidence": "cases: 'a relative value resolves...', 'an absolute value is used as declared', 'a real process started elsewhere locates the same access' (real child, different cwd), 'no file, no value, an empty value and a value that is not a string are all refused' (8 shapes, workspace holds only config.yaml), 'a process with no usable directory reports it and offers nothing' (real child, nothing in its cwd), 'the repository's own configuration states...'; win32 endpoint/directory split asserted in 'an independent process publishes...' (endpoint is a pipe name, not under the runtime directory)"
    },
    {
      "criterion": "real child process + synthetic secret: wrong Owner, stale endpoint, expired location, post-disposal connection refused; obtainable model requests/logs; real credentials not printed",
      "evidence": "cases 'another verification is refused and no values cross' (synthetic-verification-... planted; refused; never in refusal text, child stderr or child results), 'a record filed under one seat and naming another...', 'the endpoint serves its own seat and refuses a frame for any other', 'an old endpoint is reported as absent rather than reached', 'a record that cannot be read is read as no record', 'a released access leaves no record, and a reader it left open is released with it', 'a disposed access releases its records and the endpoint itself', 'withdrawing one seat releases its own reader and leaves the other seat's reader answering', 'the verification is only ever in the location record'"
    },
    {
      "criterion": "communication resources and location released with the access lifetime; no general RPC or remote State write; local validation not promoted to cross-user/POSIX auth",
      "evidence": "release/disposal/withdrawal cases above + 'no frame writes a declared value' half of the raw-protocol case; module header and docs/framework-capabilities.md state explicitly that verification is not OS access control, cross-user isolation or POSIX authentication"
    },
    {
      "criterion": "P42 full coverage (S1, S2)",
      "evidence": "S1: 'a store offers the owner it serves...' and 'the pi assembly offers an owner only for a follow field in a host that spawns sessions' (binding path through the pi surface double; diagnostic + runtime artifacts observed; configuration failure is a LocalAccessConfigurationError, never a reconnectable unavailable). S2: REAL independent processes run the production module under a misconfigured/relative config and report their diagnostics and artifacts; the real-loaded pi/OMP host run is NOT executed here (see unverified)"
    },
    {
      "criterion": "P56 full coverage (S1, S2)",
      "evidence": "S1: refusal/secret/wiring cases above. S2: real independent processes over the real carrier for read, push, refusal and release; the real-host-side disposal/diagnostic observation is limited as reported"
    }
  ],
  "commands": [
    {
      "cmd": "bun run typecheck",
      "result": "exit 0, no output"
    },
    {
      "cmd": "bun test tests/framework/local-access.test.ts",
      "result": "21 pass / 0 fail / 123 expect (1 file)"
    },
    {
      "cmd": "bun test tests/framework",
      "result": "451 pass / 0 fail (36 files, 2150 expect)"
    },
    {
      "cmd": "bun test tests/model-cost",
      "result": "394 pass / 0 fail (31 files, 2011 expect)"
    },
    {
      "cmd": "bun test tests/codebase-tools",
      "result": "24 pass / 0 fail (7 files, 334 expect)"
    },
    {
      "cmd": "bun test tests/harness-dock",
      "result": "NOT RUNNABLE in this worktree: aborts before any of this ticket's code loads (tests/harness-dock/host-patch-artifact.ts:224 'host-patches/omp-18.5.0-viewed-session/patch.diff touches no file'; no pinned host install present - .cache is gitignored and absent)"
    }
  ],
  "faultInjection": {
    "killed": 12,
    "detail": "config fallback substituted; server stops comparing verification; refusal leaks values first; same-process direct path skipped; record's stated seat not checked; unreadable record used; record endpoint/verification checks removed; withdrawn seat's record kept; withdrawn seat's connection left open (needed the new ended() observable + two-seat case); location not waited for; follow gate dropped; any id+field frame served as a read (needed an id on the probe frame). Each was restored and the suite re-run green.",
    "notObservable": [
      "POSIX socket-file removal (statement sits inside the non-win32 branch; win32 host)",
      "the location record's staged+rename atomic publish (a reader treats a partial record as no record, so no case can distinguish; kept as this repo's publish convention and reported as inspection-only)",
      "one dead condition in #closeEndpoint was found this way and deleted from the implementation"
    ]
  },
  "unverified": [
    "S2 'actually loaded' observation in a real pi/OMP process (diagnostic on a bad runtimeDir; a real child session reading its owner over the access): not executed - no pinned host install in this worktree and the dock aborts at another ticket's patch-artifact step. Reported as unverified in the evidence, not as passing.",
    "POSIX execution evidence (socket file, 0o700/0o600, stale-socket cleanup): code paths and assertions only; this host is win32.",
    "Cross-user reachability and Windows pipe DACLs: node:net exposes no knob; no second user on this host.",
    "Handle inheritance / detached combinations: out of scope."
  ],
  "notes": {
    "gates": "the pi process publisher is built only for childEntry x follow; neither shipped pi assembly satisfies both today (model-cost states childEntry but declares no follow; codebase-tools declares follow but states no childEntry), so the wiring publishes nothing today by design - consumers are ticket 07 (follow read) and the assembly that states codebase-tools' pi child entry",
    "housekeeping": "node_modules installed with bun install --frozen-lockfile (deps were absent); no fallback/hidden directories left behind, framework/.runtime is empty and gitignored; no leaked pipes after the suite; the ticket markdown itself was left to the workflow (matching ticket 05's commit, which touched only its evidence file)"
  }
}
