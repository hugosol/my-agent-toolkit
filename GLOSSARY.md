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

**Configuration switch（配置式开关）**:
An activation choice read at initialization whose changes do not take effect during the current run; applying a changed choice requires a restart.
_Avoid_: runtime toggle, mode command

**Mode selection（模式设置）**:
An explicit request for a named mode. Selecting an already active mode leaves it active without repeating mode-transition side effects.
_Avoid_: toggle, inversion

**Command toggle（命令切换）**:
A command that alternates between two modes on successive executions.
_Avoid_: mode selection, idempotent switch

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

**Subagent State inheritance（子代理 State 继承）**:
The live following of an owning main session's declared State value by its subagents. Other session-owned values, such as each session's init-injection progress, remain independent.
_Avoid_: whole-extension state copy, creation-time snapshot, process-global state, extension loading, MCP inheritance

**Owner（所属主会话 / owning main session）**:
The session that holds an extension's owner-scoped State values; for any session it is the nearest ancestor session that is itself a top-level main session (a main session is its own owner). Subagent sessions follow their owner's values live and are not owners.
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
