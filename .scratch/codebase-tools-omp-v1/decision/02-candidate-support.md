# 选择首版 OMP 候选运行组合与支持准入规则

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by:
Lighthouse: [02-candidate-support](../lighthouse/02-candidate-support.md)

## Question

在不修改任何 agent 源码、仅通过 extension 实现能力的限制下，首版优先验证哪些明确的 OMP 运行组合，如何区分已支持、不满足必要语义和尚未验证的环境？

需要决定：

- 候选 OMP 版本/修订、运行时与平台、运行模式、provider 协议及相关模型能力条件。依据使用需求和已有证据选择有限候选，不把版本号或内部 developer 角色当作完整支持证明。
- 原环境无法运行时，可使用哪些不改变 agent 源码的隔离安装/官方版本验证方式；不能默认修改用户全局安装、正式会话或配置。
- 未列入支持集的版本或组合如何准入，检查时机、用户反馈与拒绝范围是什么；必要角色/历史语义不满足时不能静默降级。
- 首版是否只承诺进程重启后源码变更生效，还是要验收扩展 reload；不根据源码组织推断热重载或断点调试已工作。
- 当所有候选均无法通过扩展接口满足必要契约时，如何报告交付阻碍。不得通过 Agent 运行时补丁或默默缩减完整迁移范围解决。

### 起始证据

[Agent 运行时支持与证据](../../../docs/agent-runtime-support.md) 已区分源码调查与实际运行。绘图时实测 `omp --version` 为 `omp/18.4.6`，`bun --version` 为 `1.4.2`；参考 OMP checkout HEAD 为 `9348320cc4a30a7195d36a1f05a6c11bcb701a17`，源码版本为 18.5.0。上述均未成为本次支持声明。

本票选择候选与准入政策；后续 Agent 运行时探针提供可实现性证据，最终发布仍需替代扩展的验收，不能在此提前认证。

## 讨论结论

### 1. 基线与环境锚点

开发/验证基线 = 本地源码 checkout `E:/Developer/myhub/oh-my-pi` @ revision `9348320cc4a30a7195d36a1f05a6c11bcb701a17`（= 发布版本 18.5.0）。选它的理由是开发期可直接对照 OMP 源码。平台/运行时 = Windows x64 + Bun 1.4.2（Node 24.18 只是既有环境，不作支持声明）。**不声明版本范围**；支持声明锚定这份基线。运行时判定用 Agent 运行时报告的版本号（18.5.0），revision 只是证据锚点、不一定运行时可读。已验证该 checkout 可隔离源码运行：隔离 `PI_CODING_AGENT_DIR` 下 `bun .../packages/coding-agent/src/cli.ts --version` → `omp/18.5.0`（exit 0）。

### 2. 运行模式与验收面

codebase-tools 的消费者可见行为由用户在**交互 TUI** 亲自验收（marker/notify/命令）；框架能力（C1–C15）以**自动化测试**为验收面，延续 01 的两维度/分目录结构。不声明 text / ACP / SDK / IDE 模式。

### 3. Provider / 模型能力条件

最小代表集 = 主力 `deepseek/*` + 异构 `openai-codex/*`。只在被 C9 探针证明满足必要角色语义的 provider 路径上声明；未证明路径显式提示未验证，不声明、不静默降级为 user role。

### 4. 未列版本/组合的准入政策

未列 Agent 运行时版本/组合：显式用户可见通知一次后继续运行（未验证状态，不声明支持）。但若某项**必须语义**（角色/历史保护等）被证明无法满足，仍须拒绝该能力，不得因“版本小”而降级承诺。检查时机 = 扩展装载/绑定、注册命令与贡献之前（Agent 运行时 `resources_discover` 事件带 `startup`/`reload` 原因，可作生命周期参考）。具体反馈通道细节归 06/C14。

### 5. 隔离验证手段

允许：隔离 agent state（临时 `PI_CODING_AGENT_DIR`，或 `OMP_PROFILE`/`--profile`）+ `--no-extensions -e <root>`（`explicit-only`，屏蔽配置与安装来源）+ `-p` 无头；需要 18.5.0 时直接跑本机 checkout 源码。禁止：修改全局 npm 安装、正式 `~/.omp` 配置/会话、任何 Agent 运行时源码补丁或 monkey-patch。

### 6. 热重载 vs 会话恢复

**代码热重载（hot reload）**：首版不承诺；只承诺进程重启后源码变更生效。OMP 入口 `/reload-plugins` 是否重新 import 改动源码（模块缓存行为）属未验证，作为 deferred item 记入框架 backlog。**会话恢复（resume/state restore）**：C4 契约，首版在范围内，归 04/07/08，与本条互不影响。

### 7. 测试版本维护与升级回归

支持目标固定 18.5.0 本地源码基线，测试不追 HEAD；框架测试设计成可对任意 Agent 运行时版本运行，默认/CI 只跑 18.5.0。可选在隔离安装的更新候选上跑同一套作为升级回归警报；绿灯不自动扩大支持声明（支持声明是维护者的显式决定）。

### 8. 交付阻碍报告

若所有候选都无法经扩展接口满足必要契约：停止推进实现票；在票据/地图逐项记录失败语义、已试候选与证据；走 C14 通道给用户可见提示；不补丁 Agent 运行时、不缩减“完整迁移”范围。

## Comments

- 2026-10-06 继续本票（保持 claimed）。刷新起始证据；票据原文的 18.4.6 已过时：
  - 实测安装运行时为 `omp/18.6.1`（npm 全局 `@oh-my-pi/pi-coding-agent@18.6.1`，由 `D:\nvm4w\nodejs\omp.cmd` 以 Bun 1.4.2 启动）；`bun --version` = 1.4.2，`node --version` = v24.18.0。
  - 本机 `oh-my-pi` checkout 仍为 18.5.0 @ `9348320`（C1–C15 的源码证据基准）；npm 已发布区间含 18.4.6…18.6.1（18.5.0/18.5.1/18.6.0/18.6.1 均可用）。
  - 18.6.1 的 npm 包内含 `src/`。与 18.5.0 checkout 逐文件比对：`extensibility/extensions/loader.ts` 一致；`types.ts` 仅新增 advisor 身份文档注释；`runner.ts`/`wrapper.ts` 差异集中于 advisor 工具身份与 shell cache 刷新；`before_agent_start`、`ExtensionAgentIdentity`、`restrictToolNames`/`enableMCP` 在 18.6.1 中均存在。→ 源码级初筛未发现破坏本契约的接口变更；证据级别仍是“源码勘察”，非运行验证。
  - 用户全局 `~/.omp/agent/config.yml` 的 `extensions:` 直接加载 `E:/Developer/myhub/my-omp-toolkit/extensions`，旧 codebase-tools 仍在正式会话装载路径上；故一切探针必须隔离。
  - 已核实可用的隔离开关：`PI_CODING_AGENT_DIR` 覆盖 agent 目录（config.yml 与 sessions 同处其中）；`--profile`/`OMP_PROFILE` 提供命名隔离 agent state；`--no-extensions -e <root>` 以 `explicit-only` 只加载显式扩展根、屏蔽配置与安装来源；`-p`/`--print` 提供无头运行。均不修改 Agent 运行时源码或全局安装。
- 2026-10-06 第一轮 grilling 结论（用户确认）：
  - Q1 支持锚点：以本机 checkout 18.5.0 为准（用户预期小版本变更不影响框架能力）；不采双候选，也不声明版本范围。
  - Q2 运行模式：codebase-tools 的消费者可见验收 = 用户在交互 TUI 亲验；框架能力（C1–C15）验收 = 自动化测试，延续 01 的两维度/分目录结构。
  - Q3 provider 条件：最小代表集（主力 deepseek + 一条异构路径）；只在已证明 C9 角色语义的路径上声明；未证明路径不得静默降级。
  - Q5 准入政策：未列版本/组合 → 显式用户可见通知一次后继续运行（不声明支持）；但若某项**必须语义**（角色/历史保护）被证明无法满足，仍须拒绝，不得因“小版本”而降级承诺。
  - Q4/Q6 用户反问测试版本维护与 reload 延后代价；已核实并在第二轮回答（18.5.0 checkout 可直接源码运行；OMP 已有 `/reload-plugins` 与 `reason: startup|reload`）。
- 2026-10-06 05 取代：本票「必要角色不满足仍拒绝」中的角色部分改为 **agent-runtime-qualified**；codebase-tools 在 OMP 不把 developer wire 角色作为准入门槛，只按 provider 路径记录实际角色（deepseek/openai-codex custom message 出站为 `user`）。版本未列与其他必须语义（历史保护等）的拒绝政策不变；其他 Agent 运行时的角色抽象待定（见 05 lighthouse、ADR-0002、agent-runtime-support `context.required-role`）。
