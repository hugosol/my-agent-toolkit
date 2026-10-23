# Pi 与 oh-my-pi adapter：按来源与原生源码归属组织的重构

Status: 设计讨论已确认；尚未实施
Label: ready-for-agent
Date: 2026-10-23

本文替代本位置原先仅面向 Pi 的重构规划，记录本次讨论确认的需求与设计约束。保留原规划位置以维持已有引用；当前范围明确包含 Pi 与 oh-my-pi。本文不是实施完成报告，也不是宿主支持认证。

## Problem Statement

维护者需要对照 harness 源码理解 adapter 如何兑现 framework 的统一语义。目前两个 adapter 主要按 framework capability domain 分类，回答的是“框架提供什么”，却不容易回答“某项原生机制在哪里被适配、哪些保证被保留或组合”。

同一原生协议的读写、事件与生命周期可能散落在不同 domain 中；不同来源的能力又可能因功能名称相同而聚集在一起。Pi adapter 同时适配 Pi 原生机制与第三方 pi-subagents，但当前 Subagent 分组混合了原生 session 文件关系、第三方注册、RPC 和后台工作读数，不利于分别审查宿主升级与第三方协议升级。

Pi 与 oh-my-pi 的源码组织及子代理实现不同。要求两端保持相同的内部目录形状，会掩盖这些真实差异；机械复制上游目录，也会拆散集中在少数原生 seam 上的完整职责。

维护者希望改善来源可追踪性和职责局部性，同时严格保持公共契约以及现有 extension 在各自 harness 上的可观察行为，不把结构重构变成未经批准的逻辑修改。

## Solution

将两个 adapter 的主要导航轴从 framework domain 改为能力来源与实际适配的原生契约归属。

宿主自身的映射集中到 native；Pi 第三方映射集中到 thirdParty 下以 pi-subagents 命名的来源分组；必须同时理解原生与第三方事实的组合职责集中到 mixture。不存在对应职责时不创建空分组。取消笼统的 internal 分组，把原生类型和支持代码归还实际职责，将私有 port 组装与公共 assembly 入口分别保留为清晰的顶层职责。

各来源内部参考真实上游源码结构导航，但不逐层、逐文件镜像。以实际 seam、完整协议和生命周期决定 module 边界。允许重组实现职责、聚合读写和收回内部符号，但不得擅自改变 extension 结果、时序、身份、错误传播、持久化或资源释放。

两个 adapter 继续通过已有 HarnessPort 契约收束。统一的是 framework 语义承诺，不是内部目录、原生事件序列、状态模型或可选能力供给。消费方不需要了解 Pi 能力究竟来自原生机制还是第三方协议。

## User Stories

1. As an adapter maintainer, I want to navigate mappings by their native source ownership, so that I can compare their behavior with harness source without reconstructing framework domain splits.
2. As a Pi adapter maintainer, I want Pi-native mappings separated from pi-subagents mappings, so that I can identify which upstream project owns each contract.
3. As a Pi adapter maintainer, I want pi-subagents to remain inside the Pi adapter, so that a Pi-specific extension does not become a misleading cross-harness public adapter.
4. As an OMP adapter maintainer, I want navigation to follow OMP's own source organization, so that Pi's layout does not obscure OMP's native mechanisms.
5. As an adapter maintainer, I want source directories to act as navigation coordinates rather than mandatory mirrors, so that complete protocols remain understandable in one place.
6. As an adapter maintainer, I want only actually adapted upstream mechanisms represented, so that empty directories and forwarding-only modules do not create maintenance work.
7. As an adapter maintainer, I want a protocol's closely related reads and writes to be colocated where appropriate, so that naming, encoding and restoration rules are reviewed together.
8. As an adapter maintainer, I want multi-event lifecycle mappings kept coherent, so that event names do not force artificial module splits.
9. As an adapter maintainer, I want native session-file facts distinguished from third-party subagent facts, so that functional labels do not misrepresent their origins.
10. As an adapter maintainer, I want third-party messages classified by the owner of their protocol rather than their transport, so that use of the Pi event bus does not make a third-party RPC appear native.
11. As an adapter maintainer, I want cross-source composition explicitly identifiable, so that I can review where native and third-party facts jointly determine a framework result.
12. As an adapter maintainer, I want native mappings independent of specific third-party protocols, so that native responsibilities remain understandable without reading the provider integration.
13. As an adapter maintainer, I want third-party mappings to use necessary Pi contracts without pretending to be harness-independent, so that source isolation does not introduce unnecessary abstraction.
14. As an adapter maintainer, I want assembly to remain distinct from protocol interpretation, so that port bindings remain explicit and reviewable.
15. As a framework maintainer, I want the existing HarnessPort and delivery contracts preserved, so that internal reorganization does not require consumer migration to a new public interface.
16. As an extension author, I want my extension to produce the same observable behavior on Pi before and after the refactor, so that source navigation improvements do not introduce regressions.
17. As an extension author, I want my extension to produce the same observable behavior on OMP before and after the refactor, so that OMP's reorganization is independently safe.
18. As an extension author, I want legitimate differences in optional capability availability retained, so that the refactor does not silently broaden or narrow supported behavior.
19. As an extension author, I want existing event ordering, session identity and error propagation preserved, so that successful output alone does not hide lifecycle regressions.
20. As an extension author, I want existing persistence and State restoration behavior preserved, so that previously written data remains usable after the refactor.
21. As an adapter maintainer, I want third-party absence, assembly disablement, protocol failure and identity mismatch to retain their existing distinctions, so that failures are not converted into false success or idle readings.
22. As an adapter maintainer, I want existing registration, unsubscription and resource disposal behavior preserved, so that reorganizing ownership does not leak resources or change lifetimes.
23. As an OMP adapter maintainer, I want optional host-patch contracts identified as native variants, so that they are neither mistaken for third-party extensions nor claimed as present in unpatched upstream source.
24. As a reviewer, I want structural supply checks to remain analyzable from actual assembly, so that the new layout does not require a second manually maintained capability inventory.
25. As a reviewer, I want behavior tests and real-harness observations to support acceptance separately from static checks, so that structural availability is not mistaken for semantic correctness.
26. As a reviewer, I want verification gaps stated explicitly, so that an unavailable patched host or third-party environment does not become an unsupported success claim.
27. As a maintainer, I want obsolete paths and forwarding compatibility layers removed after migration, so that only one implementation and navigation scheme remain.
28. As a future maintainer, I want architecture decisions and navigation documentation updated with the implementation, so that old domain-first rules do not contradict the new source-first organization.

## Implementation Decisions

### Scope and existing seam

- Both Pi and oh-my-pi adapters are in scope. The earlier Pi-only scope is superseded.
- The existing HarnessPort remains the framework-to-adapter interface at the already established adapter seam. PI_PORT and OMP_PORT remain their actual explicit assembly definitions. This is a previously confirmed decision, not a new seam introduced by this spec.
- Public extension interfaces, port contracts, delivery semantics and existing capability availability must not change as a side effect of reorganization.
- Do not introduce another public adapter for pi-subagents, another framework translation layer, a generic provider interface or a dynamic registration framework merely to support the directory scheme.
- No additional seam placement is decided here. Detailed interface boundaries and verification promises belong to the subsequent contract phase.

### Source groups and assembly

- Use the names native, thirdParty and mixture for source organization.
- Native contains mappings for harness-owned contracts and mechanisms, including optional host-patch contracts.
- Pi's thirdParty group contains the specifically named pi-subagents integration. Provider-specific registration, RPC, version checks, launch information and liveness protocol interpretation belong to that source when actually owned by the provider.
- Mixture contains only responsibilities that must combine native and third-party facts or operations to satisfy an existing framework contract. Complexity, multiple files or multiple native events alone do not justify placement there.
- OMP does not receive empty thirdParty or mixture groups for visual symmetry.
- Remove the generic internal grouping. Keep the public assembly entry and private port assembly as separate top-level modules. A top-level private module does not become a supported public import.
- Place native types and loading support according to the contracts they describe and the callers they actually serve; do not recreate an unowned helper collection.

### Source navigation and complete responsibilities

- Omit common upstream repository/package source prefixes while preserving distinctive source ownership names below them.
- Treat the adapted public contract or protocol as the primary ownership coordinate, rather than mechanically following the final execution location of every method.
- For example, extension UI mappings belong with the extension UI contract when that is the actual surface consumed; a TUI implementation elsewhere does not make the mapping interactive-mode-specific.
- Preserve complete protocols and lifecycles. One upstream file can correspond to several local modules, and one complete local responsibility can refer to several upstream files.
- Keep native session-file ancestry distinct from provider-specific subagent protocols even when the old implementation placed both under one functional category.
- Do not create unused upstream mirrors, one-file-per-hook structures or forwarding-only wrappers.

### Composition and dependency direction

- Mixture may consume explicit native and third-party facts or operations. Neither source group depends back on mixture.
- Native mappings must not depend on pi-subagents-specific protocols.
- Third-party mappings may depend on necessary Pi-native contracts such as the event bus; they are not required to be harness-independent.
- Actual cross-source interpretation is completed by the mapping implementation before its output is consumed under HarnessPort. Port assembly does not become an additional semantic translation stage.
- Keep port assembly explicit and within the existing static analyzer's supported patterns. Do not replace actual bindings with a second manually synchronized capability list.
- Directory relocation alone does not justify changing binding-state ownership or resource lifetimes.

### Behavioral preservation and allowed restructuring

- Responsibility regrouping is allowed: move implementations, split mixed-source modules, colocate tightly coupled protocols and localize symbols that no longer need cross-module visibility.
- Preserve each extension's observable behavior independently on each harness. Do not require Pi and OMP to produce identical native event sequences, internal states or presentation details.
- Preserve legitimate optional capability differences and current assembly conditions.
- Preserve ordering, identity, errors, persistence, cancellation and disposal behavior, not merely final successful output.
- Any discovered semantic defect is recorded separately rather than silently fixed during the structural refactor. A behavior change requires explicit scope approval.
- After migration, remove superseded implementations, obsolete imports and compatibility forwarding paths rather than maintaining two layouts.

### Optional native patches and architecture records

- OMP's optional Viewed-session outlet remains a native host-contract variant. Preserve behavior both when the outlet exists and when it is absent.
- Do not implement or install that host patch as part of this refactor, and do not claim it exists in the supplied upstream source.
- The approved source-first organization replaces ADR-0002's domain-first adapter layout and its rule that a third-party provider is not a primary navigation category. Preserve unrelated dependency and semantic rules from that ADR.
- Update authoritative architecture and navigation documents with implementation, distinguishing planned layout from completed migration.
- Native, thirdParty and mixture are implementation organization labels, not new business-domain terms to add to the domain glossary.

## Testing Decisions

- Follow the repository's existing test-tier and shared-worktree coordination policy. Use affected tests while iterating; broaden to owning partitions and affected consumers at completion; run the prescribed full checks for final integration.
- Existing adapter/framework behavior tests, extension consumer tests, import-boundary checks, static integration checks and real-host dock scenarios are prior art. Their exact affected files and additional coverage are to be identified from the final migration and contracts; this spec does not claim a complete test inventory has already been audited.
- TypeScript changes require type checking, including changes to tests and support modules.
- Validate both Pi and OMP static integration analysis. Preserve explicit assembly, canonical delivery construction and conditional assembly evidence; do not reduce analyzed demand to hide a regression.
- Behavior preservation compares each affected extension on the same harness before and after refactoring. Cross-harness equivalence applies only to promises already required by the shared framework contract.
- Relevant behavior includes lifecycle ordering, session and parent identity, State persistence/restoration, commands, prompt contributions, UI effects, cancellation, terminal failure and resource disposal.
- Preserve third-party missing/disabled/rejected/failed states, protocol version and identity handling, child-extension requirements and release behavior. These are existing behavior constraints, not authorization to add new fallback policies.
- Keep observable behavior assertions. Imports and test setup may migrate, but do not weaken assertions, delete consumer-visible scenarios or narrow required contract coverage merely to make the refactor pass. Tests tied solely to obsolete implementation layout are not behavioral requirements.
- Tests supplement rather than replace running the changed harness-facing behavior. Use corresponding real-host dock or smoke scenarios, and report the precise source/environment to which results apply.
- Optional patched-host paths must be distinguished from unpatched-source paths. Missing prerequisites remain explicit verification gaps, not inferred passes.
- Static provided status does not prove runtime provider availability or semantic correctness; a passing suite does not itself certify a harness version.
- Coordinate expensive/full/real-host runs in a quiet shared-worktree window and keep tested source unchanged during final verification.
- Exact test seams, the promises tested at each seam and coverage assignment remain for /to-contract. No new test seam is selected by this spec.

## Out of Scope

- Redesigning framework primitives, introducing new public native-specific capabilities or changing HarnessPort semantics.
- Making all optional capabilities mandatory or equalizing existing capability availability between harnesses.
- Changing extension business logic, expected results or presentation solely for structural uniformity.
- Modifying Pi, oh-my-pi or pi-subagents source to accommodate this layout.
- Implementing, installing or completing optional OMP host patches.
- Making pi-subagents a standalone public adapter or a harness-independent integration.
- Adding generic plugin loading, dynamic capability registration, a new provider abstraction or a second translation layer.
- Mechanically mirroring upstream trees, creating empty source groups or splitting complete lifecycles by individual events.
- Opportunistic bug fixes, new fallback behavior, retries or validation unrelated to preserving existing behavior.
- Promising a particular line-count reduction or equal module sizes.
- Promoting any harness version's formal support status based on this refactor.
- Implementing the refactor as part of publishing this specification.

## Further Notes

### Evidence and limitations

The discussion reviewed the previous Pi specification, the framework glossary and architecture rules, and performed targeted read-only inspection of both adapters and the supplied Pi, oh-my-pi and pi-subagents source trees. It did not complete an exhaustive per-file migration inventory or execute a refactor.

The inspection established these design-relevant facts:

- Pi and OMP have different native source structures; imposing the same internal tree would conceal real ownership differences.
- Extension UI contracts and their concrete TUI implementations occupy different upstream locations; the consumed contract is the relevant mapping coordinate.
- Pi's existing subagent-related code mixes native session-file facts with third-party protocols, so source isolation requires examining responsibilities rather than moving the whole old category intact.
- Pi Round handling consumes both native execution facts and third-party background-work information, providing a concrete reason for an explicitly owned cross-source composition group.
- OMP's current agent relationship mapping reads native registry facts; it should not be modeled as a copy of Pi's third-party provider integration.
- The inspected OMP source does not expose the optional Viewed-session outlet declared by the adapter. Adapter declarations describe it as an optional host patch and explicitly handle absence. This is not evidence that the current upstream provides that capability, nor by itself proof of an adapter defect.

The earlier specification recorded a Pi static integration run with complete required supply for codebase-tools, connect-bot and model-cost, while retaining optional unavailable/conditional states. That historical result is not a current baseline, an OMP result or behavior proof; implementation verification must use the relevant current source and environment.

### Implementation preparation

After contract approval, derive a migration inventory from actual port bindings and callers. Record source ownership, complete responsibility, proposed regrouping, shared state/resource ownership and applicable verification evidence. This is analysis material, not a second runtime capability registry. Check references before moving exported symbols, and inspect layout-sensitive checks, generators and documentation instead of assuming all tooling is directory-independent.

Current reference documents:

- [Framework glossary](../../framework/GLOSSARY.md)
- [ADR-0002: Semantic extension framework](../../docs/adr/0002-semantic-extension-framework.md)
- [Capability interface architecture](../../framework/docs/capability-interface-architecture.md)
- [Harness integration guide](../../framework/docs/harness-integration.md)
- [Static integration checking](../../framework/docs/integration-check.md)
- [Framework capability navigation](../../framework/docs/framework-capabilities.md)
- [Testing policy](../../docs/agents/testing.md)
- [Harness support and version verification](../../framework/docs/harness-support.md)
- [Local issue tracker](../../docs/agents/issue-tracker.md)

Approved contract: [Promises, observation seams and acceptance responsibility](./contract.md). The user approved the existing-seam proposal, the preservation implications from the six-surface review, and Rapid iteration with the contract's single designated human-led TUI check. Implementation has not begun.

Next step: run /to-tickets .scratch/pi-adapter-source-aligned-refactor/contract.md. The contract owns promises and observation seams; tickets will own delivery slices and link their acceptance criteria to the contract's promise identifiers.
