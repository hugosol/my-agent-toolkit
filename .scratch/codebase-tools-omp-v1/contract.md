# Contract — 首版语义扩展框架与 codebase-tools 完整迁移（OMP 适配）

Source: [spec.md](spec.md)
Acceptance mode: **Rapid iteration**

<!-- 一个事实一个家：spec 拥有叙事与范围；contract 拥有 promise 与 seam；tickets 拥有切片。此处只引用 spec 与故事编号，不复制。 -->

## Promises

| # | Promise (one observable result) | Coverage | Source | Seam |
|---|---|---|---|---|
| P1 | 框架提供宿主无关的 extension definition 与 adapter 装配公共接口；共享逻辑的 import 图不含 Agent 运行时类型 | C1 | story 1,6 | S2 |
| P2 | `defineExtension` 接受 `id`/`displayName`/`state`/`commands`/`prompts`/`marker`；v1 控制 `type` 为封闭判别联合（仅 command toggle） | C1, P1, P2 | story 4,5 | S2 |
| P3 | State 按 extension、按 owner 作用域；仅 owner 持有 `enabled` 且单写者；子代理只读 | C2, C3 | story 11,12 | S2（S1 佐证） |
| P4 | 子代理实时跟随 owner 当前 `enabled`（非创建快照），各自按 branch 推导 init 进度 | B9, C3 | story 13,14,68 | S1 |
| P5 | resume/switch/fork 从目标 branch 末条 state entry seed `enabled`（无则 off）；界内 Map 权威；`/tree` 不改 `enabled`、只重算 init | B8, C4 | story 17,18,85 | S1 |
| P6 | State 持久化为 owner 会话 JSONL 的 `codebase-tools:state` `{enabled:boolean}`；落盘 best-effort 且扩展不可观测失败 | B5, C4 | story 21,22 | S1 |
| P7 | 非法/未知 state 数据回落 off | N5, C2 | story 85 | S2 |
| P8 | owner 不可解析/不存在 → off 且不可 toggle；有通道时一次可选 best-effort 提示（无 UI 走 stderr） | N4, C3 | story 19,20 | S2（S1 佐证） |
| P9 | 首版仅支持单 main；同进程多 main 不在支持集且记录在案 | N10 | story 25 | S2 |
| P10 | 新写 `{enabled}` → 重启/resume 读回 `{enabled}`；旧 `{on}` 不读、旧会话回落 off | C4 | story 24,84,85 | S1 |
| P11 | `/codebase-tools` 翻转 owner 作用域 `enabled` | B2 | story 26,79 | S1 |
| P12 | toggle 发出 `${displayName} enabled` / `${displayName} disabled` 通知 | B2, H1 | story 27,79 | S1 |
| P13 | marker 进框架统一区、按 `id` 稳定排序、每启用轮重设、off 清除 | B6, C10, H1 | story 28,29 | S1 |
| P14 | `hasUI:false` 时 marker 整体 no-op、通知走 stderr、不崩溃 | B6, N9 | story 30 | S1 |
| P15 | 写路径顺序确定：命令转移 → 持久化 → marker/notify；更新经框架单写者路径串行 | C5 | story 31 | S2（S1 佐证） |
| P16 | 配置冲突（同名命令 / 同 State 字段双写者 / 同槽位多规则）在启动时显式报错：非模型通道、不绑定该扩展、运行时继续（fail-soft） | N6, P4, C14 | story 32,33 + Gate 2 | S2（S1 佐证） |
| P17 | 初始化失败 → 放弃 binding、不留部分注册（fail-soft） | N7, C14 | story 34 + Gate 2 | S2（S1 佐证） |
| P18 | on 后首个启用轮恰好一条 init；之后每个启用轮恰好一条 reminder；每启用轮至多一条槽位贡献 | B3, B4, B11, C6, C7 | story 35,36,37,88 | S1 |
| P19 | 注入提示词隐藏（`display:false`）、持久化 `custom_message`、尾部追加、`attribution:"agent"` | B5, C8 | story 43,82 | S1 |
| P20 | 贡献决策是 State + branch 的纯函数；同一轮重入 / pre-commit 取消 / `/tree` 回溯不重复、不漏注入 | B11, C6 | story 38,88 | S2（S1 佐证） |
| P21 | init 进度按当前 branch 是否已有槽位身份（`codebase-tools:init`）推导；不写 `initInjected` | C4, C7 | story 39,40 | S1 |
| P22 | 历史保护：只追加，不重写/重排/删除既有条目；resume 重放仍含该消息 | C8 | story 43,82 | S1 |
| P23 | 交付角色按 provider 路径记录为事实（deepseek/openai-codex = `user`），不作启用/拒绝门槛；其他 Agent 运行时未决 | C9, H2 | story 44,45,46 | S1 |
| P24 | 支持集为精确版本枚举 `["18.5.0"]` | C13 | story 47 | S2 |
| P25 | 未列版本 → 每个 main 会话一次非模型通知后继续运行、不声明支持 | C13, N1 | story 48,52 | S1（S2 逻辑） |
| P26 | 必须语义缺失 → 显式拒绝该能力、放弃 binding、不留部分注册；拒绝优先于“未列版本继续” | C14, N2 | story 49,50 | S2 |
| P27 | 通知/告警走非模型通道，绝不写入模型指令或会话历史 | C14 | story 51 | S1 |
| P28 | platform / runtime 只记录、不作准入门槛 | C13 | story 53 | S2 |
| P29 | OMP 只发现薄入口；发现目录外的共享源码、Markdown 文本资源与裸依赖解析成功；无聚合工厂 | C11, C12, B10 | story 54,87 | S1 |
| P30 | 防双注册靠装载来源互斥（非名称去重 / `disabledExtensions`） | C12, N8 | story 57 | S1 |
| P31 | 开发/验收 explicit-only 隔离运行；永久 cutover = 删旧实现 + 加新根目录条目 + 重启；只承诺整进程重启生效 | 07 Q4–Q6, H3 | story 55,56,58 | S1 |
| P32 | 固定修订锚点（checkout `@9348320`）+ 运行/验收产物（隔离安装 `@18.5.0`）+ lockfile | 07 Q1,Q3 | story 59 | S1 |
| P33 | 两套自动化套件在固定 18.5.0 上通过：扩展验收 B1–B11 + 框架能力 C1–C15 + 负例 N1–N10 | 08, acceptance-plan | story 65,66 | S1 + S2 |
| P34 | 升级回归按需：候选版本经 `OMP_TEST_VERSION` 隔离安装 + 跑框架套件；绿灯只作警报，维护者显式替换支持版本 | 07 Q7, 08 §4, H4 | story 60,61,62,63,64 | S1（H4 维护者） |
| P35 | 支持记录四状态 + 文档索引/升级 runbook + 升级脚本 + 能力与选项清单 | 08 §8, C15 | story 10,74,75,76 | S1（文档面） |
| P36 | 干净会话加载后默认关闭：无注入、无 marker、出站无 init/reminder | B1 | story 78 | S1 |
| P37 | 两个提示词资源独立按文本加载；不探测 MCP/LSP、不按子代理工具裁剪 | B10 | story 87 | S1 |

### Human-led coverage legend

- **H1 交互 TUI 视觉验收**（marker 渲染与生命周期、notify 文案、命令切换；自动套件盲区）。Agent 准备：隔离运行命令、逐步清单、对应自动证据（JSONL / UI 请求捕获 / stderr）作对照。
- **H2 openai-codex 层2 真凭据送达**。Agent 准备：层1 shape-only 捕获、隔离 harness（`gpt-6-luna` + `providers.openaiWebsockets="off"` + `PI_REQ_DEBUG=1`）、确切 wizard 步骤与 secret 隔离目录；不可得 → 记 unverified、不阻塞。
- **H3 永久 cutover + cutover 冒烟**（删旧实现 + 加新根目录条目 + 重启）。Agent 准备：精确步骤、回退修订、冒烟清单。
- **H4 维护者决策**：最终支持版本显式替换、blocker/范围判断。

> **协作指令**：先完成实现与全部指定自动检查，再做 human-led 验收。human-led 检查不暂停其余可执行工作。最终交接时报告待确认项与已备证据；用户确认前保持 unverified。遇到真实 blocker 时如实上报。

## Seam decisions

| Seam | Exposes | Hides | Alternatives considered | Reversibility |
|---|---|---|---|---|
| **S1 OMP extension seam** | 薄入口在原生面上的可观察效果：会话 JSONL 条目（state、injected prompt）、出站 provider 请求、命令执行、UI 请求（marker/notify）、stderr、loader 发现 | 框架内部：语义核心、行为库、definition 校验、写路径、owner 解析机制 | 单 seam 布局（只留 S1）被否决：框架核心不变量与 C14 拒绝只能在活运行时昂贵构造，08 要求的可注入 test adapter 沦为测试后门 | 中 — 行为 promise 绑定 OMP 面；日后改观察点成本高 |
| **S2 framework public interface seam**（`defineExtension` / `ompAdapter`，由 **OMP adapter + 可注入 test adapter** 两个 adapter 满足） | definition 校验、宿主无关的 State/控制/注入提示词/反馈语义、确定性写路径与错误模式、版本准入与拒绝逻辑 | 全部内部实现（core、行为库、owner 解析、持久化传输、UI 传输） | 单 OMP seam；三 seam 拆分（持久化 schema / 准入各自独立）被否决：没有独立的 adapter 变化，违反 seam 经济 | 中低 — public API；形状为继承决策 06；已批准**只允许加法演进** |

### Rejected alternatives (record)

- **单个 OMP seam**：最忠实但把 C14 拒绝与核心不变量逼进活运行时，且与继承决策 08 的可注入 test adapter 冲突 → 否决。
- **三个 seam（持久化 schema、准入各拆）**：无独立 adapter 变化，仅增加 indirection → 否决。
- **fail-fast 配置错误**：与「放弃 binding」和隔离/不打断约束冲突，配错会拖垮整个运行时 → 否决（选 fail-soft）。
- **非加法接口演进**：每次 breaking 变更都要重开 contract 与 tickets，漂移成本高 → 否决（选只允许加法演进）。
- **Full automation**：交互 TUI 与 OAuth 凭据无法由 agent 产生，会把可验收项变成 blocker/unverified，且与 spec 明定的用户 TUI 验收冲突 → 否决（选 Rapid iteration）。

## Not yet specified

<!-- 可见但尚不能精确陈述的 seam；不预切。以下均非 approval-blocking。 -->

- **openai-codex 层2 证据可得性**：凭据/捕获不可得时按 unverified 记录，不阻塞、不改变 S1 seam。
- **S2 adapter 契约中「必须语义缺失」的上报形状**（供 C14 拒绝测试）：属构建期接口细节，contract 只锁 promise 与 seam，不预切。

## Out of scope

完全沿用 [spec.md](spec.md) 的 Out of Scope；contract 不新增。包括但不限于：pi adapter、代码热重载、多 Agent 运行时/版本/provider 兼容、其他扩展迁移、双向持久化兼容、同进程多 main 消歧、配置化持久化后端、受约束纯 TS 后门与其余 control kind、request-only prompt/context filtering、绿灯自动认证。
