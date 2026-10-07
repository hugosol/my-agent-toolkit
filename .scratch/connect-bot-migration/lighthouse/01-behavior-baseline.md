# 01: 保留哪些行为，以及以哪个原实现版本为准: Lighthouse

> Question and discussion: [01: 保留哪些行为，以及以哪个原实现版本为准](../decision/01-behavior-baseline.md)

## Question

确定可追溯的原扩展源码、文档和配置基线，逐项界定本次必须保留的用户可见行为；文档、代码或既有测试不一致时，哪一个行为应成为迁移契约？

覆盖接入回执与重复注册、立即本地断开、未接入零网络/定时动作、主会话与 UI 门槛、三类状态的区分、状态上报与心跳、失联停止接入且不自动重连、会话切换与同身份导航、退出后面板过期。核对配置和既有端到端清单，列出保留项及待后续票据决定的差异，不把旧内部结构或测试措辞自动升级为业务要求。面板和协议不变已是范围约束，不重新投票。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

## Discussion

### 基线锚点

选「本机 `my-omp-toolkit` 最新代码 + 开发期冻结」，不逐 blob 哈希固定。事实依据：`extensions/connect-bot` 在整个仓库历史里只存在于一个提交 `d3648a0`（2026-10-01），`master@34d7c40` 与 `extension-framework@df2554c` 两分支上该目录逐字节相同，`v1.0.0`(2026-06-16) 不含此扩展，工作区对该目录无未提交修改，本机也不存在任何已安装副本。用户承诺开发期间 extension 代码与文档不变，因此不需要更强的版本钉扎。

被否决的备选：按 tag/发布版锚定（不存在含此扩展的 tag）；按已安装运行副本锚定（本机无副本）。

同时确认面板侧 `omp-bot@d50e35c` 保持现状。面板侧存在已完成的 wayfinder 产出 `archive-docs/omp-bot/omp-connect-bot/{spec.md,contract.md,decision/,lighthouse/,implementation/}`；扩展 `connection.ts:9` 把 `spec.md §心跳与失败` 写成 locked contract，其出处即该归档 `spec.md`（§157 标题「心跳与失败」），唯一的悬空引用由此解析。

### 冲突仲裁

用户明确否决「自动优先级」方案（无论以代码、README 还是测试为准）。凡代码 / README / 既有测试 / 面板 spec 不一致，**逐条登记为差异项并交用户判断**。理由：默认规则会把未察觉的偏差吞掉，而本次迁移的价值恰恰在于发现并显式裁定它们。

实际核对结果：scout 对 8 个源文件 + 5 个测试文件逐条比对，代码 / README / 测试在全部可核对行为上一致，**没有产生行为级差异项**。仅登记三处非行为项：`spec.md` 悬空引用（已解析）、`smoke-omp.ts` 硬编码 omp 路径与 README 不符（测试工具问题）、README 中的面板侧声明在扩展仓库不可验证（由面板侧契约覆盖）。

### 契约覆盖范围

用户把契约收窄为两类，明确排除集成测试：

1. **新引入的框架行为** —— 若 connect-bot 只是复用框架既有行为，不重复测试；该类测试落在 **framework 层**。
2. **扩展层可独立测试的行为** —— 不需要与 omp-bot 集成，**允许 mock** 验证。

真实环境下的集成测试**由用户手动进行，不要求自动化验证**。这直接改写了《用什么证据证明迁移等价且框架边界成立》原有「不能只凭 mock 宣称端到端成功」的口径；该票正文需按此收窄（framework 层 + 扩展层隔离验收，真实集成为用户手动动作）。

### 保留粒度

用户选择「全部保留」：心跳周期 `10s`、失败预算连续 `3` 次、超时 register `1s` 与 push/unregister `1.5s`、出站队列机制（单 flusher 保序、上限 `16`、满时丢最旧 heartbeat、不重试）、全部提示文案，一律进入契约。被否决的备选是把内部机制判为「可换的实现细节、只保留可观察性质」。

### 九项行为的归属

逐项判定后，八项落在扩展层契约，一项落在面板侧：

| 行为 | 归属 |
|---|---|
| 接入回执与重复注册 | 扩展层契约 |
| 立即本地断开 | 扩展层契约 |
| 未接入零网络/定时动作 | 扩展层契约 |
| 主会话与 UI 门槛 | 扩展层契约 |
| 三类状态的区分 | 扩展层契约（接入开关 + agent 三值）；keepAlive 属面板 |
| 状态上报与心跳 | 扩展层契约 |
| 失联停止接入且不自动重连 | 扩展层契约 |
| 会话切换与同身份导航 | 扩展层契约 |
| 退出后面板过期 | 面板侧，不入扩展契约（扩展刻意不 hook `session_shutdown`） |

---

## Decision

以本机 `my-omp-toolkit` 最新代码（开发期冻结）为唯一行为基线；迁移契约只覆盖「新引入的框架行为（framework 层测试）」与「扩展层可独立测试的行为（允许 mock）」，真实环境集成由用户手动验证、不要求自动化；心跳 10s、失败 3 次、超时 1s/1.5s、出站队列机制与全部提示文案全部保留，冲突逐条交用户判断。

## User stories

1. As a 迁移实施者, I want 以本机 `my-omp-toolkit` 最新代码作为该扩展的行为基线, so that 迁移有唯一可对照的原点，不需要在多个历史版本之间取舍。
2. As a 迁移实施者, I want 开发期内 extension 代码与文档保持冻结, so that 基线与契约在决策和实施的整个期间不会移动。
3. As a 迁移实施者, I want 冲突不在规则层自动裁决而是逐条登记交用户判断, so that 每一处不一致都得到显式裁定，而不是被默认优先级吞掉。
4. As a 迁移实施者, I want 契约只覆盖新引入的框架行为与扩展层可独立测试的行为, so that 不在扩展层重复测试框架已经保证的行为。
5. As a 迁移实施者, I want 扩展层行为允许 mock 验证, so that 扩展能在不与 omp-bot 集成的前提下独立验收。
6. As a 用户, I want 真实环境集成测试由我手动执行, so that 验收不依赖脆弱的自动化 pty 脚本。
7. As a 用户, I want 心跳周期 10s、失败预算 3 次、超时 1s/1.5s、出站队列机制与全部提示文案全部保留, so that 用户可见行为、以及面板 30s 判定窗口所依赖的前提继续成立。
8. As a 面板（既定外部契约）, I want 扩展继续写死 `/api/sessions/events` 与 `{proxy:false}`、沿用 `{sessionId,kind,data}` 信封、并把 404/非 2xx 计为失败, so that 现有面板与协议无需改动即可继续工作。
9. As a 迁移实施者, I want 退出后的面板过期留给面板处理、扩展不新增 `session_shutdown` 钩子, so that 扩展保持单向只读桥且不引入崩溃钩子。
10. As a 迁移实施者, I want 面板侧 `spec.md`/`contract.md` 作为设计意图来源而非扩展行为契约, so that 面板侧行为不被误搬进扩展契约、也不在扩展层重复验证。

## Preconditions

- 本机 `my-omp-toolkit` 最新代码可读；`extensions/connect-bot` 在开发期冻结。
- 面板侧 `omp-bot` 保持 `d50e35c` 现状，协议不变。
- 面板侧归档 `archive-docs/omp-bot/omp-connect-bot/` 的 `spec.md` 与 `contract.md` 可读。
- 本机不存在已安装的 connect-bot 副本（无需比对）。
- 本票只形成决策；解析出的行为清单是后续票据的输入，不等于框架能力已实现。

## Postconditions

- 下游票据以本票的九项归属表为保留范围，不再重新争论「要不要保留 X」。
- 《用什么证据证明迁移等价且框架边界成立》的验收口径被收窄为 framework 层 + 扩展层隔离（mock 允许），真实集成降为用户手动动作。
- 配置的位置与归属明确留给《配置、装载与新旧实现切换如何保持兼容》决定。
- 扩展获得心跳与事件语义的方式（框架钩子与扩展分工）留给《接入命令与会话状态由框架和扩展如何共同管理》《生命周期映射与持续上报由哪一层负责》。

## Invariants

- 三类状态概念——接入状态（已接入/未接入）、面板 keepAlive（在线/离线）、agent 工作状态（工作中/等待用户输入/空闲）——永不合并为单个「在线」值。
- 面板与通信协议不变；扩展保持单向只读桥（只 `POST`，不接受面板指令），沿用唯一端点与既有信封。
- 旧内部结构（模块划分、函数名、文件布局）与测试措辞不自动升级为业务要求。
- 退出/崩溃后的可观察离线继续由面板的过期判定承担，扩展侧不新增钩子，也不实现 30s 逻辑。
- 保留项与面板侧 `contract.md` 的 S2 承诺（P1–P11）逐条对齐；面板侧 S1/S3/S4 只以「扩展必须满足的前提」形式进入契约。

---

## 修订（2026-10-07，02 收口前）

由《接入命令与会话状态由框架和扩展如何共同管理》讨论触发，用户确认：

- 命令词形 `offline` → **`off`**，不保留别名；框架「定向开关」写死「空参=on、`off`=off」。
- 持久连接标识改用**框架统一 marker 区**（由 `enabled` 派生），不再以 footer `setStatus` 为契约要求。
- 「全部提示文案保留」条款重开：文案/通知集合由《自定义交互和原生能力可以越过哪些边界》逐条重新确认。
- 上述三项是本 lighthouse 的显式修改；其余 Decision、User stories、Preconditions、Postconditions、Invariants 不变。待 02 收口后由 backtracer 复核与面板侧 P3/P7/contract 边界决定的一致性。
- 未修改的边界：`my-omp-toolkit` 仍冻结（其 README/测试描述旧实现）；面板侧归档保留历史表述，差异在迁移侧记录。

## 修订（2026-10-07，由《生命周期映射与持续上报由哪一层负责》触发）

- **退出/会话结束语义**：原表述「扩展刻意不 hook `session_shutdown`」修订为——**框架**新增 `session_end` 语义事件（adapter 从 OMP `session_switch`/`session_branch`/`session_shutdown` 合成），扩展订阅它以停止本地效果；扩展仍**不直接 hook 原生 `session_shutdown`**。
- **离线时机不变**：停心跳后仍由面板 30s 过期承担；扩展侧不实现过期逻辑。
- 其余 Decision、User stories、Preconditions、Postconditions、Invariants 不变。

## 修订（2026-10-07，由《配置、装载与新旧实现切换如何保持兼容》触发）

- **P10 配置行为修订**：原「缺文件 → 默认 + 一次告警」改为「缺文件 → error 文案 + 扩展不加载」；原「坏格式 → mount 抛错」改为「框架 config BindingFailure（`kind: "configuration"`，violation kind `config`）+ `reportDiagnostic` error + 扩展不加载」；同日 traverse 收口把配置失败顶层 kind 由 `"config"` 统一为 `"configuration"`（`ConfigurationViolationKind` 新增单成员 `"config"`），`ExtensionConfigError` 保持独立。
- **配置文件格式与名称**：由 `config.json`/JSON 改为 `config.yaml`/YAML；默认 endpoint 值仍为 `http://omp-bot.local:8787`，由扩展目录下提交的 `config.yaml` 承载（无代码级默认值/回退）。
- 未修改的边界：未知键忽略、无 env/CLI 覆盖、整机唯一一份、改动需整进程重启仍成立；面板与协议不变。
