# 双角色最终验收证据与真实运行边界

2026-10-29，执行者：ticket 12 Agent。本页是指定 coverage 的证据索引，不是第二套 Promise 状态机，也不改变实现票据的集成/关闭状态。

**当前产品验收不能宣称全部通过：本轮 canonical 全仓回归失败；真实 A/B→C（P28）在启动前被环境前提阻塞；唯一 H1 尚未提交、尚无用户确认。** 已有受控 provider / Herdr dock 不冒充真实模型协作。环境可执行部分的结果与真实运行、人工作用判断分别列出。

## 1. 本轮来源、环境与原始记录

- 本轮起始行为源码、tests、fixtures：`ee956c8957fe272f051a1e3ca8de363aae3421df`，初始 worktree 干净。经 Main 授权，仅在本 worktree 同步 10 的集成修复 `08888d8` 为 `21a55c4`（3 个 Pi 测试/支持文件，4 insertions / 4 deletions）；最终全仓与 typecheck 受测 HEAD 为 `21a55c4`，另有本页和 README 证据链接的文档改动，运行期间均未改变。专属 worktree：`C:/Users/hugos/AppData/Local/Temp/hyper-ticket-5DCwB4`；未操作 dev 工作区或合入 dev。
- Windows 10.0.26200 x64，Bun 1.4.2；全局 `omp --version` 为 18.13.2，`herdr --version` 为 0.9.5。**全局版本只是只读检查；自动 dock 选择的是基线隔离 omp 18.5.0，不是这份全局 omp。** `OMP_TEST_VERSION` 未设置，支持范围仍以 [Harness support](../../framework/docs/harness-support.md) 为准。
- `bun install --frozen-lockfile` 在本 worktree 退出 0，安装 14 packages；没有修改锁文件或全局 agent 配置。
- 原始记录：`C:/Users/hugos/AppData/Local/Temp/workflow-final-acceptance-12-gg1humqj`。`environment.json` 保存来源、环境、配置/锁文件/后端产物 SHA-256；`commands.json` 保存每条命令、UTC 起始、耗时、退出状态及对应 stdout/stderr 日志。Prompt 原始请求与 Session 记录使用该目录下的 `prompts/`。临时记录含本机路径和 Session 信息，应按本机访问策略保管。
- 真实后端测试输入：`HERDR_BOT_REPO=E:/Developer/myhub/herdr-bot`，`HERDR_BOT_BINARY=E:/Developer/myhub/herdr-bot/backend/target/debug/examples/safe_shutdown_shell.exe`，`HERDR_BOT_METADATA=E:/Developer/myhub/herdr-bot/meta-data/task-options.toml`。这是测试启动定位，不是角色业务配置。safe_shutdown_shell 与 herdr-fixture 的 SHA-256 分别为 `780c7239c4c6d60245ffd1c0baba765d0d9831ae41d39e2a1ce5f922504ae12e`、`f48171da3fb6a56c0e20cdd994bc5275fa689320b7aeb5dc84feef767df1bb2b`；没有以 checkout 提交推断二进制可重现构建。

## 2. 实际最终检查

昂贵的真实宿主/全仓运行按 [测试协调规则](../../docs/agents/testing.md) 与 11、10 集成执行者顺序交接窗口；不以裸 `bun test` 绕过 package 入口。

| 实际命令 | 结果与证明边界 |
| --- | --- |
| `bun run check:integrations --extension extensions/workflow-chat --adapter omp --json` | 退出 0；manager-chat、node-chat 分别 complete，均无 diagnostics；`behaviorTestsRun=false`。实际双声明结构接通，不代表宿主运行或模型质量。 |
| `bun run check:integrations --extension extensions/workflow-chat/manager-definition.ts --adapter omp --json` | 退出 0；只选择 manager-chat，complete、无 diagnostics。 |
| `bun run check:integrations --extension extensions/workflow-chat/node-definition.ts --adapter omp --json` | 退出 0；只选择 node-chat，complete、无 diagnostics。 |
| `bun run typecheck` | 起始源码与同步修复后的最终源码各执行一次，均退出 0；TypeScript 与 authoring 通过：67 files、6 declarations、0 diagnostics。 |
| `bun run test` | 在 10 释放的独占窗口、受测 HEAD `21a55c4` 实际执行 canonical `bun test --parallel=12`，退出 **1**：1746 pass、9 fail、3 errors、219 files、11497 assertions，233.52s。未用别人的绿色结果覆盖本轮失败，未裸跑全量、自动重试或放宽 deadline。 |
| `bun run smoke:http-transport` | 初次退出 1：子进程 PATH 找不到 `openssl`，尚未执行行为断言。定位到已安装的真实 `D:/Program Files/Git/usr/bin/openssl.exe`，仅给本轮子进程 PATH 增加该目录后复验退出 0：29 passed、0 failed、0 observations。真实回环 HTTP/HTTPS、代理、完整正文、预算及 CONNECT/TLS 取消清理；不是远程生产服务认证。原始失败和修正后日志均保留。 |

本轮新增证据页与 README 的实际本地链接/标题及显式锚点检查：24 项、0 缺失；记录为 `documentation-links.json`。原始记录的 manifest 索引 124 个文件（含 102 个 Prompt 请求/Session 等文件，不含 manifest 自身），其 `manifest.json` SHA-256 为 `455a7b6e6be1fe53045c188e1e3a8f3b1053934518434b2b50a4b0ea2697613c`；索引保留各文件大小与 SHA-256，不把受控对话当作真实 P28。

smoke 使用其自建回环证书，子进程显式关闭证书校验，因此日志的相应 TLS 警告是该隔离 probe 的已知条件，不是部署配置建议。错误分支的 transport/timeout/configuration 诊断是预设故障观察，不能当作失败测试，也不能省略实际非零退出。

### 全仓失败未被掩盖

本轮从实际 stderr 逐文件索引得到：指定 workflow-chat、静态 integrations、公共 HTTP 与本功能 15 个角色 dock 共 **40 files、147 pass、0 fail**，详见原始目录的 `coverage-observed.json`。这证明本轮所列技术用例通过，**不是全仓绿色**；另有受影响消费者在 canonical 日志中的实际观察，不通过重算预期或重建测试改变判断。

失败细节保存为 `failures.json` 与完整 canonical stdout/stderr：

- `tests/framework/deployment.test.ts`：C12 跨目录源码/Markdown/bare dependency loader 用例在 5216.20ms 超过原 5000ms deadline。
- `tests/harness-dock/activity-facts.test.ts`、`model-cost-balance.test.ts`：各一条 unnamed beforeEach/afterEach 超过 5000ms；各有 `killed 1 dangling process`，不是角色工具业务断言通过的替代物。
- `tests/model-cost/harnesses/pi/pi-period-reset.test.ts`：其他 writer 记录归档、未保存工作跨期、保存中拒绝切换三例，`savedDocument` 分别在 194.59 / 219.22 / 238.94ms 报未观察到预期文档。源码仍使用最多 1000 次 `harnessTask` 的有限轮次等待；这个事实不同于“真实磁盘有五秒观察预算”。
- `tests/model-cost/harnesses/pi/pi-runtime-gaps.test.ts`：取消/失败活动、clear 新期、首次 holiday 三例分别达到原 5 秒 deadline；并有 3 条 tests-between 的未处理错误，来自 afterEach 取消尚未完成的 publication 观察。未凭文件名把它们判断为前次已修好的同一问题。

上述是实际失败签名与直接源码观察；本轮没有足够证据把所有失败归因于机器负载，也没有据此变更无关产品、延长 deadline 或重跑全仓来挑选绿色。已向主代理报告，后续修复与最终复验仍由 Agent/独立集成执行者承担；在此之前，全仓自动门禁**未通过**，不能进入 H1。10 的先前同源绿色回归只作为其历史交付记录，不替换本轮结果。

## 3. 全部指定 coverage 的负责人及证据归属

所有行的 test owner 都是对应 Agent；只有 H1 的最终主观判断属于用户。以下索引沿既定分区，不另建重复测试套件。S1 是真实 omp 角色工具，S2 是公共 HTTP，S3 是现有静态命令；受控外部响应只证明处理语义，不证明真实模型工作质量。P5、P29 的非运行审查保留其批准例外。

测试路径相对于仓库根；`dock/` 简写为 `tests/harness-dock/`，`workflow/` 为 `tests/workflow-chat/`，`http/` 为 `tests/framework/`，`static/` 为 `tests/integrations/`。下列已交付测试及审查的前序结果来自各执行者交付记录与长期证据；本页不将早先分区通过扩张成真实 P28 或 H1 通过。

| Promise / 指定分区 | 实现与 test owner | 具体证据与观察 |
| --- | --- | --- |
| P1 | 10 | `dock/role-identity-integration.test.ts`：两独立 auto 入口、实际角色工具、真实调用及独立 Prompt 身份；见 [装配证据](INTEGRATION-EVIDENCE.md)。 |
| P2 | 10 | 同上：未加载 connect-bot，合法关联请求被真实后端接受，无登记/心跳连接。 |
| P3 | 10 | `dock/role-session-isolation.test.ts`：不同原生身份并发请求，只取消一个，另一个与后续显式调用成功。 |
| P4 | 02；12 实际声明复核 | `static/dual-definition-cli.test.ts`：合法双声明、分别单角色缺能力、原单声明及退出码 0/1/2；02 所属分区 68 pass / 0 fail；本轮实际声明三条命令见上表。 |
| P5 | 10 | [非运行架构审查](INTEGRATION-EVIDENCE.md#p5独立的非运行架构审查)：薄入口、角色→common、framework 无 Run 协议、公共接口、无私有客户端复制与空层。不是以运行绿灯替代审查。 |
| P6 | 10 | `dock/role-identity-integration.test.ts`、`role-missing-identity.test.ts`：身份不同于 Owner key/名称/cwd；正常、缺失、无关联、歧义、跨角色及无模型身份字段。 |
| P7 | 10 | `dock/role-stable-config.test.ts`：不同 cwd/ID 误导配置不覆盖明确部署 endpoint 与预算，观察完整正文及实际断连。 |
| P8 | 10 | `dock/role-config-failures.test.ts`：缺文件、非法 YAML、非法业务值明确诊断，无 fallback 请求。 |
| P9 | 06 | `dock/manager-collect-budget.test.ts`、`http/http-collect-budget.test.ts`：普通/collect 正反预算、完整正文；5400 秒后端与 5460000ms 建议预算差 60000ms，不承诺任意等待成功。 |
| P10 基础分区 | 04 | `workflow/manager-parameters.test.ts` 及 state/resume-finish dock：六种 action 独立字面参数、非法额外字段不产生动作。 |
| P10 派发/恢复分区 | 05 | `workflow/manager-dispatch-parameters.test.ts`、`manager-recovery-parameters.test.ts` 及 dispatch-recovery dock：四种 action、三种 finding、confirmed=false 不提升为 true、无模型 Chat 引用。 |
| P11 | 04 | `workflow/manager-status.test.ts`、`dock/manager-state-actions.test.ts`、`manager-resume-finish.test.ts`：独立 A/B→C 小图、ready/blocked/canFinish、拒绝、重复/终态、首次事实。 |
| P12 | 05 | `dock/manager-dispatch-recovery.test.ts`：同批成功/拒绝/启动后失败及 retry 成功/失败，逐项 effects、已启动关联与旧产物保留。 |
| P13 | 04 | state/resume-finish dock：交接解除依赖但不派发、fail 不终止、pause 只禁新执行、resume 不派发、finish；150ms 有界外部调用观察。 |
| P14 | 05 | dispatch-recovery dock：三种 reconcile finding、原执行 recover 与新执行 retry、真假确认/依据、paused 拒绝和旧副作用保留。 |
| P15 | 03 | `workflow/node-report.test.ts`、`report-body.test.ts`、`dock/node-report.test.ts`：仅 body、真实身份、后端归属及空正文无额外限制。 |
| P16 | 03 | `workflow/report-save-failure.test.ts`、`report-notification-failure.test.ts`、`report-diagnostic-failure.test.ts`、node-report dock：保存/通知/诊断分开，状态不因报告完成，150ms 无重报。 |
| P17 | 06 | `workflow/manager-collect.test.ts`、`dock/manager-collect-pending.test.ts`：五种独立原因、无 running 防空等、有 ready 仍等待、快照/无正文摘要。 |
| P18 | 06 | collect-pending dock：反复读取不清待办、completed 后报告、旧/新执行报告交错及通知失败，适用性遵从真实后端。 |
| P19 | 07 | `dock/manager-collect-lifecycle.test.ts`：真实 abort/new_session/shutdown，200 头后无正文时双向 FIN，恢复 Session 后新 collect 收取真实报告；没有用本地取消返回冒充等待释放。 |
| P20 | 01 | `http/http-cancellation.test.ts` 及 HTTP transport smoke：预取消零传输，连接/响应头/正文取消，CONNECT/TLS 对端关闭。 |
| P21 | 07 | `workflow/manager-collect-termination.test.ts`、`http/http-collect-termination.test.ts`：正常期限、取消、客户端超时、传输/解析失败及实际采用终止原因，无假快照。 |
| P22 | 08 | `dock/uncertain-effects.test.ts`：后端已接受 pause/dispatch/report 后扣住响应并真实 abort，显式读取仍有实际效果，不宣称回滚。 |
| P23 | 08 | `workflow/uncertain-errors.test.ts`、uncertain-effects dock：独立 503/200 部分效果与真实 historyError/stateCommitted、run-read-failed、保存成功但通知失败。 |
| P24 | 08 | 同上：网络、正文、取消、辅助失败后 250ms 请求及外部调用计数；存活 Session 新显式调用成功，不是自动重试。 |
| P25 | 01 | `http/http.test.ts`、`http/http-cancellation.test.ts`、connect-bot 与 model-cost 公共消费者、HTTP transport smoke：成功/非 2xx 完整正文、原预算/配置/传输错误、直接/代理及消费者兼容。 |
| P26 技术 | 09 | `workflow/role-prompts.test.ts`、`dock/role-prompts.test.ts`、`role-guidance-rehearsal.test.ts`：实际注入全文、隐藏身份、普通轮次/切换规则、完整指引及故障演练。前序实际命令 16 pass / 0 fail；[长期演练](operations-rehearsal.md) 保留注入与真实步骤。 |
| P26 H1 指引部分 | 12 | 实际注入与演练证据已归集；H1 尚未提交，不能以技术检查代替用户清楚可用判断。 |
| P27 | 09 | `workflow/role-input-boundaries.test.ts`：真实后端启动正文与 OMP 输入、Task/本次工作/指引不同标记，不复制 Bot/Map 或传播 node 的 user_input。 |
| P28 真实运行与 H1 运行部分 | 12 | 启动前环境检查见下一节；未执行真实 A/B→C，无工具/产物使用/报告后实际收尾证据；不能通过受控 dock 关闭。H1 未提交。 |
| P29 技术 | 11 | [操作手册](OPERATIONS.md) 与 [独立部署/故障演练记录](operations-rehearsal.md)：独立部署安装、实际配置、recover/retry/人工交接/通知失败、66 个本地链接/锚点、15 JSON、2 TOML 条目；实操 1+3 pass / 0 fail。 |
| P29 H1 说明部分 | 12 | 长期部署说明与演练已归集；H1 尚未提交，技术修正与复验仍由 Agent 负责。 |

10 的技术归集为 11 个新增 S1 用例，全部以公开角色工具观察，具体检查结果和 P5 源码审查见 [装配证据](INTEGRATION-EVIDENCE.md)。01/06 初期的历史 Pi JSONL fixture 和旧 bot-options metadata 缺失在前序集成已分别迁移为 frozen `tests/framework/fixtures/pi-history/` 与现行 `task-options.toml`；不沿用早期失败作为当前结果，也不通过重造样例冒充历史材料。

独立预期来自动作/错误的字面 HTTP 样例、人工推导 A/B→C 小图及实际后端契约；不是由角色被测实现重算。取消和无自主动作仅在各测试声明的时间/连接观察窗口内成立，不扩张为无限期保证。详细机制与观察边界见 [README](README.md#验证入口与已验证范围)。

## 4. P28：真实协作被什么阻塞

### 已检查、未越界的现场

实际执行过 `where.exe bun omp herdr herdr-bot`、`bun --version`、`omp --version`、`herdr --version`、`herdr --help`、`herdr session --help`、`herdr --skill`，并只读检查当前 agent 环境。Herdr 可执行文件存在不代表隔离会话可用：本进程没有 `HERDR_ENV=1`，没有 `HERDR_SOCKET`，没有已提供的独占命名 session/服务路由或真实模型环境。已安装 Herdr skill 要求在 Herdr pane 内并禁止从外部控制用户默认 session；主代理确认本对话未提供已授权隔离上下文。

只读核对实际后端 `[herdr]` 配置 schema：只有 `workspace_name` 和单一 `executable` 路径，并无可以假定已生效的命名 session 字段。未据此更改后端或创建绕过 wrapper。全局 omp 18.13.2 也不能未经验证冒充基线 18.5.0 的真实模型执行。

**因此本轮在启动服务/Chat 前停止真实 P28 操作。** 未调用默认 Herdr 的 workspace/agent/pane 控制、未建立真实 Run、未借用用户对话或产物、未使用手填身份/改运行记录/受控模型作为替代。没有真实身份关联、C 读材料、报告后收尾或 finish 的运行证据；不存在应伪造的空日志。

### 启动前固定的独立判据

恢复环境后在新独占根目录中使用下列已固定字面预期（UTF-8、无 BOM、LF、末尾 LF）；这与后端长期 fan-in 验收的独立样例一致，不依赖被测实现生成预期。

| 角色 | 独立材料/使用要求 |
| --- | --- |
| A | `material-a.txt` 完整字节为 `source=A\nitem=blue-widget\nunits=7\n`；读取核对，真实 report 地址/编码/只读用途/限制，报告后继续不改材料的真实收尾。 |
| B | `material-b.txt` 完整字节为 `source=B\nitem=blue-widget\nunit_price=6\n`；独立生成并报告，不向其注入 A 材料。 |
| C | 初始工作仅给 A/B 两个实际绝对地址及读取合并规则，不给源文件正文、expected 目录或答案。须保存分别读取两份文件的真实工具参数/结果，然后写 `combined.txt`，完整预期为 `item=blue-widget\nunits=7\nunit_price=6\ntotal=42\n`。42 事先按 7×6 固定，不用最终报告/服务结果重算期望。 |
| manager | 实际 run status 确认 A/B ready、C 依赖两者；显式 dispatch A/B，读取报告和真实文件后分别 complete，再显式 dispatch C；核对两份读取轨迹和完整字节后 complete C、finish。A 报告后的实际工具活动须覆盖下游交接推进，不能以 node 仍 running 冒充真实收尾。 |

区分违规的观察必须同时包括：C 两次真实文件读取与完整结果、三份实际文件原始字节、真实管理者工具 complete/dispatch/finish 顺序、原生身份与 execution 关联、至少一份前置 report 后仍有收尾工具活动的有起止时间线。只看正确答案或 Run completed 不足。

所需外部前提是**已授权、能明确隔离并路由的 Herdr 上下文，以及可用真实模型访问**；不向用户索要凭据正文。Agent 在该上下文中继续负责独占服务数据、Task/zone/模型配置、角色部署、单节点前置检查、A/B→C 执行、全部原始工具结果/身份/材料/三份业务记录/进程输出、故障核实与清理。每次 gate 释放、补充输入、手动读取/补齐、恢复决定都要记录时间、操作者、目标身份、原因和结果；不得称为全自主推进。缺少环境不把这些技术工作转交用户，不扩大到重做后端所有内部验收。

## 5. 唯一 H1 的状态与后续责任

**H1 未提交、未确认。** 当前不是请求用户验收，也不是三次人工验收。必须先补齐 P28 实际证据、所有实现及指定自动检查，并处理技术/文档问题和复验，然后才集中提交一次：

> 结合实际注入指引、真实 A/B→C 推进及其故障/人工干预、长期部署与故障说明，整体判断这些内容是否清楚、可用；若有不清楚之处，请指出具体场景或文字。

待该轮具备前提时，统一提供 [协议与指引](README.md)、[装配与身份证据](INTEGRATION-EVIDENCE.md)、[操作手册](OPERATIONS.md)、[故障演练](operations-rehearsal.md) 以及真实 P28 工具/材料/干预记录。技术和文档修正、取消与公共消费者兼容、静态检查、证据收集及复验仍归 Agent；用户只作约定的整体主观判断。H1 反馈需保留原意并闭环，不能未经修正或复验直接改写成通过。

工作流实现/集成完成、可执行自动检查结果、P28 环境阻塞、H1 未确认是四个不同事实；本页和后续交接不得合并成“全部验收通过”。
