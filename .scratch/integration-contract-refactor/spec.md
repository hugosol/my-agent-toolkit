# Integration contract architecture refactor

Status: completed

## Confirmed scope

Refactor the code architecture before implementing the integration checker. Keep one framework-owned `HarnessPort` and the extension-facing `framework/interface` seam. Preserve current binding behavior, extension accounting, initialization/cleanup, observation scopes and adapter native mappings.

1. Extract framework registration/dependency selection into a side-effect-free shared planner. Runtime binding consumes it; a future checker can consume the same dependency rules without executing extension code.
2. Introduce one canonical typed implementation-authoring entry. Make subscription event keys, scopes, command slots and lifecycle slots inspectable separately from lazy creation of business state. Runtime materialization must use that structure; do not maintain a parallel manual requirement inventory.
3. Migrate all existing extension assemblies and affected consumers. Do not keep a parallel raw-factory assembly path or compatibility alias.
4. Keep the previously agreed contract-driven upgrade pre-review guide and mapping-rationale policy.

## Deferred checker work (explicitly not implemented here)

- Extract all possible framework-mediated calls, declarations, subscriptions and reads without configuration evaluation or path-sensitive branch exploration.
- Expand demand through framework semantic rules into minimal integration contracts, port and delivery obligations; compare actual target implementation and wiring.
- Demand-only operation requires no adapter or discovery entry. Target comparison does not require a previously working reference harness.
- Enforce a small statically analyzable authoring language: permitted entrypoints, static event keys and scopes, permitted references/composition, and diagnostics for dynamic/unresolvable shapes. Business function bodies remain unrestricted. TypeScript typing alone cannot enforce object-literal syntax or prohibit arbitrary dynamic composition; no AST enforcement is added in this refactor.
- Determine required/optional intent explicitly rather than interpreting optional port syntax as extension policy. Gather the full possible dependency set, report optional absences, and distinguish known required gaps from unresolved analysis.
- Required gaps or unresolved analysis return nonzero; optional-only absence does not. Diagnostics never affect extension loading; developers decide whether to accept risk.
- Preserve origins, dependency paths and implementation locations in diagnostics. Structural completeness never certifies semantic correctness.

## Non-goals

No checker implementation, code generation, editor plugin, automatic upgrade reviewer, runtime compatibility scan/refusal, multi-version interface mechanism, adapter registry/materializer, per-extension port interface or unrelated behavior fixes. Native widget integration remains outside the inventory. Existing offline subagent declaration checks continue unchanged until their own cutover.

## Acceptance

- Runtime hook selection uses shared pure rules, including current transitive Turn/Activity/Context-to-Round dependencies and initialization/cleanup-to-run-initiation behavior.
- Authoring structure can be inspected without creating business state, reading config or invoking native APIs.
- Setup remains lazy, shared per extension process, and rebuilt after disposal; command delivery and ordinary event versus awaitable lifecycle behavior stay unchanged.
- Every current assembly and affected test/support consumer uses the new canonical authoring contract where it crosses the public assembly seam.
- Type checking and repository tests run on the assembled tree; actual exported authoring and planning paths receive a smoke exercise beyond tests. Any environment or real-host verification limitations are reported precisely.

## Delivered and verified

- `framework/behaviors/integration-plan.ts` now owns the pure runtime selection rules and port-obligation provenance; `binding.ts` consumes the plan.
- `defineImplementation` is the canonical root authoring entry; assemblies use `implementation`, not raw `factory`. Its static `.declaration` is the same structure used to materialize handlers around lazy business state. The opaque brand survives assembly type erasure. All existing public assembly consumers were migrated; low-level internal binding tests retain an internal resolver seam.
- Model-cost's shared authored declaration selects business methods rather than returning a dynamic implementation map. Connect-bot uses static scoped handlers. Native widget lifecycle and adapter mappings remain in their existing owners.
- Typecheck: `bun run typecheck`, exit 0 on the final code.
- Final full run: `bun run test`, exit 0; **1446 pass, 0 fail**, 159 files, 8559 assertions. This run includes real-host dock scenarios.
- Existing declaration diagnostic: `bun run check:integrations --json`, exit 0, all five actual entries complete. This remains the old subagent declaration check, not the deferred analyzer.
- Standalone smoke (temporary script removed after execution): inspecting an authored Turn subscription and cleanup slot produced Round/Turn/run-initiation obligations with **zero business-state creations**. An actual isolated OMP loader/RPC session then observed validated configuration, one instance, a completed local-provider request after **1573 ms** initialization wait, an asynchronous command after **252 ms**, exactly one cleanup and exit 0. Only the local capture provider was used; this is not real-service or visual TUI acceptance.
- Intermediate runs caught and corrected state-first handler migration defects. The first serial dock run had 108 passing tests and two setup failures from an incomplete local `18.5.0-codex-response-boundary` cache. Installing that prefix's pinned dependencies and applying the existing frozen patch restored it; both affected files then passed (7 tests), followed by the successful full run. No baseline or frozen patch record was changed.
- Documentation targets were checked. Source-level authoring restrictions and the broader dependency checker remain deferred exactly as listed above.
