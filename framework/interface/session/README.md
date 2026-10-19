# Session capability

This is the extension's Session reading map. Import Session types from `framework/interface/session`;
obtain the capability from the implementation factory's `context.session`. No Session constructor,
observation writer, transport, or native harness context is part of this interface.

## Read, observe, state a confirmed write

| Need | Contract | Read next |
| --- | --- | --- |
| Identify an actual session, its direct parent, name or startup facts | `SessionFacts`, `SessionStartup` | [facts.ts](facts.ts) |
| Read observations collected before attaching, or the latest observation now | `SessionCapability.observations`, `SessionObservationReader`, `SessionObservation` | [observation.ts](observation.ts) |
| Declare owner-only or all-actual-session observations | `SubscriptionGroup`, `ObservationScope`, `SemanticEventHandlers` | [events.ts](events.ts) |
| Observe entering/leaving a session or updated facts | `SessionEventDelivery` | [events.ts](events.ts) |
| Observe periods of agent activity and their close-out | `RoundDelivery`, `RoundEnding`, `CloseOutWait` | [round.ts](round.ts) |
| Observe model request/response cycles | `TurnStartDelivery`, `TurnEndDelivery`, `TurnUsage` | [turn.ts](turn.ts) |
| Observe current Working/Idle | `SessionActivityDelivery` | [activity.ts](activity.ts) |
| Observe conversation context readings | `SessionContextDelivery`, `SessionContextReading` | [context.ts](context.ts) |
| Observe user-attributed input | `UserInputDelivery` | [input.ts](input.ts) |
| State or observe a confirmed storage write | `SessionCapability.recordCommit`, `SessionCommitDelivery` | [commit.ts](commit.ts), [observation.ts](observation.ts) |
| Observe a reading becoming unavailable | `SessionUnobservedDelivery` | [unobserved.ts](unobserved.ts) |

The index exports types owned here, not aliases for declarations owned by an internal engine.
State authority and feedback carried by deliveries use the neighboring [State](../state/index.ts)
and [Feedback](../feedback/index.ts) contracts; Turn prices and response facts use
[Host facts](../host-facts/index.ts). These supporting declarations do not expose their implementations.

## Factory and subscriptions

The factory receives `context.session` and returns the implementation's `subscriptions` alongside
its other declarations. There is no separate subscription engine on the observation reader.
For a complete consumer, see model-cost's [shared runtime](../../../extensions/model-cost/shared-logic/runtime.ts)
and its [pi assembly](../../../extensions/model-cost/harnesses/pi.ts): the assembly hands the factory's
capability to the shared runtime, which reads observations and declares its business handlers.

Other capability authoring contracts have not all moved: `framework/public` remains the authoring
entry, but no longer exports Session types.

## Invariants a consumer relies on

- **Actual session is not Owner or Viewed session.** A subagent delivery names that subagent and
  its direct parent. Its Owner is the top-level main session; its display name is never an identity.
  A startup model/effort is reported only where a beginning was established, not reconstructed later.
- **Unknown is not zero or Idle.** An unobserved session has no observation. An absent context or
  activity reading stays absent. A reported zero is a measurement; an unavailable reading is not.
- **Reads are current, not subscriptions or persistence.** `read` and `snapshot` return isolated
  readings of what the source holds now. Keeping or modifying a returned object cannot write back
  into the source. A retained reading does not update itself; read again for a later value.
- **One dispatch, declared scope.** An implementation supplies `subscriptions` once. `owner` admits
  the owner's own deliveries; `session` admits every actual session the adapter reports. A wider
  observation scope grants no extra State write authority. Framework processing precedes handlers.
- **Independent event kinds.** Entering a session is not starting a Round; a Round can contain
  several Turns, and tool execution is outside a Turn. Activity is derived from Round transitions,
  not independently inferred by the extension. Repeated unchanged observations do not publish changes.
- **Handlers and errors.** Ordinary dispatch invokes handlers in declaration order, contains their
  throws/rejections through the adapter diagnostic channel, and does not wait for asynchronous work.
  A disposal close-out is the exception: its Round end waits for handlers within the bounded wait
  described by `CloseOutWait`. A consumer must not assume every event is an asynchronous barrier.
- **Commit is a statement, not a save.** Call `recordCommit(sessionId)` only after the session's own
  process confirmed its write. It saves no document and carries no business content. An unknown
  session identity records nothing. A `session_commit` consumer reads shared storage itself rather
  than treating the count as business data. Transport selection and source bookkeeping are internal.
- **Unavailable is not disposed.** Losing a reading source withdraws its live readings and produces
  `session_unobserved`; it does not establish Idle, finish a Round, mint a Turn or erase saved work.
- **Disposal is not another extension event.** The adapter reports the actual session's end to the
  framework. The extension observes the existing session and Round contracts: a transfer is not a
  disposal, a close-out confirms or truncates the Round of that actual session, and a wait that ends
  does not cancel work already publishing. Do not subscribe to an invented `session_disposal` kind.

## What stays behind this seam

Observation admission and withdrawal, source order, identity synthesis, Turn association and dedup,
Round end confirmation, Local access, and close-out coordination belong to the deep implementation.
Extension code must not import `core/observations`, `core/protocol`, Session behavior modules, or a
constructor through another public entry. Import checks enforce this engineering constraint; it is
not a security sandbox for arbitrary code executing in the same process.

Internal tests may still drive internal seams. Consumer tests should supply the capability or drive
framework facts through an adapter, never recover a writer from the object the factory receives.
