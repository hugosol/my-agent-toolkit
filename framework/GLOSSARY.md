# Semantic Extension Framework

The planned cross-harness framework: my-agent-toolkit maintains one in-repository framework source tree for replacement extensions containing semantic behaviors and pi/oh-my-pi adapters. A standalone extension generator is a possible later distribution feature, not part of the initial framework.

## Language

**Semantic extension framework（语义扩展框架）**:
The shared harness foundation that owns extension behavior contracts and their mappings to supported harnesses.
_Avoid_: standalone generated extension, copy-pasted template, native API wrapper

**Harness（宿主）**:
The program that discovers and runs extensions and exposes the native capability surface they adapt to; the supported harnesses are `pi` and `oh-my-pi`. A harness is distinct from an agent session (`ctx.agent`) and its subagents.
_Avoid_: agent runtime (legacy name), host (ambiguous with OS/process host), agent, platform

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

**Tool execution（工具执行）**:
The agent's execution of a tool-call instruction and production of a tool result, distinct from an LLM request/response Turn. It is work within a Round; its result may become input to a later Turn.
_Avoid_: turn, model response, separately billed model request

**Round（轮次）**:
One per-session period of agent activity, from starting execution until it has no pending automatic continuation and awaits new input, or its activity terminates by explicit cancellation or terminal failure. It may contain multiple model-response turns, tool executions, retries, queued-input consumption and dedicated approval interactions; known automatic continuations remain in the same round, while a newly observed execution start may truncate an unfinished prior round when its ending or continuation evidence is missing. Recovery or reloading may truncate an unfinished round and begin a new one for observed ongoing activity; truncation does not establish that the activity itself has completed.
_Avoid_: native agent run, turn (one model-response cycle), per-message interaction, whole task, semantically inferred task boundary

**Agent activity state（代理活动状态）**:
The agent's per-session current activity condition: working while continuous activity remains ongoing, or idle when no current activity or pending automatic continuation remains and it awaits new input. Dedicated approval/interaction waits remain working; this axis does not assert semantic completion of the user's overall task or whether a Round end has been observed since a panel connection began.
_Avoid_: run, execution unit, panel online status, panel completion history, extension State

**Working（工作中）**:
The agent activity state in which a continuous period of work remains ongoing, including model responses, tool execution, automatic retries/continuations and dedicated approval interactions. It includes awaiting a delegated result that will continue the session’s activity, and does not mean that model text is currently streaming.
_Avoid_: streaming, native agent run, waiting for new input

**Idle（空闲）**:
The agent activity state in which no current activity or pending automatic continuation remains and the agent awaits new input. It does not establish that any particular Round end has been observed, and unavailable observations do not establish idleness.
_Avoid_: completed user goal, observed Round completion, offline, unknown

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

**Configuration switch（配置式开关）**:
An activation choice read at initialization whose changes do not take effect during the current run; applying a changed choice requires a restart.
_Avoid_: harness toggle, mode command

**Extension configuration（扩展配置）**:
An extension's own `config.yaml` in its source directory, read and validated by the framework at binding and exposed to the extension's shared logic; a change requires a restart. Its entries are plain configuration values and, in a future release, configuration switches.
_Avoid_: harness settings, environment override, State, defaults embedded in code

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
A bound control kind whose command names its target state explicitly — an empty argument activates, `off` deactivates, and any other argument is not a directive at all (the framework records and publishes nothing for it, and hands the text to the implementation's own `unrecognized` member) — and which repeats its side effect on every invocation; the framework never deduplicates or short-circuits it, so idempotence is the extension's responsibility.
_Avoid_: toggle, mode selection, idempotent switch, command action

**Mixed control（混合控制）**:
A control scheme combining explicit mode selection and command toggling over the same mode state.
_Avoid_: a fourth mode, independent switches

**Command action（命令动作）**:
An extension subfeature invoked to perform an operation, rather than to select or alternate a mode.
_Avoid_: mode transition, toggle

**Parameter setting（参数设置）**:
An extension subfeature that assigns a supplied value to a parameter; it does not inherently activate or deactivate the extension.
_Avoid_: mode selection, command action

**State**:
The framework's single current-value source for an extension, including framework-defined and extension-defined values. Persistence media and external providers can supply observations, but framework-managed behaviors read current values from State.
_Avoid_: UI-only variable bag, persistence backend, unscoped global object

**State persistence（State 持久化）**:
The per-field axis deciding whether a declared State value is written to the owner's persistence medium and seeded from the target branch at session boundaries (`session-entry`, the default) or kept only in memory and never seeded (`memory`, the choice for a value whose live external effect must not be assumed from a restored value).
_Avoid_: extension storage, concrete persistence backend, UI state

**Subagent State inheritance（子代理 State 继承）**:
The per-field axis deciding how a subagent relates to its owner's declared State value: `follow` — the subagent reads the owner's current value live; `none` (the default) — the subagent reads the field's declared default. Other session-owned values, such as each session's init-injection progress, remain independent.
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
The framework's single status region where each bound extension's marker is rendered, with a widget identity, placement and line order the framework owns and an activation-driven life cycle the framework derives from State; an extension contributes only its marker text and can never name or claim the widget. It is one per process, registered on the process global under a well-known symbol so that duplicated framework module graphs still share the one region.
_Avoid_: extension-owned widget, per-extension marker key, extension-chosen placement

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

**Harness dock（对接坞，short `dock`）**:
Repository-owned test infrastructure that verifies a harness. It materialises an isolated exact install of one harness version, drives it as a child process in RPC mode under an explicit-only extension set, and reads back that run's session JSONL, captured outbound requests and stderr. It is not itself a harness.
_Avoid_: test runtime, test harness, fixture
