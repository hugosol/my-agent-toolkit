---
name: setup-pstack
description: Configure pstack Suite models and reasoning in OMP. Use for /skill:setup-pstack, "configure pstack models", or changing pstack role bindings.
---

# Setup pstack

This setup works before any pstack role is configured. Do not delegate setup or invent a binding. Find the toolkit root by following this skill's absolute source path out of `pstack-suite/generated/skills/setup-pstack/`; use that toolkit, not the current project directory if different.

## 1. Detect available models

Use `omp models --json` in the session's launch context and save the JSON to an owned temporary file. Include the effective `--config` and provider extension arguments when they affect the model catalog. Use exact `provider/model` selectors and the reported supported reasoning levels, not a vendor guess or a Cursor slug. If the same catalog cannot be obtained, ask the operator to supply it; do not make it up.

## 2. Show current state and propose settings

Read `pstack-suite/models.local.json` if present. If absent, all roles are unbound. Show the detected models and reasoning choices and, separately, the current and proposed binding for each role:

- `poteto-agent`: implements or performs helper work delegated by the parent.
- `comment-sicko`: inspects comments and reports findings; the parent makes changes.

Display panel candidates, reviewer seats and cross-judge order separately if the corresponding workflows are installed and available. This core setup has no panel seats; report them as unavailable rather than claiming a single persona runs a panel or counting a fallback list as seats. Keep explicit prior choices unless the operator changes them. Discuss the upstream small/medium/large budget idea as medium/high/xhigh targets, not as automatic defaults: choose only levels the actual model supports. An explicit `inherit-parent` choice with thinking `inherit` uses the parent model instead of guessing a default. Choose `default` for model-managed reasoning where no level is requested.

## 3. Confirm, stop, and save

Show the complete proposed role table (exact selectors, reasoning, and each available seat), and ask whether to confirm, change a choice, or cancel. Do not save or generate anything without explicit confirmation. Cancel leaves the existing bindings and generated resources unchanged.

Before writing, stop all pstack sessions using this package, including this setup session. Give the operator the exact proposal and command to execute outside the stopped sessions. Save the proposal separately as JSON, keyed by role, with one `model` and `thinking` per role. For example, if the operator explicitly confirms parent inheritance for both roles:

```json
{
  "poteto-agent": {"model":"inherit-parent","thinking":"inherit"},
  "comment-sicko": {"model":"inherit-parent","thinking":"inherit"}
}
```

From the toolkit root run `bun run pstack:setup -- --confirm <proposal.json> --catalog <omp-models.json>`. For cancellation, `bun run pstack:setup -- --cancel` records no setting and changes no files. If validation fails, repeat the proposal/confirmation step with the corrected choices. Nothing changes OMP's global or project model settings.

## 4. Start a new session

After a successful command, start a new pstack session using this package and call native task by agent name; do not add a per-call model. Check the actual model and reasoning before reporting success. This is a restart procedure, not same-session hot loading or forced shutdown detection.

If the project lacks a way to prove behavior, offer a project-local verification skill or a formal verification skill only if that method is available in the delivered Suite. Do not install one without agreement.
