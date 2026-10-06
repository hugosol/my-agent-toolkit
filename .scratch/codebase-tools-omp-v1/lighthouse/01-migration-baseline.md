# 01: 确定迁移基线、框架能力契约与行为验收边界: Lighthouse

> Question and discussion: [01: 确定迁移基线、框架能力契约与行为验收边界](../decision/01-migration-baseline.md)

## Question

选择哪个原实现修订作为可逆迁移基线，并如何区分必须保持的业务行为、陈旧描述和既有架构明确要求纠正的行为？

讨论必须覆盖：建立完整行为验收清单并明确“启用轮”事件；处理两份提示词相同而旧术语表描述 reminder 为指针的矛盾；划清进程级开关与架构要求的 owner 隔离的验收边界；固定持久化契约来源、不造通用 schema；区分原测试的业务断言与绑定旧文案/实现的断言。

## Discussion

### 交付物重定义

本票的重点契约来源是**框架承诺实现的能力**；codebase-tools 行为是清晰的需求 oracle，只需冻结。产出两层：冻结的 @34d7c40 行为与持久化契约（验收标尺）+ 由此倒推的框架能力清单 C1–C15（决策内容）。

### 迁移基线

锁定 `my-omp-toolkit` @ `34d7c40`（当前 HEAD，无 tag，工作区干净），连 lockfile 一起记录。

### “启用轮”语义

核实 OMP `before_agent_start`（`extensibility/extensions/types.ts:842`；触发点 `session/agent-session.ts:7327`，调用方 `:7288`/`:7513`）：每用户提交轮触发一次，工具续轮与同 run 内多模型请求不重触发。定义“启用轮”= 一次 agent-run initiation。

### 陈旧描述与提示词

两个 prompt 文件实际相同；旧 glossary 与 `prompts.ts` 注释把 reminder 描述为“一行指针”属原仓库文档缺陷。迁移以实际内容为准，不改写提示词，不修原仓库文档。

### 贡献通道

init 与 reminder 是两个独立贡献槽位（`first-enabled-run` / `every-enabled-run`），内容与激活条件独立配置；文本相同是巧合。

### Owner 隔离边界

保持“子代理实时跟随主会话当前 on + 各自 init 进度”；纠正“进程全局 `globalOn`”→ owner 关联；owner 身份/写权限/恢复/多主会话隔离移交 04；未决定部分不得称“兼容”。

### 持久化来源

来源 = 原 `state.ts`（`codebase-tools:state`、`{on, initInjected}`、last-wins、非布尔回落默认）+ 消息身份（`codebase-tools:init`/`-reminder`、`display:false`、`attribution:"agent"`）+ ADR-0001；双向可逆按 ADR-0002，在同一份真实 session entry 上验证。

### 框架能力清单与拒绝原则

C1–C15（见 ticket 表）；每项声明必须语义，Agent 运行时不能满足则显式拒绝/报告阻碍，不静默降级。

### 测试结构

原测试搬作 **codebase-tools 扩展验收**（消费者可见行为，只适配测试 Agent 运行时）；另设 **框架能力测试**（C1–C15 不变量），分目录、分责任，并作 Agent 运行时升级回归警报。

---

## Decision

锁定 codebase-tools @ `34d7c40` 为需求 oracle，并把“完整迁移”定义为：框架以 C1–C15 能力契约支撑 codebase-tools 全部消费者可见行为；“启用轮”= 每用户轮一次，init/reminder 为两个独立贡献槽位，State 以 owner 关联替代进程全局；每项能力声明必须语义，Agent 运行时不满足则显式拒绝而非降级；扩展验收与框架能力验证分目录成两套测试。

## User stories

1. 作为框架维护者，我想要一份明确的框架能力契约清单（C1–C15）及各能力的必须语义与拒绝条件，以便后续规格与 implementation 票在稳定边界上推进，而不是在实现时临时决定。
2. 作为框架维护者，我想要 codebase-tools @34d7c40 的行为与持久化契约被冻结为需求 oracle，以便迁移验收有客观标尺且不借机改写业务。
3. 作为扩展作者，我想要把 init 与 reminder 声明为两个独立贡献槽位（首次启用轮 / 之后每个启用轮），以便不同注入位置可独立配置，而不靠包装 Agent 运行时 hook。
4. 作为主会话用户，我想要子代理实时跟随主会话当前激活值、各自维护 init 进度，以便多会话与子代理下不串扰。
5. 作为子代理运行者，我想要框架按 owner 关联 State 而非进程全局，以便并行主会话与子代理不互相污染。
6. 作为用户，我想要 Agent 运行时无法满足必须语义时收到显式、用户可见的提示（非模型指令、非会话历史），以便不会静默降级。
7. 作为维护者，我想要旧↔新实现能在同一份存储上可逆往返（旧写→新读写→旧读写→新读），以便两种实现可无数据转换地互斥切换。
8. 作为框架维护者，我想要共享业务逻辑不 import Agent 运行时类型，以便框架与扩展可跨 Agent 运行时移植。
9. 作为扩展作者或 agent，我想要一份“能力与选项清单”md 文档作为能力入口索引，以便快速理解框架有哪些能力入口，细节再读源码。
10. 作为维护者，我想要扩展验收测试与框架能力测试分目录、分责任，以便消费者可见行为与框架不变量互不掩盖。
11. 作为维护者，我想要框架能力测试同时充当 Agent 运行时升级回归警报，以便绿色测试不被当作对 Agent 运行时版本的自动认证。

## Preconditions

- `my-omp-toolkit` @ `34d7c40` 可只读访问，作为需求 oracle 与持久化契约来源。
- OMP 18.5.0 源码可核对 `before_agent_start`/loader 语义；已观察安装运行时为 18.4.6。
- ADR-0002 既定约束已接受：历史保护、owner 作用域 State、双向可逆持久化、必要语义不静默降级。
- 本票是 04/05/06/07/08 的前置；03 同时等 01 与 02。

## Postconditions

- codebase-tools 行为 oracle（10 条）与持久化来源冻结。
- 框架能力清单 C1–C15 建立，各能力组归属下游票。
- “启用轮 = 每用户轮一次”“init/reminder 两槽位”“owner 关联替代 globalOn”成为下游约束。
- 两套测试的目录/责任分离成为验收结构。
- C14（拒绝/缺失反馈）与 C15（能力清单文档）作为新增关注点进入地图。

## Invariants

- 不修改原扩展、agent 源码或用户全局配置；原仓库保持独立。
- 契约以框架能力为准，codebase-tools 行为是 oracle；不把未决定行为称作兼容。
- 不得以进程全局近似 owner。
- 必须语义不可静默降级；不满足则拒绝。
- 历史保护：只追加，不重写现有会话条目。
- 持久化双向可逆，同一份存储，无通用 schema/版本迁移。
- 永久测试只断言消费者可见行为，不 pin 源码文案/模块形状/测试后门。
- 对齐 ADR-0002 的 `framework/` + `extensions/` + `entrypoints/` 布局与官方术语（State / instruction contribution / subagent State inheritance）。

---

## Addendum（2026-10-07 traverse 审计）

- 持久化兼容（两向）已放弃：本文件 Discussion「持久化来源」、User story 7、Preconditions 与 Invariants 中「双向可逆 / 旧↔新可逆往返 / 旧写→新读写→旧读写→新读」相关表述全部作废。
- 迁移基线 @34d7c40 仍是行为 oracle，但不含持久化兼容：新实现只读写 `{enabled}`、不读旧 `{on}`、不写 `initInjected`；旧会话 resume 回落 off；init 进度按当前 branch 是否已有槽位贡献身份推导。
- C1–C15 能力清单与两套测试结构不变；持久化迁移验证移入地图 Out of scope，见 [05 Addendum](05-contribution-contract.md) 与地图 Destination note。
