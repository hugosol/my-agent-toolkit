# 保留哪些行为，以及以哪个原实现版本为准

Parent: [connect-bot 迁移与框架能力边界](../map.md)
Labels: wayfinder:grilling
Type: grilling
Mode: HITL
Status: resolved
Blocked by: none

## Question

确定可追溯的原扩展源码、文档和配置基线，逐项界定本次必须保留的用户可见行为；文档、代码或既有测试不一致时，哪一个行为应成为迁移契约？

覆盖接入回执与重复注册、立即本地断开、未接入零网络/定时动作、主会话与 UI 门槛、三类状态的区分、状态上报与心跳、失联停止接入且不自动重连、会话切换与同身份导航、退出后面板过期。核对配置和既有端到端清单，列出保留项及待后续票据决定的差异，不把旧内部结构或测试措辞自动升级为业务要求。面板和协议不变已是范围约束，不重新投票。

本票据只形成决策，不实施代码。解决时先读取地图与相关已确认 lighthouse，记录讨论结果，经 lighthouse 用户确认后标记 resolved，再运行 backtracer。

---

## 讨论结果（2026-10-07）

### 1. 基线锚点

- 以本机 `E:\Developer\myhub\my-omp-toolkit` 最新代码为准（`master@34d7c40`；`extensions/connect-bot` 内容 = 唯一提交 `d3648a0`，master 与 extension-framework 两分支逐字节相同，`v1.0.0` 不含此扩展，工作区对该目录无未提交修改）。
- 本需求开发期间 extension 代码与文档**不变**（用户承诺冻结）；因此基线 = 「本机最新 + 冻结期」，不逐 blob 哈希固定。
- 面板侧 `omp-bot@d50e35c` 保持现状（地图已定不修改面板与协议）。
- 面板侧存在已完成的 wayfinder 产出：`E:\Developer\myhub\archive-docs\omp-bot\omp-connect-bot\{spec.md,contract.md,decision/,lighthouse/,implementation/}`。扩展 `connection.ts:9` 引用的 `spec.md §心跳与失败` 即出自该 `spec.md`（§157 标题即「心跳与失败」），悬空引用已解析。

### 2. 冲突仲裁

不设自动优先级。代码 / README / 既有测试 / 面板 spec 之间出现不一致时，**逐条登记为差异项，交用户判断**。

### 3. 契约覆盖范围

契约只覆盖两类：

1. **新引入的框架行为** —— connect-bot 若只是复用框架既有行为，不重复测试；该类测试落在 framework 层。
2. **扩展层可独立测试的行为** —— 不需要与 omp-bot 进行集成测试，允许用 mock 验证功能。

真实环境下的集成测试**由用户手动进行，不要求自动化验证**。

### 4. 保留粒度

以下全部保留为契约：心跳周期 `10s`；失败预算连续 `3` 次；超时 register `1s`、push/unregister `1.5s`；出站队列机制（单 flusher 保序、上限 `16`、满时丢最旧 heartbeat、不重试）；全部提示文案。

### 5. 九项行为的归属

| 原问题中的行为 | 归属 | 依据 |
|---|---|---|
| 接入回执与重复注册 | 扩展层契约（可 mock 验证） | `index.ts:279-307`；面板契约 P1/P2 |
| 立即本地断开 | 扩展层契约 | `index.ts:317-329`；P3 |
| 未接入零网络/定时动作 | 扩展层契约 | `index.ts:232,254,318,346`；P6 |
| 主会话与 UI 门槛 | 扩展层契约 | `command.ts:45-49`；P5 |
| 三类状态的区分 | 扩展层契约（接入开关 + agent 三值）；keepAlive 属面板 | `index.ts:114,127`；面板 `sessions.rs` |
| 状态上报与心跳 | 扩展层契约 | `connection.ts:22`；P7/P8/P9 |
| 失联停止接入且不自动重连 | 扩展层契约 | `connection.ts:63-69`；P7 |
| 会话切换与同身份导航 | 扩展层契约 | `state.ts:99-102`；P6 |
| 退出后面板过期 | **面板侧**，不入扩展契约 | 扩展不 hook `session_shutdown`；面板 `ONLINE_WINDOW`/`EXPIRY_SCAN_INTERVAL`；P14 |

### 6. 差异项

- 逐条核对结果：代码 / README / 既有测试在**全部可核对行为上一致**，无行为差异。
- `connection.ts:9` 的 `spec.md` 引用 → 已解析（见 §1），非差异。
- `tests/connect-bot/smoke-omp.ts:17` 硬编码 omp 安装路径，与 README「缺 omp 不硬失败」不符 → 测试工具问题，非用户可见行为，按 §3 的覆盖范围不入契约。
- README 中面板侧声明（去重不闪烁、30s 过期、来源校验、SSE、`可能已经过期`）在扩展仓库不可验证 → 已由面板侧 `contract.md` P12–P25 与 `omp-bot` 代码/测试覆盖。

### 7. 交后续票据

- 配置的**位置与归属**（`config.json` 放哪、是否沿用、新旧实现切换）→《配置、装载与新旧实现切换如何保持兼容》。
- 扩展**如何**获得心跳与事件语义（框架钩子与扩展的职责分工）→《接入命令与会话状态由框架和扩展如何共同管理》《生命周期映射与持续上报由哪一层负责》。
- 验收证据的形态 →《用什么证据证明迁移等价且框架边界成立》（本票已收窄其口径：framework 层 + 扩展层隔离，真实集成由用户手动）。

---

## 修订（2026-10-07，由《接入命令与会话状态由框架和扩展如何共同管理》讨论触发）

- **命令词形**：`offline` → **`off`**（不保留别名）。原实现 README/测试与面板侧 contract P3 中的 `offline` 表述随之失效，需对应更新。
- **持久连接标识**：由扩展 `ctx.ui.setStatus` footer 改为**框架统一 marker 区**，由 `enabled` 派生；摆放/文本/共存归《自定义交互和原生能力可以越过哪些边界》。
- **文案条款**：本票「全部提示文案保留」不再成立；文案/通知约束整体重开，由《自定义交互和原生能力可以越过哪些边界》逐条确认。
- 其余保留项不变：心跳 `10s`、失败 `3` 次、超时 `1s`/`1.5s`、出站队列、未接入零动作、立即本地断开、失联不重连、会话切换、面板侧退出过期。

## 修订（2026-10-07，由《配置、装载与新旧实现切换如何保持兼容》讨论触发）

- **P10 配置行为修订**：缺文件由「默认 + 一次告警」改为「error 文案 + 扩展不加载」；坏格式由「mount 抛错」改为「框架 config BindingFailure（`kind: "configuration"`，violation kind `config`）+ `reportDiagnostic` error + 扩展不加载」；同日 traverse 收口把配置失败顶层 kind 由 `"config"` 统一为 `"configuration"`（`ConfigurationViolationKind` 新增单成员 `"config"`），`ExtensionConfigError` 保持独立。
- **配置文件**：由 `config.json`/JSON 改为 `config.yaml`/YAML；默认 endpoint 值仍为 `http://omp-bot.local:8787`，由扩展目录下提交的 `config.yaml` 承载（无代码级默认值/回退）。
- 未修改：未知键忽略、无 env/CLI 覆盖、整机唯一一份、改动需整进程重启。
