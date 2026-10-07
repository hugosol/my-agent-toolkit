# 08: 原生边界规则与执行契约如何写入 ADR 0002: Lighthouse

> Question and discussion: [08: 原生边界规则与执行契约如何写入 ADR 0002](../decision/08-native-boundary-adr.md)

## Question

来源：07 讨论后的用户提问（2026-10-07）——「是否要把『某些模块不准使用原生 API』这条规则写入文档/ADR，以防后续开发时 agent 为绕过限制而偷偷放宽」。

现状：原则已在 ADR 0002 §Agent-runtime loading and source dependencies（shared logic 不 import 原生类型；agent-runtime-specific code 可直接用原生能力），取舍也在 §Responsibility test 表（native capability 由 agent-runtime-owned 实现直接调用，不在框架里镜像整套原生接口）；04 收出扩展侧 allow-list；07 把 03 的 invariant 改写为逃生舱路径；机械执行点是 `tests/framework/import-boundary.test.ts`。ADR 0002 未记录：逃生舱目录约定、测试作为执行点、测试的词法局限、以及「放宽/绕过属非 additive 架构变更」的元规则。需决定写入形式、元规则与测试局限表述，并核对 ADR 0002 与 02/04/07 的漂移。

本票据只形成决策，不实施代码。

## 承接约束

- 地图目的地含「自定义代码的能力边界」，本票据此在内。
- 来源 [04 lighthouse](./04-interaction-native-boundary.md)：原生 allow-list（managed timer + 真实 sessionId/cwd/model）、共享 logic 不 import 原生类型、禁止注册原生事件 hook。
- 来源 [07 lighthouse](./07-effect-callback-capabilities.md)：import-boundary invariant 的改写与 `ESCAPE_HATCH` 对齐；ADR 0002 只做 additive 变更。
- 来源 ADR 0002：`framework/core|behaviors` 与扩展共享 logic 的边界原则；「非 additive 变更需本文档显式决策」；§State and recovery seam。
- 来源 `tests/framework/import-boundary.test.ts`：扫描根、原生包正则、逃生舱路径、三条测试。

## Discussion

### 1. 执行契约写入 ADR 0002 的 additive 小节

选定：不新开 ADR 文件，作为 ADR 0002 的 additive 小节「Enforcement of the native boundary」，置于 §Agent-runtime loading and source dependencies 之内，对齐 03/05 已落进 ADR 的写法。理由：它补全既有原则，不构成新决策族；ADR 0002 自述是框架架构决策的权威文档。内容：逃生舱 = `framework/adapters/**` 与 `extensions/<id>/runtimes/**` 两处；`tests/framework/import-boundary.test.ts` 为执行点。**被否决**：另立独立 ADR（会与 0002 的 source-layout 段重复）。

### 2. 元规则：放宽/绕过原生边界 = 非 additive 架构变更

选定：写入 ADR——放宽 `ESCAPE_HATCH`、加等价旁路、把原生访问移出两处目录，均属非 additive 架构变更，必须在 ADR 0002 显式决策，不是实现细节。这是对 ADR 既有「公开接口 additive-only」规则的对称补全。

### 3. 测试局限与表述

选定：ADR 写明测试是**词法扫描**（`require(...)`、拼接/计算 specifier、别名可绕），因此**原则权威、测试是机械警报**；本次不要求把测试升级为 AST/依赖图检查（有具体需要时另议）。

### 4. ADR 0002 与已决项的漂移对齐

选定：一并补齐。ADR 0002 现增补 02（`directed` 控制类别 + per-field persistence/inheritance），并修正 §Framework-owned capabilities 中「subagents follow... live following」与 02「默认不继承 + codebase-tools 显式 opt-in」的矛盾；增补 04（统一 `info|error` 反馈、`hasUI`、marker 所有权、声明值写接缝、原生 allow-list）；增补 07（owner-scoped 可保留句柄与 retire 失效、`session_end.owner`、移除 `previousOwnerKey`）。03/05 原本已在 ADR 中。

### 5. 文档更新现在执行

用户明确：文档更新不等到代码实现期。已执行 ADR 0002 的五处编辑。未动 `docs/framework-capabilities.md`（已实现符号索引，引源码行、控制类别为闭集，02/04/07 符号未实现，写进去会失真，按该文件自身维护规则留到实现时）与 `docs/agent-runtime-support.md`（观察事实登记，非计划能力）。

---

## Decision

原生边界的执行契约写入 ADR 0002 的 additive 小节「Enforcement of the native boundary」：逃生舱固定为 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`，由 `tests/framework/import-boundary.test.ts` 机械执行（词法、尽力而为；ADR 原则权威）；放宽/绕过属非 additive 架构变更，必须 ADR 0002 显式决策；并一并补齐 ADR 0002 与 02/04/07 的漂移（含修正 §Framework-owned capabilities 的继承表述）。文档在决策时即更新，不推迟到实现期。

## User stories

1. As a 框架维护者, I want 原生边界有 ADR 级执行契约（逃生舱两处 + 测试作为执行点）, so that 后续实现者知道哪些目录能碰原生、边界由什么守住。
2. As a 框架维护者, I want 「放宽/绕过原生边界 = 非 additive 架构变更」写成规则, so that agent 或人不能以实现细节为名偷偷扩宽边界。
3. As a 框架维护者, I want ADR 写明测试是词法、尽力而为、原则权威, so that 不会把「测试通过」误当成边界成立。
4. As a 未来维护者, I want ADR 0002 与 02/04/07 的已决项一致（含继承表述修正）, so that 读 ADR 就能拿到正确的当前架构而非 02 之前的旧默认。
5. As a 迁移实施者, I want 文档更新在决策时完成而非拖到实现期, so that 权威文档不会长期与决策漂移。
6. As a 扩展开发者, I want 我的 extension `runtimes/` 是唯一原生入口, so that 共享 logic 保持运行时无关、可 mock 验证。

## Preconditions

- 04 与 07 已 resolved（原生 allow-list 与 import-boundary invariant 改写）。
- ADR 0002 存在且自述为框架架构决策的权威文档；`tests/framework/import-boundary.test.ts` 已实现并编码 `ESCAPE_HATCH`。
- `docs/framework-capabilities.md` 是已实现符号索引（引源码行）；`docs/agent-runtime-support.md` 是观察事实登记——二者不承载计划能力。

## Postconditions

- ADR 0002 新增：§Enforcement of the native boundary、§Directed control and per-field State lifecycle（02）、§Owner-scoped effect capabilities（07）、§Extension feedback, marker, and declared-value writes（04），并让 §Framework-owned capabilities 的继承表述指向 02。
- ADR 0002 与 01–07 的已 resolved 框架决策一致（03/05 原有，02/04/07 本次补齐）。
- 实现期仍需：`docs/framework-capabilities.md` 按符号落地同步；OMP-qualified 项在 `agent-runtime-support.md` 能力差异表可见（06 验收）。
- 06 验收范围不变（原生 allow-list 条目已含 04/07 的约束）。

## Invariants

- 原生 escape hatch 固定为 `framework/adapters/**` 与 `extensions/<id>/runtimes/**`；共享源不 import 原生类型、不注册原生 hook。
- 放宽/绕过边界必须显式修订 ADR 0002（非 additive）。
- 测试是机械警报，ADR 原则权威。
- ADR 0002 是框架架构决策的单一权威文档；术语在 GLOSSARY、观察事实在 `agent-runtime-support.md`，不重复维护 policy。
- 框架公开接口与架构记录 additive-only。
