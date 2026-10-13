# 02 — public binding, actions and lifecycle: automated evidence

Ticket: [`implementation/02-public-binding-actions.md`](../implementation/02-public-binding-actions.md) (P28, P56).
Recorded 2026-10-13 from this session's own tool results. Every line below is an executed command and its
observed result; nothing here is a support claim, a real-provider result or a visual acceptance.

## Commands actually run

| Command | Result |
| --- | --- |
| `bun run typecheck` | 0 errors |
| `bun test tests/framework` | 285 pass / 0 fail (26 files) at the point of that run; 27 framework cases added by this ticket in total (13 + 14), plus one dock case |
| `bun test tests/framework/actions-routing.test.ts` | 13 pass / 0 fail |
| `bun test tests/framework/implementation-lifecycle.test.ts` | 14 pass / 0 fail |
| `bun test tests/connect-bot tests/codebase-tools` | 166 pass / 2 fail — the two failures are the pre-existing `connect-bot` panel cases (`budget-regression.test.ts` frozen-protocol, 20.2s; `panel-registration-lifecycle.test.ts` unregister window, 15.0s), the same two ticket 01's retrospective recorded as failing before this change |
| `bun test tests/harness-dock/binding-lifecycle.test.ts` | 1 pass / 0 fail, 3.0s (isolated install, real loader, real RPC session) |
| `bun test tests/harness-dock/baseline.test.ts` | 4 pass / 2 fail — the pre-existing anchor-drift pair (checkout revision anchor; artifact byte-identity) |
| `bun test` (whole repository) | 471 pass / 4 fail, 475 tests across 57 files (115.8s) — the four failures are exactly the pre-existing set above (2 baseline anchor-drift + 2 connect-bot panel), which ticket 01's retrospective recorded as failing before this change (443 pass / 4 fail of 447) |

## What the isolated real-host dock run observed (S5)

The fixture [`tests/harness-dock/fixtures/binding-lifecycle/entrypoint.ts`](../../tests/harness-dock/fixtures/binding-lifecycle/entrypoint.ts)
is a real extension assembled through `ompAdapter` + `factory`, with its own `config.yaml`, loaded by the
recorded 18.5.0 install's own loader under a temporary agent state, session directory and working directory.
The run observed, in one session:

- the factory received the validated configuration value from that file (`loaded config=dock-lifecycle` on
  stderr), so the file was read and validated before the factory ran;
- the first model request took `≥1500 ms` — the fixture's initialization duration — and the captured
  outbound request exists, so the wait was a real request waiting, not an unused path;
- `/lifecycle-probe` (empty) and `/lifecycle-probe wat` both produced the same help on the session's
  operator channel, at `info` and `error` respectively, and ran no action;
- `/lifecycle-probe watch` took `≥250 ms` — the action's own duration — and the host's command chain
  returned after `action finished`;
- the harness's shutdown ran `cleanup` exactly once (`exitCode 0`, one stderr line).

## Fault injections (are the new tests sensitive?)

Each fault was injected, the failure observed, and the fault reverted; the suites were green again after
every revert. The dock check is the one that carries the "the request waits" claim in a real host.

| Injected fault | Observed |
| --- | --- |
| `actions` routing matches by `startsWith` (abbreviation accepted) | `actions-routing.test.ts`: the abbreviation/extra-argument/undeclared-word case fails |
| `initializationPending` returns `undefined` (no waiting) | `implementation-lifecycle.test.ts`: the first-request case fails; the dock case fails at `turnMs` 86 ms vs the required `≥1500 ms` |
| `cleanupImplementation` guard removed (cleanup runs per delivery) | `implementation-lifecycle.test.ts`: the "second end cleans nothing again" case fails |
| the post-cleanup delivery switch left open | `implementation-lifecycle.test.ts`: the "after the cleanup the binding stops delivering" case fails |

## Not verified here

- No real provider, credential or visual check was performed or claimed; every permanent test's network is
  mocked or local (`capture-server.ts`), and the dock's provider is a local capture endpoint.
- No human-led check (H1/H2) belongs to this ticket's promises; the contract's H3 clause is conditional on
  this ticket's real-host script failing repeatedly or being too costly, and the dock run succeeded.
- The rest of the assembly target (HTTP/files modules, range subscriptions, Viewed session projection, pi
  adapter, remaining consumer migration) is out of this ticket and unimplemented.

## Retry round (same day, independent re-examination of the lifecycle criterion)

Focus of this round: distinguish an ordinary session switch from the CLI implementation's disposal; prove the
same instance stays usable and that only a real disposal cleans it; and confirm that, with the harness unable
to unregister its hooks, the stop-delivery switch holds and every removable resource is released.

### Three defects the first round did not cover, found test-first

1. **The cleanup never ran after an ordinary switch (P56).** `binding.ts` ran the one cleanup only when the
   disposing session's owner key equalled the owner that *initialized* the instance. A switch delivers
   `session_end(transferred)` for the session being left and `session_start` for the one taking over, so after
   any switch the process's shutdown (`session_shutdown` → `session_end(disposed)` naming the *current*
   session) matched nothing: the extension's `cleanup` never ran and its instance was never released. Fixed by
   recording the owner the implementation *serves* on every owner-session delivery
   ([`lifecycle.ts#L67`](../../../framework/behaviors/lifecycle.ts#L67), set at
   [`lifecycle.ts#L98`](../../../framework/behaviors/lifecycle.ts#L98)) and matching the disposal against it
   ([`binding.ts#L350`](../../../framework/behaviors/binding.ts#L350)). A subagent delivery (`inherited`) still
   never initializes and never matches, so a child's traffic cannot tear down the CLI's instance.
2. **A disposed instance could be handed to a later binding (P56).** `ompAdapter` memoized with
   `implementation ??=`, so a binding arriving after the instance's cleanup received the spent object and the
   extension ran against closed resources, with `initialize` never called again. Fixed by
   `isImplementationDisposed` ([`lifecycle.ts#L78`](../../../framework/behaviors/lifecycle.ts#L78)) and the
   adapter rebuilding when the memoized instance is spent ([`omp.ts#L795`](../../../framework/adapters/omp.ts#L795)).
3. **A command could still reach the extension after its cleanup (P56).** The stop-delivery switch covered
   events, round edges and run initiations, but the injected implementations of `directed`/`actions` commands
   were still reached through the host's registration — a registration the harness cannot withdraw. Those two
   paths are now answered by the same switch ([`binding.ts#L416`](../../../framework/behaviors/binding.ts#L416),
   [`binding.ts#L427`](../../../framework/behaviors/binding.ts#L427)); the framework's own local State path
   (`toggle`) stays reachable, which is the behaviour the session suite already records.

Docs updated to the corrected rule: [`framework/GLOSSARY.md`](../../../framework/GLOSSARY.md#L127) (Implementation
lifecycle), [`framework/docs/framework-capabilities.md`](../../../framework/docs/framework-capabilities.md#L260)
(cleanup paragraph) and the same file's adapter-memo paragraph, [`framework/README.md`](../../../framework/README.md#L29)
and the ADR's implementation-status record; the doc's line anchors for the files this round touched were resynced.

### Tests added this round, at the approved seams (S1, S5)

| Seam | Case | What it proves |
| --- | --- | --- |
| S1, controlled adapter (`portDouble`) | `implementation-lifecycle.test.ts` → "an ordinary switch moves the owner, and the disposal that follows cleans once" | switch → no cleanup; the disposal of the served owner → exactly one, and a repeat cleans nothing again |
| S1, controlled adapter | "the one instance keeps serving the session that takes over" | after `transferred` + `start(new)`: the same instance's action runs for the new owner, its session subscription saw it, the run initiation still carries the contribution, the factory ran once, no cleanup |
| S1, controlled adapter | "a command no longer reaches the extension once its disposal ran" | the injected action is not reached after the cleanup, and nothing is published for the dead invocation |
| S1, controlled adapter | "a subagent's session end is never the instance's disposal" | an `inherited` session's disposed end cleans nothing |
| S1, production adapter + loader double | "a binding after the instance's disposal builds and initializes a fresh one" | the spent instance is not reused: the factory, `initialize` and the action all run again on a new instance across two session loads of one adapter |
| S5, isolated real host | `binding-lifecycle.test.ts` → "an ordinary switch keeps the one instance, and the shutdown cleans it once" | one real run: no outbound request before the first prompt; one factory call and one initialization; model change, effort change, a tree `branch`, a switch back and a `new_session` all keep the same instance working; the shutdown cleans it exactly once while a *switched-to* session is the one being served |

### Fault injections (is the new coverage sensitive?)

Injected, observed, reverted, green again after every revert:

| Injected fault | Observed |
| --- | --- |
| the served owner is recorded only when the instance first initializes (the first round's rule) | framework: "an ordinary switch moves the owner…" fails (0 vs 1); dock: the run's `cleanup instance=1` count is **0** at exit instead of 1 — the real host's own evidence of defect 1 |
| a `transferred` end stops the binding's delivery | framework: "the one instance keeps serving…" fails (the new owner's action and session subscription never land) |
| the `owner` kind guard is dropped from the disposal match | framework: "a subagent's session end is never the instance's disposal" fails alone |
| (first round, unchanged) `startsWith` matching, `initializationPending` cleared, cleanup guard removed, post-cleanup switch opened | as recorded above |

### Commands and results this round

| Command | Result |
| --- | --- |
| `bun run typecheck` | 0 errors (after each step) |
| `bun test tests/framework` | 290 pass / 0 fail, 26 files, 10.5s (the last case added afterwards passes in the focused run below) |
| `bun test tests/framework/implementation-lifecycle.test.ts` | 19 pass / 0 fail |
| `bun test tests/harness-dock/binding-lifecycle.test.ts` | 2 pass / 0 fail, 5.8s (real loader, real RPC session, isolated install/config/work/session roots) |
| `bun test tests/connect-bot/request-timeout.test.ts` | 10 pass / 0 fail, 15.3s (re-run alone after a contended whole-repo run had failed it) |
| `bun test` (whole repository, idle) | **477 pass / 4 fail**, 481 tests, 57 files, 118.8s — the four are exactly the pre-existing set (2 connect-bot panel cases, 2 baseline anchor/byte-identity), the same four the first round and ticket 01's retrospective recorded |

### Still not verified

- No real provider, credential or visual check; every permanent test's network is mocked or the dock's local
  capture endpoint.
- P58 (consumer migration behaviour) and P52 (persistent documents) belong to their own tickets; this round
  exercised P56/P28 only.
- H1/H2 and the contract's conditional H3 remain with the user: the dock runs succeeded, so the H3 fallback was
  not triggered.
- The harness has no way to unregister a subscription (`on(...)` returns nothing for the lifecycle events this
  adapter uses), so the stop-delivery switch is what holds after a disposal; the framework-held resources that
  *can* be released are released (the owner's State cell is deleted and every retained capability's revoker
  fires at that end — see `owner-capability.test.ts`).

