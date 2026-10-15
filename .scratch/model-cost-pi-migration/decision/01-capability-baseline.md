# OMP 子代理能力基线与 model-cost 迁移差距

Type: research
Status: resolved
Assignee:
Map: [model-cost 迁移到 pi：决策地图](../map.md)

## Handoff

- 起点：读取现有框架公共契约、OMP adapter 及真实 OMP 源码，勿把启动工具等同于完整能力。
- 同时检查 model-cost 当前功能、消费的框架能力、pi adapter 与 pi 原生能力，区分第三方子代理缺口和其他迁移缺口。
- 当前恢复点：已发布 [能力基线 Lighthouse](../lighthouse/01-capability-baseline.md)，作为固定修订、源码证据级别的研究结果 authority；逐项证据仍只存于下述研究报告。本票不批准提供方、适配组织或能力降级。
- 本次核验：已完整阅读报告；程序核对 F/O/N/M/P/G 表格行数为 22/28/19/23/17/17，32 个仓库引用路径均存在；直接复读当前 pi adapter 的身份/startup/拒绝端口及 pi 原生 input、HTTP response、agent_settled 类型。未启动宿主、未调用模型、未运行构建或测试，不宣称运行兼容或全部来源行已重新验证。
- 下游恢复点：候选对照应先按其已有勘误修订分类；隔离验证仍可在固定基线输入上推进。选型、组织与完整方案的其他依赖保持未解决，不因本票发布而解锁整个下游。
- Backtracer 追溯：完整基线/消费标注由本票产出，其不同消费者分别是候选覆盖对照、隔离验证、提供方路线、适配组织及完整迁移方案；公共语义复用与宿主职责分层亦已在组织票和完整方案票的问题范围内。原生请求/input 事实与候选旧报告概括的冲突已有候选票 Handoff 勘误承接，不是已批准政策之间的冲突。本次未发现无主的新问题或需用户裁决的上游政策矛盾，不新增 ticket、不改其他票状态/claim。
- 保留问题：报告 H 段的关轮输入、cleanup、宿主直连职责和装配分别交给组织/完整方案与提供方路线讨论；“是否必须保有全部子代理语义”已由地图约束回答，不能重新解释为允许降级。未来注入角色仅记边界，不新增本轮功能承诺。

### Research result（BaselineResearch，本次）

- **报告（本次唯一交付物）**：`E:/Developer/myhub/wt/omp-capability-baseline/.scratch/model-cost-pi-migration/research/omp-subagent-capability-baseline.md`
- **隔离**：research 分支 `research/omp-capability-baseline`（自 `59f36fbf2ab6be22879f3bd5370dd09815352974`），worktree `E:/Developer/myhub/wt/omp-capability-baseline`；提交 `e5f5f14`→`9ff584c`（行号订正与来源修订）；已推送到 `origin`（**推送成功**，`origin/research/omp-capability-baseline` @ `9ff584c`）。未合并、未开 PR、未改 main。未提交他人工作。
- **行标识**：`F-*` 框架语义 22 行、`O-*` OMP adapter 映射 28 行、`N-*` OMP 原生 19 行、`M-*` model-cost 消费 23 行（12 消费 + 7 宿主直连 + 4 绘制/装配）、`P-*` pi 原生 17 行、`G-*` 迁移缺口 17 行。
- **来源修订**：本仓库 `59f36fb`（分支 `pi-adapter`）；OMP 原生以**发布安装源码**为准 —— `.cache/omp-baseline/18.5.0`（未打补丁）与 `.cache/omp-baseline/18.5.0-viewed-session-codex-response`（两个本地补丁），并用本地检出 `E:/Developer/myhub/oh-my-pi` @ `611c189fa2f6b8c9b368559ea6b98062b9b54539`（18.10.4）交叉确认；pi 检出 `E:/Developer/myhub/pi` @ `4a5d37291531ad48b8e536c892557877d219463c`（`@earendil-works/pi-coding-agent@1.2.0`）。
- **已发候选研究**：框架侧行标识已通过 `agent://CandidateResearch` 发送（2026-10-15），供其独立发现对照；报告不评价、不选择任何候选。
- **证据等级与限制**：全部为源码/类型/文档阅读与 grep，无任何运行观察（未启动会话、未跑构建/测试/dock）。`getViewedSession`/`subscribeViewedSessionChanged` 是**补丁门控事实**（未打补丁的 18.5.0 安装中不存在）。框架文档引用的 checkout 行号与发布 tarball 行号在同一事实上可能不同（例：`onSessionNameChanged` 发布包 `session-manager.ts:3113`，文档引用 `:3217`）。
- **尖锐未决问题**（报告 H 段，供 ticket 02/03/04/05 接手）：(1) pi 无子代理身份/注册表事实源 → `G-SUBAGENT-IDENTITY`/`G-SUBAGENT-RUNTIME` 是事实源缺失而非映射缺失；(2) pi 缺 `getAsyncJobSnapshot`，“关轮”判据需另定；(3) `session_end`/`cleanup` 跨宿主口径；(4) viewed session / `getContextUsage` / 会话托管定时器目前是宿主直连，是否提升为公共能力属 ticket 04；(5) 注入提示词角色权威在 pi 恒为 `user`；(6) 装配落点未决定。

## Question

当前 OMP adapter 提供的全部子代理相关语义是什么，各自需要哪些可观察事实、身份、顺序和生命周期保证？model-cost 消费其中哪些能力，完整功能迁移还缺哪些 pi 原生映射或扩展专属宿主实现？

输出可供候选逐项对照的基线，覆盖适用的会话/父子/Owner 身份、生命周期、Turn/请求/用量、Round、执行耗时、保活后续执行、观察范围、状态继承及查看会话等实际能力；未实现或不适用的项须明确区分，不凭预设扩充契约。列明现有 shared-logic/framework 可复用内容和职责层，不设计或实现第二套业务。

## Comments

用户确认：全部当前 OMP 子代理能力是验收基线，model-cost 子集只是额外标注。调查不运行生产迁移。
