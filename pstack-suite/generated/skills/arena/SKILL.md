---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Open a todolist with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Native panel dispatch

1. Open `../../roles.local.json` relative to this generated SKILL.md. This is the confirmed roster, not a record of actual calls. Use only the named seats relevant to the workflow, one persona per seat. If the roster or a necessary seat is missing, show the gap and use [`/skill:setup-pstack`](../setup-pstack/SKILL.md) before retrying with a new session. Never count a model fallback list as multiple seats.
2. In native `task`, use each persona name as `agent` with a unique task name. Use one `tasks` batch when available; otherwise send separate native calls together. Start each brief with the absolute [worker.md](../poteto-mode/worker.md) path and include the absolute [poteto-mode SKILL.md](../poteto-mode/SKILL.md) path for the shared persona body. Pass file pointers rather than inline context. Do not set the per-call model.
3. Before dispatch, give each writable arm its own output location. For native Git worktrees, enable task isolation and set `isolated: true` with automatic apply disabled and retain/replay each native patch or branch in its own checkout for inspection. If native isolation is unavailable or the starting snapshot needs explicit preparation, set up distinct owned checkouts/directories first and pass their absolute paths. Never let two arms write the same checkout for a race. File isolation is not an OS or credential sandbox.
4. Read terminal results and independently verify the artifacts by path or Git ref. Use the attached `pstack task facts` for the actual agent, model identity, provider route, and reasoning, not the worker’s self-report or a name-based vendor guess. For diversity, map the resolved identities to underlying vendors using known model/catalog facts; if that mapping or actual identity is missing, report unknown. Disclose substitutions and failed or missing seats; an unobserved seat is not a match.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Read [native panel dispatch](#native-panel-dispatch). Select at least two confirmed `arena-runner-<seat>` personas and record the expected model and thinking for each. Use distinct directions for design exploration; repeat a model when the work is generation-bound, not judgment-sensitive. Report unavailable seats or actual substitutions rather than quietly accepting a different panel.
4. Give each candidate its own output location: a Git worktree when possible, otherwise a distinct directory under a run-owned temporary root. Follow [separate-before-serializing-shared-state](../principle-separate-before-serializing-shared-state/SKILL.md).

## Phase B: Fan out

Launch one parallel native `task` item per candidate. Give each the identical task, shared grounding by absolute path, its own output location, and a request for the artifact plus a short rationale naming alternatives considered and rejected. Keep candidate artifacts separate and readable by the parent and judge; verify the paths before judging.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After Phase B, choose the first eligible `arena-judge-<seat>` from the confirmed roster order. Brief the judge with the rubric, artifact paths and candidate labels, without your scores or provisional pick. The judge scores every candidate against each criterion and recommends a base without editing the artifacts. Use an actual model from a different underlying vendor than the parent (Fable and other Claude models are Anthropic). Check the resolved identities and vendor evidence before accepting a verdict as independent; a provider route may be a gateway, not the vendor. If a judge resolves to the same vendor or drops out, disclose it and try the next eligible configured judge. If the parent or judge’s vendor cannot be established, report that the vendor check did not run; any provisional score is not a cross-vendor verdict. If no eligible judge runs, say so and score the artifacts yourself.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge when Phase C ran one. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict or that Phase C skipped the judge, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result. Record the expected and actual candidate/judge models and providers for deviations; do not count absent or unverified seats as diverse.
