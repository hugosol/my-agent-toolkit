# 05 — per-actual-session Turn facts: automated evidence

Ticket: [`implementation/05-actual-session-turn-facts.md`](../implementation/05-actual-session-turn-facts.md) (P57).
Recorded 2026-10-13 from this session's own tool results. Every line below is an executed command and its
observed result; nothing here is a support claim, a real-provider result or a visual acceptance. The real-host
runs use the dock's local capture endpoint, never a provider.

## What was delivered

The public seam S1 gained the per-actual-session fact set and the Turn axis, and the OMP adapter maps the
native facts into it:

| Delivered | Where |
| --- | --- |
| `ObservationScope`, `SubscriptionGroup`; `ExtensionImplementation.subscriptions` replaces `events` | [`protocol.ts`](../../../framework/core/protocol.ts), [`assembly.ts`](../../../framework/core/assembly.ts), [`subscriptions.ts`](../../../framework/behaviors/subscriptions.ts) |
| `SessionFacts` (identity, kind, direct parent, latest name, `unavailable`) on session, round and Turn deliveries | [`protocol.ts`](../../../framework/core/protocol.ts), [`omp.ts`](../../../framework/adapters/omp.ts) |
| `TurnEvent`/`TurnStartFacts`/`TurnEndFacts`/`TurnUsage`/`TurnOutcome`/`ProviderHttpFacts`; `TurnSignal`/`TurnSignalFacts`/`HarnessPort.onTurn` | [`protocol.ts`](../../../framework/core/protocol.ts) |
| Turn identity, in-flight association, normal dedup, conflict and unavailability rules | [`turn-events.ts`](../../../framework/behaviors/turn-events.ts) |
| Round identities per actual session (what a Turn names as its round) | [`round-events.ts`](../../../framework/behaviors/round-events.ts) |
| The extension's own catalog, queried once per request start | [`assembly.ts`](../../../framework/core/assembly.ts), [`turn-events.ts`](../../../framework/behaviors/turn-events.ts) |
| Native mapping: request hook, response boundary, finalized assistant message; the harness's own `turn_end` deliberately unsubscribed | [`omp.ts`](../../../framework/adapters/omp.ts) |
| Callers migrated to the new public shape (connect-bot's assembly, every framework suite that declared `events`) | [`extensions/connect-bot/harnesses/omp.ts`](../../../extensions/connect-bot/harnesses/omp.ts), `tests/framework/*` |

This pass closes the two gaps the previous hand-off named: the real host now runs a **delegating** session and a
**tool-executing** session, and the two incidental registration assertions are gone, replaced by behaviour.

| Added in this pass | Where |
| --- | --- |
| A real delegating run: the main session spawns a real subagent, which spawns a real grandchild | [`tests/harness-dock/turn-facts.test.ts`](../../../tests/harness-dock/turn-facts.test.ts) (3rd of 3 tests) |
| A real tool run: the harness's own `turn_end`, carrying that tool's result, observed between two Turns | [`tests/harness-dock/turn-facts.test.ts`](../../../tests/harness-dock/turn-facts.test.ts) (2nd of 3 tests) |
| The native boundary observed directly, so the ordering above is about real events | [`tests/harness-dock/fixtures/turn-facts/native-observer.ts`](../../../tests/harness-dock/fixtures/turn-facts/native-observer.ts) |
| The delivery records the actual session on both edges, and each Turn's session-level unavailability | [`tests/harness-dock/fixtures/turn-facts/entrypoint.ts`](../../../tests/harness-dock/fixtures/turn-facts/entrypoint.ts) |
| Replaced claims: the adapter's native hook names, and the port's `onTurn` registration, are no longer asserted | [`turn.test.ts`](../../../tests/framework/turn.test.ts), [`turn-facts.test.ts`](../../../tests/framework/turn-facts.test.ts) |

The two replacements are behavioural, not a rename: `turn.test.ts` now drives a tool-requesting response, the
native `turn_end` the harness raises for it, and the follow-up request (asserting the first Turn ended at the
response, that the native boundary changed nothing, and that the follow-up is a Turn with an identity of its
own); `turn-facts.test.ts` now asserts that a Turn delivery reaches only the group that declared the Turn axis.

## Commands actually run

| Command | Result |
| --- | --- |
| `bun run typecheck` | 0 errors (final, after every edit) |
| `bun test tests/framework` | **363 pass / 0 fail, 31 files** — one fewer than the previous hand-off's 364 because the subsumed tool response case and its registration assertion were replaced by the two cases above |
| `bun test tests/framework/turn.test.ts tests/framework/turn-facts.test.ts` | 32 pass / 0 fail (10 + 22) |
| `bun test tests/harness-dock/turn-facts.test.ts` | **3 pass / 0 fail, ~4.2 s**, 80 assertions — three real RPC runs against the recorded 18.5.0 install |
| `bun test tests/harness-dock` | **23 pass / 2 fail of 25, 6 files, 16.8 s.** The two failures are `baseline.test.ts`'s anchor comparisons against the sibling `../oh-my-pi` checkout, which this repository's own record already notes has moved on from the approved anchor; nothing in this ticket's files is involved (they compare `extensibility/extensions/*.ts` and `config/model-registry.ts` in that checkout). No `turn-facts` case failed |
| `bun test tests/connect-bot tests/codebase-tools` | 166 pass / 2 fail of 168, 26 files — the two failures are exactly the pre-existing connect-bot panel cases the ticket-02 evidence already recorded (P23 frozen protocol, 20.2 s; P25 unregister window, 15.0 s). The `subscriptions` migration added no consumer failure |

## What the isolated real-host runs observed (S5)

Each run loads [`tests/harness-dock/fixtures/turn-facts/entrypoint.ts`](../../../tests/harness-dock/fixtures/turn-facts/entrypoint.ts)
through the recorded 18.5.0 install's own loader, under a temporary agent state (with `async.enabled=false`, so
an RPC host's delegation blocks the way this dock can observe it), session directory and working directory,
with the local capture endpoint answering every model request.

**One ordinary request** (unchanged from the previous pass): a session-scoped `session_start`, `turn_start` on
both scopes with the same `turnId`, the request's own provider/model/round/start time, and the fixture
catalog's price; `turn_end` repeating that identity with `outcome=completed`, usage
`{input: 7, output: 7, cacheRead: 3, cacheWrite: 0, totalTokens: 17}` hand-derived from the endpoint's own wire
numbers, `status: 200`, `providerRequestId="capture-1"` and `providerResponseId="chatcmpl-dock"` carried apart,
`unavailable: []`, a clean exit and exactly one captured request.

**A delegating run.** The scripted model answers each session by the opening message that session was started
with — never by arrival order. The main session's first response calls the host's own `task` tool; the subagent
it spawns does the same; the grandchild yields; the child yields; the main session answers in prose. Observed
from the extension's own stderr:

- three `session_start` boundaries with `kind` `main`, `sub`, `sub`, three distinct session ids, the child's
  `parentSessionId` = the main session's id and the grandchild's = the child's — one hop, never the top-level;
- `ownerKind` `owner`, `inherited`, `inherited` — a subagent's delivery resolves to the owner it inherits;
- five Turn starts and five ends (one per captured model request, and the captured requests are five), every
  end repeating an identity the same actual session started, no two identities equal;
- the three sessions never sharing a round identity;
- the main session's name, set through the host's own `set_session_name` command after it started, carried by
  its Turns while the boundary that saw it start had none; the subagents reporting `name: null` with
  `sessionUnavailable: ["session name"]` rather than borrowing the owner's name;
- every end carrying the endpoint's reported usage, `unavailable: []`, and the response's own
  `providerRequestId` (`capture-1`…`capture-5`, one per request) distinct from `providerResponseId` and from the
  Turn's identity;
- every `owner`-scoped line naming the main session, while the `session`-scoped group saw all three;
- exit code 0 and no "no Turn in flight"/"dropped" diagnostic.

**A tool run.** The main session's first response asks for the host's own `bash` tool; the tool runs; the
follow-up request answers in prose. Observed:

- two captured requests for one prompt, the second carrying the tool's result the first could not have;
- exactly two Turns, with two distinct identities, each end repeating its own start's;
- the harness's own `turn_end`, reported by [`native-observer.ts`](../../../tests/harness-dock/fixtures/turn-facts/native-observer.ts)
  with `tools=1` — the event carrying that tool's result — falling strictly **after** the first Turn's end and
  strictly **before** the second Turn's start.

That last ordering is the production evidence for "工具在 Turn 外": the Turn ends at the response, the tool
executes wholly outside it, and the tool's execution neither ends a Turn nor begins one.

## Fault injections (are the tests sensitive?)

Each fault was injected, the failure observed, and the fault reverted; the suites were green again after every
revert.

| Injected fault | Observed |
| --- | --- |
| The adapter resolves every actual session as a top-level `main` with no direct parent | `tests/harness-dock/turn-facts.test.ts`: the delegating case fails (`["main","main","main"]` where `["main","sub","sub"]` is required); the other two cases still pass, so the failure is the identity/parent claim |
| The old blanket owner gate restored in `admits()` (`owner.kind !== "unresolved"`) | `tests/framework/subscription-scope.test.ts` + `tests/framework/turn-facts.test.ts`: the owner-scope cases fail (owner group moved by a subagent's boundary, round and Turn) |
| A `toolUse` response no longer settles its Turn (the end deferred until the tools ran) | `tests/framework/turn.test.ts`: the tool-cycle case fails; `tests/harness-dock/turn-facts.test.ts`: the delegating and tool cases fail (the second request becomes an in-flight conflict) |

## Not verified here / limitations

- **No real provider, credential or visual check.** Every permanent network use is the dock's local capture
  endpoint; the ids and usage it reports are fixture facts, not a provider's. The subagents and the tool are the
  host's own, but they run on that same fixture model.
- **The delegating run's shape is scripted.** The request count (five) and the per-session Turn counts follow
  from the scripted answers plus the host's own `yield` handling; the assertions that matter (identity, direct
  parent, association, owner isolation, usage, ids) do not depend on that count.
- **No native hook is subscribed by production code for evidence.** The `turn_end` ordering is observed by a
  separate dock fixture that uses the harness API directly; it publishes nothing to the framework.
- H1/H2 and the contract's conditional H3 remain with the user; this ticket's real-host scripts succeeded, so
  the H3 fallback was not triggered.
- `framework/docs/framework-capabilities.md`'s `protocol.ts` line anchors were resynced for the rows and
  sections this ticket rewrote; anchors in untouched rows still carry their pre-change line numbers and are
  stale by the size of the insertions this ticket made.
