# Static authoring expression check

The authoring linter checks whether extension integration declarations use the supported static expression language. It does not execute extension modules, business-state constructors or handlers. It is not the full integration-dependency checker and does not certify semantic correctness, harness compatibility or adapter wiring.

## Commands and development gate

```sh
bun run check:authoring
bun run check:authoring --json
bun run check:authoring --rules
bun run check:authoring --rules --json
bun run check:authoring extensions/model-cost/harnesses/pi.ts
bun run typecheck
```

The default source scope is `extensions/`; framework helper implementations and test fixtures are not themselves extension authoring roots. Source references needed to resolve declarations are followed without importing or executing them. A selected-file scan checks that selection, not the entire repository. `--root <directory>` selects another project root, particularly for isolated fixtures; positional files are relative to that root.

Exit codes are **0** for a clean scan, **1** for rule diagnostics, and **2** for invocation or infrastructure failure. Unsupported or unresolved integration structure must not silently count as clean. This development gate does not alter extension runtime loading. `check:integrations` separately derives interface dependencies and compares actual adapter supply; `generate:integrations` creates missing implementation references. Their commands, options, exit codes and precise boundaries are in [static integration check](integration-check.md); neither integration result follows merely from an authoring-lint pass.

`typecheck` runs the repository's TypeScript 7 compiler explicitly, followed by the authoring linter. The linter uses the pinned `typescript-compiler` alias for the TypeScript 5.9 Compiler API, because the installed TypeScript 7 package does not export that API. The explicit compiler path prevents the alias package's `tsc` binary from changing the project's compiler selection.

## Rule catalog: complete explanations, compact diagnostics

The authoritative rule records live in [`scripts/authoring/rules.ts`](../../scripts/authoring/rules.ts). Each record has a stable ID, title, reason, allowed and disallowed examples, a repair direction and potential impact. `--rules` renders these same records; there is no independently maintained second catalog of rule wording.

Normal findings contain only the rule ID, relative source file, one-based line and column, concrete problem and context-specific repair suggestion. JSON output contains `stage`, `complete`, `filesChecked`, `declarationsChecked` and `diagnostics`; each diagnostic contains `ruleId`, `file`, `line`, `column`, `message` and `suggestion`. Results are deterministic so agents can compare successive scans.

## Expression boundary

The checker distinguishes integration structure from business implementation. Subscription arrays, observation scopes, event keys, command/action maps, tool arrays with their names and execution handlers, and lifecycle slots must be statically recoverable. Business function bodies may contain conditions, loops, async work and ordinary helper calls; this linter does not evaluate their behavior.

Static literals and resolvable constant/import references can compose declarations. Parentheses, `as const` and `satisfies` do not by themselves make a declaration dynamic. A spread is not inherently forbidden: its operand must be statically recoverable. Shared authoring wrappers must resolve to the canonical framework entry and use supported parameter forwarding and explicit defaults. Arbitrary computation of integration structure is outside the language and must be diagnosed rather than evaluated. Read the catalog for the precise rule and repair guidance associated with a finding.

Shared wrappers use simple identifier parameters and one unconditional final return, optionally preceded by static bindings or function declarations; conditional return selection, rest/destructured parameters and spread arguments are diagnosed. Structural mutations through ordinary aliases and destructured declaration views are checked. Passing declaration-backed structures into opaque helpers is unresolved rather than assumed safe, since those helpers may mutate the structure. This is deliberately not an interprocedural proof of arbitrary helper behavior.

This is a restricted source-language checker, not a JavaScript interpreter or a sandbox. TypeScript still owns ordinary type checking. Neither brands nor this checker promise to defeat arbitrary adversarial code; source coverage and unresolved paths remain explicit. The dependency checker reuses the static resolver but must not interpret an expression-lint pass alone as proof that all interface usage or port obligations were analyzed.

## Agent repair loop

1. Run the scanner and use the compact diagnostic to locate the expression.
2. Consult the corresponding full rule if its rationale or impact matters.
3. Change the representation while preserving event sets, scope, callbacks, command/action identity and lifecycle behavior.
4. Re-run the scanner and TypeScript checking, then exercise behavior affected by the refactor.
5. Repeat until the intended source scope is clean; report semantic uncertainty rather than hiding it.

The checker does not rewrite code. Do not remove required functionality, replace handlers with no-ops, hide structure behind assertions or suppress findings merely to obtain a clean report. In particular, moving conditional registration into a handler can change which framework paths are installed: it is not automatically a behavior-preserving fix. A static pass proves conformance to the implemented expression rules in the scanned scope, not preservation of business behavior.

## Related contracts

- [Static integration check](integration-check.md)
- [Capability interface architecture](capability-interface-architecture.md)
- [Contract-driven harness upgrade pre-review](harness-support.md#contract-driven-agent-pre-review)
