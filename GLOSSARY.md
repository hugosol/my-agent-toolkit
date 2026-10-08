# Semantic Extension Framework

The planned cross-agent-runtime framework: my-agent-toolkit maintains one in-repository framework source tree for replacement extensions containing semantic behaviors and pi/oh-my-pi adapters. A standalone extension generator is a possible later distribution feature, not part of the initial framework.

## Language

**Semantic extension framework（语义扩展框架）**:
The shared runtime foundation that owns extension behavior contracts and their mappings to supported agent runtimes.
_Avoid_: standalone generated extension, copy-pasted template, native API wrapper

**Agent runtime（Agent 运行时）**:
The program that discovers and runs extensions and exposes the native capability surface they adapt to; the supported agent runtimes are `pi` and `oh-my-pi`. An agent runtime is distinct from an agent session (`ctx.agent`) and its subagents.
_Avoid_: host (ambiguous with OS/process host), agent, platform

**Extension definition（扩展定义）**:
The configuration and optional shared TypeScript logic describing an extension independently of a particular agent runtime.
_Avoid_: agent-runtime-specific entrypoint, generated extension

**Generated extension（生成扩展）**:
An agent-runtime-targeted standalone extension produced from an extension definition by a potential future distribution tool, not an extension using the initial shared-source framework. A manually customized copy would be maintained independently of that definition.
_Avoid_: shared-source framework consumer, synchronized source

**Semantic hook（语义钩子）**:
A framework-defined lifecycle position where one agent-runtime-independent extension function can run across supported agent runtimes. The agent-runtime adapter identifies the corresponding native trigger and supplies the framework's semantic inputs.
_Avoid_: native event name, template text slot

**Semantic lifecycle event（语义生命周期事件）**:
A framework-defined, agent-runtime-independent lifecycle transition that an agent-runtime adapter synthesizes from that runtime's native events. The framework owns its meaning, ordering, payload and owner scope; native event names, shapes and per-runtime facts are not part of it.
_Avoid_: native event name, raw runtime hook, phase state

**Round（轮次）**:
One period of agent activity, from the agent starting work on input until quiescence — no automatic work remains and it is waiting for the user. A round may contain several model-response turns and several low-level agent runs.
_Avoid_: run (a low-level execution unit), turn (one model-response cycle)

**Configuration switch（配置式开关）**:
An activation choice read at initialization whose changes do not take effect during the current run; applying a changed choice requires a restart.
_Avoid_: runtime toggle, mode command

**Extension configuration（扩展配置）**:
An extension's own `config.yaml` in its source directory, read and validated by the framework at binding and exposed to the extension's shared logic; a change requires a restart. Its entries are plain configuration values and, in a future release, configuration switches.
_Avoid_: agent-runtime settings, environment override, State, defaults embedded in code

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

**Parent agent（父代理）**:
The session that directly created a subagent — the immediate spawner. It may itself be a subagent, so it equals the owner only at depth 1.
_Avoid_: owner, root session, State holder

**Extension storage（扩展存储）**:
The retention mechanism for extension-owned state and business data, including in-memory values, agent-runtime-owned session entries, extension-owned files, and archives. It does not by itself determine which session or other owner a value belongs to.
_Avoid_: session restoration, persistence (when referring only to volatile memory)

**Recovery reconciliation（恢复后对齐）**:
The decision whether and how a restored state should reacquire ongoing effects whose earlier execution may no longer be active. Restoring a stored value alone does not establish that timers or external registrations are running.
_Avoid_: replaying the last command, automatic side-effect restoration

**Panel session registration（面板会话登记）**:
The presence of a connect-bot session record in the panel. Unregistering removes that record; an offline session can remain registered.
_Avoid_: online status, heartbeat, local activation

**Panel session online status（面板会话在线状态）**:
The panel-owned assessment of whether a registered session has been heard from recently enough to count as online. Becoming offline does not itself remove the session registration.
_Avoid_: registration, unregister, client failure count

**Marker area（状态标记区）**:
The framework's single status region where each bound extension's marker is rendered, with a widget identity, placement and line order the framework owns and an activation-driven life cycle the framework derives from State; an extension contributes only its marker text and can never name or claim the widget. It is one per process, registered on the process global under a well-known symbol so that duplicated framework module graphs still share the one region.
_Avoid_: extension-owned widget, per-extension marker key, extension-chosen placement

**Extension feedback（扩展反馈）**:
The framework's single runtime-independent channel through which an extension publishes operator-facing notices, each carrying an `info` or `error` severity; the framework maps it to a UI notification when the session has one and to stderr when it does not, and it never enters model context.
_Avoid_: raw native notify, tool output, injected prompt, extension-owned widget

**Injected prompt（注入提示词）**:
Extension-provided text made available to the model under declared activation and delivery rules. Its visibility to the user, delivered authority, and retention are distinct properties.
_Avoid_: instruction contribution (legacy name), hidden developer message (as a synonym for all prompts), raw text insertion, system prompt

**History preservation（历史保护）**:
A policy under which framework-managed behavior preserves existing conversation entries and their order in history-derived request content. New recorded messages may be appended; separate non-persisted contributions have their own placement rules, and cache hits are not guaranteed.
_Avoid_: identical-to-history request, cache-hit guarantee, immutable business storage

**Request-only prompt（请求级临时提示词）**:
Extension-provided content included in a model request without being added to the agent runtime's conversation history. Its placement and recurrence are separate from its non-persisted lifetime.
_Avoid_: request-only contribution (legacy name), persisted hidden message, history entry

**Supported agent-runtime baseline（Agent 运行时支持基线）**:
The declared agent-runtime versions and applicable conditions against which shared extension behaviors are supported, together with their verification status. An inspected version is not automatically a supported or runtime-verified target.
_Avoid_: latest versions, universal compatibility, source version alone

**Behavior library（行为库）**:
Reusable agent-runtime-independent extension behaviors that an extension definition selects and configures.
_Avoid_: agent-runtime API wrappers, feature-specific business logic

**Feature template（功能模板）**:
A reusable combination of behaviors and feature-specific logic that can produce an extension from supplied configuration.
_Avoid_: semantic core, generated extension
