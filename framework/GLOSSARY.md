# Semantic Extension Framework

The cross-harness framework: my-agent-toolkit maintains one in-repository framework source tree for replacement extensions containing semantic behaviors and pi/oh-my-pi adapters. A standalone extension generator is a possible later distribution feature, not part of the initial framework.

## Language

**Semantic extension framework（语义扩展框架）**:
The shared harness foundation that owns extension behavior contracts and their mappings to supported harnesses.
_Avoid_: standalone generated extension, copy-pasted template, native API wrapper

**Harness（宿主）**:
The program that discovers and runs extensions and exposes the native capability surface they adapt to; the supported harnesses are `pi` and `oh-my-pi`. A harness is distinct from an agent session (`ctx.agent`) and its subagents.
_Avoid_: agent runtime (legacy name), host (ambiguous with OS/process host), agent, platform

**Framework capability（框架能力）**:
An extension-facing ability whose harness facts, effects or lifecycle integration depend on an adapter. A framework-owned implementation can supply its semantics; dependence on adapter integration, rather than the existence of a public interface, distinguishes it from a framework general module.
_Avoid_: every public function, General capability, native harness API

**Framework general module（框架通用模块）**:
A framework-provided function module whose implementation does not depend on a harness adapter, such as HTTP requests or coordinated file updates. General groups these modules for navigation; it is not itself a capability.
_Avoid_: adapter-backed capability, injected General capability

**Subagent integration mode（子代理接入模式）**:
The supported shape of one extension entry’s session integration: subagent mode includes integrated subagent observations, while no-subagent mode（无子代理模式）provides main-session functionality without that integration. It does not assert that the harness contains no subagents, describe whether an agent is working, or represent an extension State value. An integration failure is not a normal no-subagent mode.
_Avoid_: installed-package flag, connection-in-progress state, agent activity state, extension activation

**Extension definition（扩展定义）**:
The configuration and optional shared TypeScript logic describing an extension independently of a particular harness.
_Avoid_: harness-specific entrypoint, generated extension

**Generated extension（生成扩展）**:
A harness-targeted standalone extension produced from an extension definition by a potential future distribution tool, not an extension using the initial shared-source framework. A manually customized copy would be maintained independently of that definition.
_Avoid_: shared-source framework consumer, synchronized source

**Semantic hook（语义钩子）**:
A framework-defined lifecycle position where one harness-independent extension function can run across supported harnesses. The harness adapter identifies the corresponding native trigger and supplies the framework's semantic inputs.
_Avoid_: native event name, template text slot

**Semantic lifecycle event（语义生命周期事件）**:
A framework-defined, harness-independent lifecycle transition derived from harness facts supplied through an adapter. The framework owns its meaning, ordering, payload and owner scope; native event names and shapes are distinct from it.
_Avoid_: native event name, raw harness hook, phase state

**Request（模型请求）**:
One observable model-provider invocation, distinct from its resulting assistant response and tool activity; transport retries hidden within that invocation are not separate observable Requests.
_Avoid_: turn, round, assistant response

**Assistant response（助手响应）**:
One model response, including a response that only initiates tool calls; tool results are not assistant responses.
_Avoid_: tool result, turn, round

**Turn（模型请求／响应周期）**:
One observable model request/response cycle that begins with the request and may complete, fail or be cancelled without a complete assistant response; hidden transport retries remain within the cycle, and execution of requested tools is outside it. Tool-call instructions may be part of its response, and prior tool results may be part of its request; neither makes tool execution part of the Turn.
_Avoid_: round, run, response plus tool execution

**Turn identity（Turn 身份）**:
The identity of one model request/response cycle, distinct from a provider-issued request identifier and from the identity of its containing Round or session.
_Avoid_: provider request ID, round ID, message ID

**Session observation（会话观察）**:
One actual session's current readings as the framework's own source holds them: the agent activity its Round edges last left it in and the latest context reading the adapter collected for it (the tokens its conversation holds, with the model it ran at that instant). It is a reading of the moment rather than an accounting number — nothing of it is persisted, a session nothing observed has no observation rather than an idle one with a context of nothing, and a session that parks or ends keeps its last reading. Its purpose is the *first* observation: a consumer that attaches after a session was already working reads the observation the source already holds, without waiting for a further transition, because a change delivery reaches only whoever was subscribed when it happened.
_Avoid_: delivery of the moment only, permanent startup snapshot, persisted context, consumption figure, host context window

**Observation scope（观察范围）**:
The declared extent of one subscription group's observations: `owner` covers only the owner session's own deliveries, `session` covers every actual session the adapter reports, each with its own identity, direct parent and latest name. Widening it changes which deliveries a group receives and nothing else — it grants no State write, no external-effect authority and no change to State inheritance.
_Avoid_: permission level, owner key filter, execution scope

**Subscription group（订阅组）**:
One declared group of semantic lifecycle handlers under one observation scope, delivered through the framework's single dispatch. The scope is declared once for the whole group rather than per event kind or per handler, and an extension that needs both an owner-scoped effect body and a per-actual-session observation view declares two groups over one implementation.
_Avoid_: handler bag, owner gate, per-event scope, second dispatcher

**Tool definition（工具定义）**:
The shared description of a model-callable operation: its invocation name, human-readable label, purpose, accepted parameter shapes and parameter guidance. Its business meaning is independent of the harness that exposes it; a description is not proof that an invocation satisfies the business rules.
_Avoid_: slash command, native registration, injected prompt, execution result

**Tool execution（工具执行）**:
The agent's execution of a tool-call instruction and production of a tool result, distinct from an LLM request/response Turn. It is work within a Round; its result may become input to a later Turn.
_Avoid_: turn, model response, separately billed model request

**Round（轮次）**:
One per-session period of agent activity, from starting execution until it has no pending automatic continuation and awaits new input, or its activity terminates by explicit cancellation or terminal failure. It may contain multiple model-response turns, tool executions, retries, queued-input consumption and dedicated approval interactions; known automatic continuations remain in the same round, while a newly observed execution start may truncate an unfinished prior round when its ending or continuation evidence is missing. Recovery or reloading may truncate an unfinished round and begin a new one for observed ongoing activity; truncation does not establish that the activity itself has completed.
_Avoid_: native agent run, turn (one model-response cycle), per-message interaction, whole task, semantically inferred task boundary

**Session disposal（会话处置）**:
One actual session's end, reported by its harness at an awaitable exit position. The framework closes that session's Round and waits within a bounded close-out budget for its subscribers. A transfer, rename or view change is not disposal. A write that was not confirmed remains unconfirmed. Timing and delivery rules belong to the [Session capability reference](docs/framework-capabilities.md).
_Avoid_: session switch, transferred session, rename, process exit, task completion, observed Round end

**Agent activity state（代理活动状态）**:
The agent's per-session current activity condition: working while continuous activity remains ongoing, or idle when no current activity or pending automatic continuation remains and it awaits new input. Dedicated approval/interaction waits remain working; this axis does not assert semantic completion of the user's overall task or whether a Round end has been observed since a panel connection began.
_Avoid_: run, execution unit, panel online status, panel completion history, extension State

**Working（工作中）**:
The agent activity state in which a continuous period of work remains ongoing, including model responses, tool execution, automatic retries/continuations and dedicated approval interactions. It includes awaiting a delegated result that will continue the session’s activity, and does not mean that model text is currently streaming.
_Avoid_: streaming, native agent run, waiting for new input

**Idle（空闲）**:
The agent activity state in which no current activity or pending automatic continuation remains and the agent awaits new input. It does not establish that any particular Round end has been observed, and unavailable observations do not establish idleness.
_Avoid_: completed user goal, observed Round completion, offline, unknown

**Runtime directory（运行目录）**:
The explicitly configured location for framework-owned runtime artifacts, including Local access location records. It is distinct from extension business storage and is not a temporary-directory or working-directory fallback. Configuration fields and path resolution belong to the [capability reference](docs/framework-capabilities.md).
_Avoid_: storage root, storageDir, temp directory fallback, working directory

**Local access（本机接入）**:
The framework-managed exchange of an Owner's declared values and each actual session's observations between local processes. A following session reads the Owner's current value rather than a creation-time copy. The exchange grants no remote State write or business-operation authority. Transport and lifetime rules belong to the [capability reference](docs/framework-capabilities.md#local-access-adapter-facing).
_Avoid_: RPC, remote procedure call, message channel through business documents, file queue, directory scan

**Access target（接入目标）**:
The seat one access serves: the extension whose declared values it carries and the owner they belong to. Both halves name it because an owner key alone is not unique across extensions, and both ends check the whole target — with that access's own verification — before anything crosses, so a stale record, an old endpoint or another seat's record is refused rather than followed.
_Avoid_: session id alone, process id, owner key alone, endpoint address

**Access location（接入定位）**:
The record that says where one access is: the target, the endpoint, that access's own verification and the publishing process's id, published under the runtime directory and holding nothing the access carries. Its endpoint and process id are recorded as information — never as proof that an owner lives — and it is released with the access's own life.
_Avoid_: State value, business data, liveness proof, connection state

**Observation source（观察来源）**:
The origin and ordering of live observations admitted for one access target. It distinguishes a newer observation from a stale source, not one session or process from another. Losing a source withdraws its live readings, not confirmed writes or business records, and does not establish idleness or a Round ending.
_Avoid_: liveness proof, process identity, connection state as agent state, reading as accounting fact

**Storage commit notice（存储提交提示）**:
A notice that one actual session confirmed a write of its extension data to shared storage. It carries no business content or accounting amount; consumers read the storage itself. It creates no Round, Turn or consumption contribution, and a lost observation source does not undo a confirmed write. The reporting API belongs to the [Session capability reference](docs/framework-capabilities.md).
_Avoid_: consumption figure, record of the document, Round or Turn fact, forced save, polling, remote write path, second accounting authority

### Facts and measurement semantics

**Unknown（未知）**:
A fact or metric value that cannot be reliably determined from the available evidence. It is distinct from a known zero, an inapplicable measurement policy, and failure of the activity being observed.
_Avoid_: zero, false, idle, no measurement policy

**No measurement policy（无统计口径）**:
The absence of an applicable rule for interpreting or calculating a metric within a stated scope. It is distinct from an unknown value caused by missing evidence under an applicable rule.
_Avoid_: unknown, missing observation, known zero

**Known zero（确认零）**:
A metric value established as zero by sufficient evidence under an applicable measurement policy. An absent observation or an inapplicable policy does not establish known zero.
_Avoid_: unknown, no measurement policy, skipped contribution

**Metric completeness（指标完整性）**:
Whether a particular metric has the evidence required by its measurement policy across its stated scope. Completeness is metric-specific; activity success alone does not establish it.
_Avoid_: activity success, availability of another metric, known subtotal

**Known subtotal（已知小计）**:
The sum of known, applicable contributions within a stated metric scope. Omitting unknown or inapplicable contributions does not establish a complete total or assign zero to those contributions.
_Avoid_: complete total, known zero for unknown contributions

### Extension controls and ownership

**Extension startup policy（扩展启动策略）**:
The rule that determines an extension's initial activation choice when an agent starts; subsequent command controls and session-boundary State behavior remain separate. A choice to activate is an intent, not proof that an external effect has succeeded. A pure State consumer receives it through the framework's State rule; a consumer whose activation is a live external effect receives it through its declared startup activation and keeps its declared value off until its own operation succeeds.
_Avoid_: implementation initialization, permanent activation lock, restored external effect

**Startup policy document（启动策略文档）**:
The deployment document selected by a startup mode that states each extension's initial activation choice. It is distinct from extension business configuration. Naming an extension in the document does not load it. File shape and application rules belong to the [startup policy reference](docs/framework-capabilities.md#extension-startup-modes-and-the-startup-policy).
_Avoid_: extension configuration, runtime profile, mode selector flag, environment override

**Extension startup mode（扩展启动模式）**:
The choice between manual mode and automatic startup mode, each with its own startup policy document and the same activation rules. The mode is selected statically by which entrypoint the host loads — never by a runtime profile parameter or environment override — and is distinct from whether an extension is loaded or currently enabled. Loading one extension's two modes in one process is unsupported because the host adds extension sources rather than merging them.
_Avoid_: separate extension implementation, subagent integration mode, current activation State, host profile argument

**Configuration switch（配置式开关）**:
An activation choice read at initialization whose changes do not take effect during the current run; applying a changed choice requires a restart. The startup policy document states such a choice for the startup moment only; it is not the deferred runtime control kind and does not replace command controls during a run.
_Avoid_: harness toggle, mode command, startup policy document

**Extension configuration（扩展配置）**:
An extension's own `config.yaml` in its source directory, read and validated by the framework at binding and exposed to the extension's shared logic; a change requires a restart. Its entries are business values — endpoints, request budgets — and are not where a startup mode's initial activation choice lives, which is the separate startup policy document.
_Avoid_: harness settings, environment override, State, defaults embedded in code, startup policy document

**Shared configuration（共享配置）**:
The machine's configuration for framework-wide HTTP transport and runtime artifacts, distinct from extension business configuration and startup policy. Changes require a process restart. Fields, resolution and failure behavior belong to the [capability reference](docs/framework-capabilities.md#general-http-module).
_Avoid_: extension configuration, environment variable, harness proxy setting, per-provider proxy field

**Mode selection（模式设置）**:
An explicit request for a named mode. Selecting an already active mode leaves it active without repeating mode-transition side effects.
_Avoid_: toggle, inversion

**Control kind（控制类别）**:
The per-field axis deciding how a bound command drives its State field: `toggle` alternates between two values on successive executions; `directed` names its target value explicitly and repeats its side effect on every execution.
_Avoid_: control category, mode, command type

**Command toggle（命令切换）**:
A command that alternates between two modes on successive executions.
_Avoid_: mode selection, idempotent switch

**Directed control（定向开关）**:
A control whose command explicitly names its target activation state and repeats its operation on each invocation. It does not toggle or deduplicate the operation; idempotence belongs to the extension. Accepted arguments and handler delivery belong to the [Command reference](docs/framework-capabilities.md#commands-readonly-commanddeclaration).
_Avoid_: toggle, mode selection, idempotent switch, command action

**Mixed control（混合控制）**:
A control scheme combining explicit mode selection and command toggling over the same mode state.
_Avoid_: a fourth mode, independent switches

**Command action（命令动作）**:
An extension subfeature invoked to perform an operation rather than select or alternate a mode. It has no implicit framework State transition. Declaration, matching and delivery belong to the [Command reference](docs/framework-capabilities.md#commands-readonly-commanddeclaration).
_Avoid_: mode transition, toggle, directed directive, abbreviation or default action

**Authored implementation（编写态实现）**:
An extension's declared subscription scopes, event handlers, command handlers and lifecycle entries, combined with one lazy business-state creator. Its integration structure can be inspected before an instance exists, and that same structure determines the instance's behavior rather than a parallel usage inventory.
_Avoid_: manually duplicated requirements, already-running business instance, arbitrary runtime handler bag

**Implementation factory（实现工厂）**:
The function one extension's assembly supplies for the harness adapter to call: it is called once the extension's declared configuration was read and validated, is handed those validated values, and returns the implementation — the command implementations, the semantic lifecycle handlers and, optionally, the one-time initialization and cleanup — that the framework connects to the definition's declarations. Building must have no effect of its own: no remote request and no timer, because the binding can still be refused afterwards.
_Avoid_: registration or dependency-injection container, per-session constructor, handler bag assembled at authoring time

**Implementation lifecycle（实现生命周期）**:
The two entries an implementation may carry and the framework's rules for running them: `initialize` is called at most once per process, at the owner session node, and the first model request waits for it to settle; `cleanup` is called at most once, when the session the instance is *serving* is disposed — an ordinary switch ends the session being left as `transferred` and starts another, moving the served owner without disposing anything — and the binding delivers nothing to the extension afterwards, including through a command the host still holds a registration for. A disposed implementation is spent: a binding that comes after its cleanup builds a new instance instead of reusing the closed one. A refusal that follows a successful factory call runs the same single cleanup, and a subagent binding can neither initialize nor tear down the CLI's instance.
_Avoid_: per-binding construction, re-initialization per session or round, automatic retry or rollback, hot reload

**Parameter setting（参数设置）**:
An extension subfeature that assigns a supplied value to a parameter; it does not inherently activate or deactivate the extension.
_Avoid_: mode selection, command action

**State**:
The framework's single current-value source for an extension, including framework-defined and extension-defined values. Persistence media and external providers can supply observations, but framework-managed behaviors read current values from State.
_Avoid_: UI-only variable bag, persistence backend, unscoped global object

**State persistence（State 持久化）**:
The per-field choice between restoring a declared value from its Owner's persistence medium and retaining it only in memory. Restoring a value does not prove its external effect is active. Declaration values and defaults belong to the [State reference](docs/framework-capabilities.md).
_Avoid_: extension storage, concrete persistence backend, UI state

**Subagent State inheritance（子代理 State 继承）**:
The per-field relationship between a subagent and its Owner's declared State value. A following field reads the Owner's current value live; a non-following field reads its declared default. Following does not copy all extension state, load an extension or inherit MCP access. Declaration values, defaults and unavailable-access behavior belong to the [State reference](docs/framework-capabilities.md).
_Avoid_: whole-extension state copy, creation-time snapshot, process-global state, extension loading, MCP inheritance, default inheritance

**Owner（所属主会话 / owning main session）**:
The session that holds an extension's owner-scoped State values; for any session it is the nearest ancestor session that is itself a top-level main session (a main session is its own owner). Subagent sessions are not owners; whether they follow their owner's values live is per-field and opt-in.
_Avoid_: parent agent, process-global state, current session

**Viewed session（当前查看会话）**:
The actual agent session whose conversation and session-specific information are currently shown to the operator. It is distinct from the session that owns extension State or issued an observed request; changing the view does not change either ownership.
_Avoid_: Owner, executing session, current session (without a viewing qualifier)

**Parent agent（父代理）**:
The session that directly created a subagent — the immediate spawner. It may itself be a subagent, so it equals the owner only at depth 1.
_Avoid_: owner, root session, State holder

**Subagent spawn relationship（子代理启动关系）**:
The relationship between one subagent execution and the actual session and Round that directly initiated it. It is distinct from State ownership and from the parent’s current Round when a result arrives.
_Avoid_: Owner relationship, result-arrival relationship, agent-name hierarchy

**Session ancestry（会话祖先链）**:
The chain of direct parent-session relationships connecting a session to its ancestors. A direct parent and a top-level owning session are distinct positions in this chain.
_Avoid_: State inheritance, agent-name prefix, flattened Owner relationship

**Extension storage（扩展存储）**:
The retention mechanism for extension-owned state and business data, including in-memory values, harness-owned session entries, extension-owned files, and archives. It does not by itself determine which session or other owner a value belongs to.
_Avoid_: session restoration, persistence (when referring only to volatile memory)

**Recovery reconciliation（恢复后对齐）**:
The decision whether and how a restored state should reacquire ongoing effects whose earlier execution may no longer be active. Restoring a stored value alone does not establish that timers or external registrations are running.
_Avoid_: replaying the last command, automatic side-effect restoration

**Marker area（状态标记区）**:
The framework-owned shared status region for extension marker text. It reflects the displayed session's effective State when the harness reports that view, otherwise the delivery position. Viewing grants no ownership or write authority. Publication, ordering and registration rules belong to the [Marker reference](docs/framework-capabilities.md#marker-markerdeclaration).
_Avoid_: extension-owned widget, per-extension marker key, extension-chosen placement, marker area per viewed session, last binding wins, one registration per extension id

**Viewed session seat（当前查看席位）**:
The owner position of the session the host is displaying, as the harness's public Viewed session outlet reports it: the owner itself, a subagent following one, or nothing when the host cannot obtain the identity. It is a read of a fact used to project the Marker area and State reads — never an Owner, never a write path, never a capability, and never derived from a display name, a registry label or a string that merely looks hierarchical. A view that moves, or a target that becomes invalid, changes the projection and nothing else.
_Avoid_: current view as Owner, view name as identity, viewing as permission, session-focus state

**Extension feedback（扩展反馈）**:
The framework's single harness-independent channel through which an extension publishes operator-facing notices, each carrying an `info`, `warning` or `error` severity; the framework maps it to a UI notification when the session has one and to stderr when it does not, and it never enters model context.
_Avoid_: raw native notify, tool output, injected prompt, extension-owned widget

**Injected prompt（注入提示词）**:
Extension-provided text made available to the model under declared activation and delivery rules. Its visibility to the user, delivered authority, and retention are distinct properties.
_Avoid_: instruction contribution (legacy name), hidden developer message (as a synonym for all prompts), raw text insertion, system prompt

**History preservation（历史保护）**:
A policy under which framework-managed behavior preserves existing conversation entries and their order in history-derived request content. New recorded messages may be appended; separate non-persisted contributions have their own placement rules, and cache hits are not guaranteed.
_Avoid_: identical-to-history request, cache-hit guarantee, immutable business storage

**Request-only prompt（请求级临时提示词）**:
Extension-provided content included in a model request without being added to the harness's conversation history. Its placement and recurrence are separate from its non-persisted lifetime.
_Avoid_: request-only contribution (legacy name), persisted hidden message, history entry

**Supported harness baseline（Harness 支持基线）**:
The declared harness versions and applicable conditions against which shared extension behaviors are supported, together with their verification status. An inspected version is not automatically a supported or runtime-verified target.
_Avoid_: latest versions, universal compatibility, source version alone

**Behavior library（行为库）**:
Reusable harness-independent extension behaviors that an extension definition selects and configures.
_Avoid_: harness API wrappers, feature-specific business logic

**Feature template（功能模板）**:
A reusable combination of behaviors and feature-specific logic that can produce an extension from supplied configuration.
_Avoid_: semantic core, generated extension

## Verification

**Harness acceptance scope（宿主验收范围）**:
The explicitly bounded set of behavior checks for one harness whose complete successful execution establishes one scoped acceptance result. Passing a subset does not establish acceptance of the whole scope, another scope or another harness.
_Avoid_: all compatibility, arbitrary test selection as complete acceptance

**Highest accepted harness version（最高已验收通过宿主版本）**:
The highest version of one harness with a complete successful result for one acceptance scope, qualified by the source, checks and environment that result exercised. It is historical scoped evidence, not the latest upstream release, proof for later source changes or a global support declaration.
_Avoid_: latest version, most recently tested version, universally supported version

**Harness dock（对接坞，short `dock`）**:
Repository-owned test infrastructure that verifies the locally selected installed harness through isolated sessions and an explicit extension set. Its observations establish behavior of that actual harness, not a modified replacement or a support declaration.
_Avoid_: test runtime, test harness, fixture

**Declared requirement（声明要求）**:
A semantic obligation on which a binding's behavior rests, distinct from a runtime feature switch. Integration obligations are derived from extension use and framework contracts; whether their behavior holds in a harness scope is established by independent verification, not decided at binding.
_Avoid_: runtime feature flag, fallback route, startup gate

**Semantic drift（语义漂移）**:
A change in harness behavior that moves an adapter's mapping away from the framework meaning it was intended to provide, potentially invalidating previously accepted approximations or their assumptions. Unchanged names and type signatures do not establish that the meaning has been preserved.
_Avoid_: missing method, signature incompatibility alone, proven incompatibility without evidence

**Minimal integration contract（最小接入契约）**:
An independently identifiable semantic obligation through which a harness participates in a framework capability, including its interaction mode and the conditions under which it is required. A capability can depend on several such contracts; satisfying their inventory does not certify behavior correctness.
_Avoid_: method signature alone, interaction category alone, behavior certificate

**Framework capability inventory（框架能力清单）**:
The framework-mediated capabilities an extension depends on or a harness adapter supplies, compared to identify missing common integration functionality. It excludes extension-specific direct harness integrations, such as native widgets, and does not certify behavior correctness.
_Avoid_: behavior certificate, native harness feature inventory, subagent-only checklist

**Subagent integration checklist（子代理接入清单）**:
The earlier subagent-only comparison of manually declared extension demand and adapter supply, superseded by the framework capability inventory derived from source. Its historical coverage statements are not evidence of correct behavior.
_Avoid_: runtime capability negotiation, feature switch, compatibility certificate

**Integration completeness check（接入完整性检查）**:
An independently invoked comparison of an extension's framework-mediated integration obligations with a target adapter's structural supply, identifying gaps and unresolved analysis. It neither exercises behavior nor affects extension loading, startup or feature availability; behavior verification is separate.
_Avoid_: behavior test, startup gate, automatic feature downgrade

**Independent compatibility verification（独立兼容性验证）**:
The separately executed verification of one exact harness version, environment and source combination, recorded as a scoped report of executed, passed, failed and unverified coverage. A support claim rests on it; normal startup carries no version, capability-shape or report check of its own.
_Avoid_: startup version check, runtime compatibility warning, a green suite as certification
