# 02: 选择首版 OMP 候选运行组合与支持准入规则: Lighthouse

> Question and discussion: [02: 选择首版 OMP 候选运行组合与支持准入规则](../decision/02-candidate-support.md)

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

## Discussion

### 1. 基线与环境锚点

用户日常安装的 OMP 会持续升级（绘图时记录 18.4.6，本会话实测已是 18.6.1），因此开发过程需要冻结一个基线。用户选择以**本地源码**为准（`E:/Developer/myhub/oh-my-pi` @ `9348320`，发布版本 18.5.0），因为开发期可以直接对照 OMP 源码核对语义。平台/运行时固定为 Windows x64 + Bun 1.4.2；Node 24.18 只是既有环境，不作支持声明。不采双候选、不声明版本范围。已验证该 checkout 可隔离源码运行（`bun .../src/cli.ts --version` → `omp/18.5.0`）。

被否决的替代：以当前安装的 18.6.1 为锚点（用户不想让日常版本更新拖累开发基线）；18.5.0+18.6.1 双候选（用户认为小版本变更不影响框架能力承诺，不值得双份验证成本）；声明 18.5.0–18.6.x 范围（范围会把未验证的中间版本一并吞掉）。

### 2. 运行模式与验收面

codebase-tools 的消费者可见行为（marker、notify、命令切换）由用户在交互 TUI 亲自验收；框架能力（C1–C15）以自动化测试为验收面，延续 01 已确立的两维度/分目录结构（扩展验收 vs 框架能力测试）。不声明 text / ACP / SDK / IDE 模式。

被否决的替代：仅无头验证（marker 只在交互面可见，无法覆盖业务契约）；全模式声明（无使用需求，且属未经证实的负担）。

### 3. Provider / 模型能力条件

`developer`-role 等必要语义按 provider 路径不同，现状「跨 provider 未证实」。首版取最小代表集：主力 `deepseek/*` + 异构 `openai-codex/*`。只在被 C9 探针证明满足必要角色语义的路径上声明；未证明路径显式提示未验证，不声明、不静默降级为 user role。用户明确指定 deepseek 为主、openai-codex 为辅。

### 4. 未列版本/组合的准入政策

未列 Agent 运行时版本/组合 → 显式用户可见通知一次后继续运行（未验证状态，不声明支持）。用户认为小版本更新不应影响框架能力承诺，因此不采用「直接拒绝激活」。但准入放宽只针对**版本未列**：若某项必须语义（角色/历史保护等）被证明无法满足，仍须拒绝该能力——版本未列 ≠ 语义可降级。检查时机 = 扩展装载/绑定、注册命令与贡献之前（Agent 运行时 `resources_discover` 事件带 `startup`/`reload` 原因，可作生命周期参考）；具体反馈通道细节归 06/C14。

被否决的替代：直接拒绝激活（用户日常版本会持续更新，拒绝会打断使用）；静默放行（ADR 明令未知条件不得转为放行、必要语义不可静默降级）。

### 5. 隔离验证手段

允许：隔离 agent state（临时 `PI_CODING_AGENT_DIR`，或 `OMP_PROFILE`/`--profile`）+ `--no-extensions -e <root>`（`explicit-only`，屏蔽配置与安装来源）+ `-p` 无头；需要 18.5.0 时直接跑本机 checkout 源码（或以独立 `npm i --prefix <temp>` 精确安装）。禁止：修改全局 npm 安装、正式 `~/.omp` 配置/会话、任何 Agent 运行时源码补丁或 monkey-patch。这些开关均已在 18.6.1 源码中核实存在。

### 6. 热重载 vs 会话恢复

**代码热重载（hot reload）**：改完框架/扩展源码后经 `/reload-plugins` 是否能在不重启的前提下生效，Agent 运行时有 reload 入口不代表会重新 `import` 改动源码（模块缓存）。依据 [agent-runtime-support.md](../../../docs/agent-runtime-support.md) 与 [ADR-0002](../../../docs/adr/0002-semantic-extension-framework.md)，该行为必须单独验证。首版不承诺它，只承诺进程重启后源码变更生效；作为 deferred item 记入框架 backlog。**会话恢复（resume/state restore）**：恢复 `{on, initInjected}`、branch last-wins 是 C4 契约，首版在范围内，归 04/07/08，与本条互不影响。

被否决的替代：首版验收 reload（会占用必要语义的验证预算，且当前无证据表明可行）。

### 7. 测试版本维护与升级回归

支持目标固定 18.5.0 本地源码基线，测试**不追 HEAD**，用 checkout 源码即可复现。框架测试设计成可对任意 Agent 运行时版本运行；默认/CI 只跑 18.5.0。可选在隔离安装的更新候选上跑同一套，作为升级回归警报；绿灯**不自动**扩大支持声明——支持声明是维护者的显式决定（ADR-0002 第九范围；agent-runtime-support「a pass never automatically approves an agent-runtime version」）。

### 8. 交付阻碍报告

若所有候选都无法经扩展接口满足必要契约：停止推进实现票；在票据/地图逐项记录失败语义、已试候选与证据；走 C14 通道给用户可见提示；不补丁 Agent 运行时、不缩减“完整迁移”范围。该政策由地图 Out of scope 与 ADR-0002 决定，用户无异议。

---

## Decision

首版只承诺**一个精确运行组合**：本地源码基线 `@oh-my-pi/pi-coding-agent@9348320`（= 18.5.0，Windows x64 + Bun 1.4.2）；codebase-tools 在交互 TUI 由用户验收、框架能力用自动化测试验收；未列版本显式通知一次后继续运行但必须语义不满足仍拒绝；探针一律隔离进行；代码热重载延后到 backlog，resume/State 恢复仍属首版。

## User stories

1. 作为框架维护者，我想要一个冻结的基线（本地源码 `9348320` = 18.5.0、Windows x64 + Bun 1.4.2），以便支持声明与升级回归都有客观、可复现的锚点。
2. 作为框架维护者，我想要基线就是本地 OMP 源码 checkout，以便开发期能直接对照 Agent 运行时源码定位接口语义，而不必追安装产物。
3. 作为用户，我想要 codebase-tools 的消费者可见行为在交互 TUI 由我亲自验收，以便 marker、notify 与命令切换按真实使用面被确认。
4. 作为框架维护者，我想要框架能力（C1–C15）有自动化测试覆盖，以便 Agent 运行时升级引起的语义变化能被回归警报发现。
5. 作为用户，我想要未列 Agent 运行时版本只给一次显式通知后继续可用，以便小版本升级不打断日常使用、也不被误当作已支持。
6. 作为框架维护者，我想要未证明的 provider 路径显式提示未验证而非降级为 user role，以便 developer-role 等必要语义不会被静默弱化。
7. 作为维护者，我想要一切 Agent 运行时探针在隔离 agent state 与 `explicit-only` 扩展下运行，以便用户的全局安装、正式配置与真实会话不被触碰。
8. 作为维护者，我想要首版不承诺代码热重载、并把 reload 支持记入 backlog，以便验证预算集中在必要语义上而不被未证实的热更假设绑架。
9. 作为用户，我想要 session resume 仍在首版范围内恢复 `{on, initInjected}`，以便重启/恢复后的行为与旧实现一致。
10. 作为框架维护者，我想要所有候选都失败时停止并记录阻碍，以便不会以补丁 Agent 运行时或缩减迁移范围来掩盖不支持的事实。

## Preconditions

- 本地 `oh-my-pi` checkout 可只读访问并停在 revision `9348320`（发布版本 18.5.0），且可隔离源码运行（已验证）。
- 01 已冻结 codebase-tools @ `34d7c40` 的需求 oracle 与 C1–C15 框架能力契约。
- 隔离开关在本机可用：`PI_CODING_AGENT_DIR`、`--profile`/`OMP_PROFILE`、`--no-extensions -e`、`-p`（已核实）。
- 本票是 03 的前置：03 的 Agent 运行时探针依赖本票选定的候选与隔离方式。

## Postconditions

- 支持集 = 恰好一个精确组合：`@oh-my-pi/pi-coding-agent@18.5.0`（本地源码基线 `9348320`）+ Windows x64 + Bun 1.4.2；**无版本范围**。
- 验收结构固定为：交互 TUI（codebase-tools 消费者可见行为）+ 自动化测试（框架能力 C1–C15），目录与场景归 08。
- provider 最小代表集 = `deepseek/*`（主）+ `openai-codex/*`（辅）；只在证明后声明。
- 准入政策：未列版本通知一次 + 继续；必须语义不满足仍拒绝；检查时机在注册命令与贡献之前。
- 隔离规则与禁止清单生效，约束 03/07/08 的探针与验收。
- 代码热重载延后项进入框架 backlog；resume/State 恢复属于首版 C4。
- 03 的探针目标、隔离方式与证据级别要求被本票固定。

## Invariants

- 支持声明只覆盖已验证的精确组合，不声明版本范围（对齐 C13 与 ADR-0002 的 `exact-version versus version-range admission`）。
- 版本未列 ≠ 语义可降级；必要角色/历史语义不满足仍须拒绝（ADR-0002「Reject a behavior whose required role or insertion semantics cannot be met rather than silently substituting a weaker behavior」）。
- 不修改 agent 源码、全局安装、正式配置与会话（地图 Notes 的用户确认）。
- 代码热重载与 resume/State 恢复是两个独立轴，不得混同；C4 恢复始终在首版内。
- 测试版本维护沿用「绿灯不认证」：一次通过不会自动批准某个 Agent 运行时版本（ADR-0002 第九范围、agent-runtime-support）。
- 探针一律走隔离 agent state + `explicit-only` 扩展根，避免旧实现与用户配置串入。
- 语言与术语沿用 Agent 运行时官方词汇（State / instruction contribution / subagent State inheritance），与 01 的 C1–C15 命名对齐。
