# 用什么证据证明迁移等价且框架边界成立

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: open
Blocked by: 03, 04, 05

## Question

前述设计确定后，需要哪些验收证据，才能认定 connect-bot 迁移及新增框架能力满足本次验收范围？

按《保留哪些行为，以及以哪个原实现版本为准》确定的收窄口径，证据分两层：(1) 新引入的框架能力在 **framework 层** 验收——connect-bot 若只是复用框架既有行为则不重复测试；(2) 扩展层可独立测试的行为用**隔离测试**验收，**允许 mock**，不要求与 omp-bot 集成。

真实 OMP × 真实 omp-bot 的接入、状态变化、心跳、断开、切会话、失联及恢复，**由用户在迁移后手动执行**，作为人工观察项报告，不作为自动化验收门；本票为其产出一份可执行观察清单（前置、每步观察点与预期）。

形成原行为到设计责任层及验收证据的映射，区分确定性可自动验证的边界与需要现场观察的场景。覆盖多会话隔离、与 codebase-tools 共存、框架原有行为不回退、新旧装载互斥和配置切换，明确源版本及运行时基线的记录要求。只定义验收标准，不执行迁移或在本票据中补做未决定的接口设计。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

---

## 承接约束（来源：backtracer，据 [01 lighthouse](../lighthouse/01-behavior-baseline.md)）

- **（a）保留项 ↔ 面板 S2 对照表**：产出「01 的九项保留行为」与面板侧 `contract.md` 的 S2 承诺（P1–P11）逐条对照，标明每项由扩展契约、框架能力还是面板契约承担。
- **（b）loader 装载冒烟的归属**：原 L2 冒烟（真 omp loader 装载）与 ADR 0002「必须用真实安装的 loader 验证 entrypoint 从发现目录之外导入」的要求，在 01 收窄后归属未定——本票须明确它是自动化验收项，还是并入用户手动验收轮。
- **（c）新增框架能力清单**：汇总 02/03/04 各自判定的「新引入的框架行为」，形成本票 framework 层验收可直接消费的清单。
- **（d）02 引入的框架能力与既有扩展不回退**（来源：[02 lighthouse](../lighthouse/02-command-state-ownership.md)）：验收清单须覆盖 `directed` 控制类别、per-field `persistence: "memory"`、per-field 继承开关（默认不继承）、handler State 写接缝、每次 `enabled` 写入后发布 marker；并确认 codebase-tools 显式声明「可继承」后原有子代理跟随行为不回退，以及 `tests/framework/owner-inheritance.test.ts` 与 ADR 0002 §Subagent State inheritance 已同步。
