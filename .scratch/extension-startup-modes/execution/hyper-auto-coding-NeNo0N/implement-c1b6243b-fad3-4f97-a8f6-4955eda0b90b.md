# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "07-codebase-tools-subagent-followmd-4ea17dfe-7d3",
  "head": "93cc3e4523f3cf5fe4cc62cf743b4560df80764c",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "07-codebase-tools-subagent-follow (P14)",
  "status": "implemented, tested, committed on ticket branch; ticket Status left in-progress pending integration merge",
  "commit": "93cc3e4",
  "branch": "hyper/extension-startup-modes/07-codebase-tools-subagent-follo-382a98-b21292ab9ce5",
  "delivered": {
    "production_code": "none required: ticket 01's startup rule already applies a mode's choice only at the process's first owner start, so a subagent delivery owns no cell, applies no choice and records nothing; this ticket proves and pins that behavior and the childEntry/mode correspondence",
    "new_test": "tests/codebase-tools/startup-modes-follow.test.ts",
    "extended_smoke": "scripts/pi-codebase-tools-smoke.ts (real pi spawned-child follow phase for both modes, --follow-only, provider temp root isolated under the run root)",
    "docs": "extensions/codebase-tools/README.md (childEntry/spawned-session contract, follow phase, Node 22.19.0 requirement); ticket evidence and limits appended"
  },
  "criteria": [
    {
      "criterion": "both modes keep follow semantics without an independent subagent default/memory",
      "evidence": "S1 suite (5 pass): auto enables only the owner; off->on->off live changes in both modes; subagent start persists nothing; child journals in the real smoke contain no codebase-tools:state"
    },
    {
      "criterion": "controlled owner change through the public assembly interface, both directions, marker delivery included",
      "evidence": "S1 suite drives the owner's own toggle command and asserts init -> none -> reminder contributions and marker area renderings; fault injection: followed-read->default failed 2 cases, owner-gate-applied-to-inherited failed 4 cases; mutations restored and implementation diff empty"
    },
    {
      "criterion": "unreachable owner keeps the existing default read, never independently enabled",
      "evidence": "S1 suite with a rejecting follow reader in both modes: contribution absent, area published with no line, nothing recorded"
    },
    {
      "criterion": "real pi subprocess proves follow; explicit childEntry matches the selected mode",
      "evidence": "real pi smoke: provider launch recovery-descriptor names the mode's own entry real path for each detached child (pi entrypoints/pi/codebase-tools.ts, pi-auto entrypoints/pi-auto/codebase-tools.ts); child's own request/journal carry the contribution only while the owner is enabled; detached runner state complete, positive pid, exit 0; child journal has no State"
    },
    {
      "criterion": "existing subagent access/wait semantics preserved; no admission or production debug surface added; no support expansion",
      "evidence": "no production source changed; framework follow/readiness/access suites 92 pass; integration check exit 0 with codebase-tools/omp and /pi COMPLETE; no support record changed"
    },
    {
      "criterion": "isolated owner/process/temp state; commands, contributions, process results and environmental limits recorded",
      "evidence": "ticket Evidence section records run roots, provider temp root redirection, pi 1.3.0/Node 22.19.0/Bun 1.4.2/Windows x64, provider 0.78.0 vs config integration 0.80.0 mismatch, and Node 24.18.0 pre-existing libuv exit failure reproduced on HEAD"
    },
    {
      "criterion": "affected follow/access cases, owning partition, consumers, type/static checks, childEntry/usage docs",
      "evidence": "see verification table below"
    },
    {
      "criterion": "no unrun item marked passed",
      "evidence": "auto-mode OMP in-process built-in delegation was not driven at the real OMP harness (real-host P14 evidence is pi; both modes covered at S1 and the manual OMP delegation passed unchanged); recorded as a coverage limit"
    }
  ],
  "verification": [
    {
      "command": "bun test tests/codebase-tools/startup-modes-follow.test.ts",
      "result": "5 pass / 0 fail, 48 expect() calls"
    },
    {
      "command": "bun test tests/codebase-tools (owning partition, incl. real OMP dock suites)",
      "result": "40 pass / 0 fail, 10 files, 495 expect() calls, 95.88s"
    },
    {
      "command": "bun test tests/framework/{owner-follow,owner-follow-processes,follow-observation-independence,followed-owner-readiness,pi-subagent-integration,pi-child-extensions,pi-subagent-provider-path,local-access,local-access-observation}.test.ts",
      "result": "92 pass / 0 fail, 9 files, 471 expect() calls, 6.83s"
    },
    {
      "command": "bun run typecheck",
      "result": "tsc clean; authoring 55 files, 3 declarations, 0 diagnostics"
    },
    {
      "command": "bun run check:integrations",
      "result": "exit 0; codebase-tools / omp: COMPLETE, codebase-tools / pi: COMPLETE"
    },
    {
      "command": "PI_NODE=<nvm v22.19.0>/node.exe bun scripts/pi-codebase-tools-smoke.ts --mode manual",
      "result": "67 checks passed, none failed, 5 isolated runs (follow phase off -> on)"
    },
    {
      "command": "PI_NODE=<nvm v22.19.0>/node.exe bun scripts/pi-codebase-tools-smoke.ts --mode auto",
      "result": "46 checks passed, none failed, 3 isolated runs (follow phase on -> off)"
    },
    {
      "command": "bun scripts/pi-codebase-tools-smoke.ts --mode manual --follow-only / --mode auto --follow-only",
      "result": "15/15 checks passed each"
    },
    {
      "command": "base HEAD smoke copy --mode manual",
      "result": "reproduces the pre-existing Node 24.18.0 Windows/libuv UV_HANDLE_CLOSING exit 9 at the first phase's close, confirming it is not introduced by this ticket"
    }
  ],
  "unverified_or_limits": [
    "Auto-mode OMP in-process built-in subagent delegation was not driven at the real OMP harness; both modes' follow semantics are covered at the S1 assembly seam, the real OMP partition includes the unchanged manual built-in delegation and auto-mode real-host startup, and no production code changed.",
    "Real-host run uses installed pi 1.3.0 while the smoke's expectations were written for 1.2.0; version mismatch is reported by the script as a note.",
    "This machine's framework/config.yaml points the adapter's provider integration at pi-subagents@0.80.0 while the smoke loads the repo-pinned 0.78.0 extension; the requirement registry and child loading worked, no support claim derived.",
    "Marker rendered appearance remains human-led (unchanged by this ticket)."
  ],
  "worktree": "clean; implementation committed; ready for independent integration agent with integration branch dev"
}
