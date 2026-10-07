# 原生边界规则与执行契约如何写入 ADR 0002

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: resolved
Blocked by: none

## Question

来源：07 讨论后的用户提问（2026-10-07）——「是否要把『某些模块不准使用原生 API』这条规则写入文档/ADR，以防后续开发时 agent 为绕过限制而偷偷放宽」。

现状（已核）：

- 原则已在 [ADR 0002 §Agent-runtime loading and source dependencies](../../../docs/adr/0002-semantic-extension-framework.md)：「shared logic must not import native agent-runtime types merely because both are locally available. Agent-runtime-specific code may use native capabilities directly.」§Responsibility test 表同向：「Native capability itself → agent-runtime-owned implementation, called directly where needed; do not mirror the entire native interface in the framework」——即「不做全量原生包装层」的取舍也已记录。
- 04 把「扩展直连 OMP 原生」收成 allow-list：只允许 `extensions/connect-bot/runtimes/omp.ts` 的 managed timer 与真实 sessionId/cwd/model。
- 07 把 03 的 invariant 改写为：**框架共享源（framework core/behaviors/definition）与扩展非 `runtimes/` 模块不命名/不导入原生 API；原生访问只允许出现在 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`**。
- 机械执行点是 [`tests/framework/import-boundary.test.ts`](../../../tests/framework/import-boundary.test.ts)：`SCANNED_ROOTS = framework/extensions/entrypoints`、`AGENT_RUNTIME_PACKAGE = /^@(?:oh-my-pi|earendil-works)\//`、`ESCAPE_HATCH = framework/adapters/** | extensions/*/runtimes/**`，用词法正则扫 import specifier（非 AST）。

ADR 0002 **未记录**：

1. 逃生舱目录约定本身（`framework/adapters/**`、`extensions/<id>/runtimes/**`）；
2. 该测试作为执行点（ADR 未指向它）；
3. 测试是「尽力而为」的词法检查（`require(...)`、拼接/计算出的 specifier、转译别名可绕过），因此**原则权威、测试只是机械牙齿**；
4. 元规则：放宽 `ESCAPE_HATCH`、改用非 import 形式绕过、或在共享源引入等价依赖，属**非 additive 架构变更**，必须显式修订 ADR 0002，而不是当作实现细节——ADR 末尾目前只对「framework 公开接口」立了 additive-only 规则。

需决定：

1. 这条执行契约是否、以及以何种形式写入 ADR 0002（additive 小节，对齐 03/05 已落进 ADR 的写法；或另立 ADR 文件）。
2. 是否确立上述元规则（放宽/绕过原生边界 = 需 ADR 显式决策）。
3. ADR 与执行测试是否互相指向；测试的词法局限如何在 ADR 里表述（原则权威 + 测试尽力，还是要求后续把测试升级为 AST/依赖图检查）。

附带核对（本票一并裁定或明确另立）：

- ADR 0002 目前只落了 03（Semantic lifecycle model）与 05（Extension configuration）的决策；02（per-field `persistence: "memory"`、per-field 继承开关默认不继承、`directed` 控制类别）与 04（统一 `info | error` 反馈、`hasUI`、marker 文本）与 07（owner-scoped 保留句柄与 retire 失效）是否漂移未落？
- 已知一处矛盾：ADR 0002 §Framework-owned capabilities 仍写「subagents follow the owning main session's current activation value」的 live-following 初始行为，而 02 改为「默认不继承 + codebase-tools 显式声明可继承」；02 的 postcondition 本就要求「ADR 0002 §Subagent State inheritance 需对应更新」。
- 若漂移成立，本票产出「ADR 0002 补齐清单」作为 postcondition（文档编辑在实施阶段），还是把各漂移另立票据？

本票据只形成决策，不实施代码；ADR 0002 文件编辑不在本票执行。

---

## 承接约束

- 地图目的地含「自定义代码的能力边界」，本票据此在内。
- 来源 [04 lighthouse](../lighthouse/04-interaction-native-boundary.md)：原生 allow-list（managed timer + 真实 sessionId/cwd/model）、共享 logic 不 import 原生类型、禁止注册原生事件 hook。
- 来源 [07 lighthouse](../lighthouse/07-effect-callback-capabilities.md)：import-boundary invariant 的改写与 `ESCAPE_HATCH` 对齐；ADR 0002 只做 additive 变更。
- 来源 ADR 0002：`framework/core|behaviors` 与扩展共享 logic 的边界原则；「非 additive 变更需本文档显式决策」；§State and recovery seam。
- 来源 `tests/framework/import-boundary.test.ts`：扫描根、原生包正则、逃生舱路径、三条测试（共享源不越界 / 逃生舱外无原生导入者 / entrypoint 只做一处 re-export）。

---

## 讨论结果（2026-10-07）

### 1. 执行契约写入 ADR 0002 的 additive 小节

- 选定：不新开 ADR 文件，作为 [ADR 0002](../../../docs/adr/0002-semantic-extension-framework.md) 的 additive 小节「Enforcement of the native boundary」，置于 §Agent-runtime loading and source dependencies 之内；对齐 03/05 已落进 ADR 的写法。理由：它补全既有原则（shared logic 不 import 原生类型），不是新的决策族；ADR 0002 自述是「framework architecture decisions」的权威文档。
- 内容：逃生舱 = `framework/adapters/**` 与 `extensions/<id>/runtimes/**` 两处；`tests/framework/import-boundary.test.ts` 为执行点（扫描 framework/extensions/entrypoints、原生包正则、相对 import 归一化、entrypoint 单 re-export）。

### 2. 元规则：放宽/绕过原生边界 = 非 additive 架构变更

- 选定：写入 ADR——放宽 `ESCAPE_HATCH`、加等价旁路、把原生访问移出两处目录，都属非 additive 架构变更，必须在 ADR 0002 显式决策，不是实现细节。这是对 ADR 既有「公开接口 additive-only」规则的对称补全。

### 3. 测试局限与表述

- 选定：ADR 里写明测试是**词法扫描**（`require(...)`、拼接/计算 specifier、别名可绕），因此**原则权威、测试是机械警报**；本次不要求把测试升级为 AST/依赖图检查（留待有具体需要时另议）。

### 4. ADR 0002 与已决项的漂移对齐（附带核对，一并裁定）

- 选定：一并补齐。ADR 0002 现在增补 [02](../../../.scratch/connect-bot-migration/decision/02-command-state-ownership.md)（`directed` 控制类别 + per-field persistence/inheritance），并修正 §Framework-owned capabilities 中「subagents follow... live following」与 02「默认不继承 + codebase-tools 显式 opt-in」的矛盾；增补 [04](../../../.scratch/connect-bot-migration/decision/04-interaction-native-boundary.md)（统一 `info|error` 反馈、`hasUI`、marker 所有权、声明值写接缝、原生 allow-list）；增补 [07](../../../.scratch/connect-bot-migration/decision/07-effect-callback-capabilities.md)（owner-scoped 可保留句柄与 retire 失效、`session_end.owner`、移除 `previousOwnerKey`）。
- 03/05 已在 ADR 中（§Semantic lifecycle model、§Extension configuration）；本票补齐 02/04/07，使 ADR 0002 与全部已 resolved 的框架决策一致。

### 5. 文档更新现在执行

- 用户明确：文档更新不等到代码实现期。
- 已执行：ADR 0002 的五处编辑（原生边界执行契约、02、04、07、继承表述修正）。
- 未动：`docs/framework-capabilities.md` 是**已实现符号索引**（每个符号引源码行、控制类别是闭集 `BOUND_CONTROL_KINDS=["toggle"]`）；02/04/07 的符号尚未实现，写进去会与源码引用失真，按该文件自身的维护规则留到实现时同步。`docs/agent-runtime-support.md` 是**观察事实登记**（非计划能力），同理不动。
