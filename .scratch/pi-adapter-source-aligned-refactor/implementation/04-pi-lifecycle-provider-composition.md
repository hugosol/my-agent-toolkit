# 04: Pi Session 生命周期、第三方接入与跨来源组合迁移

**What to build:** Pi 主会话和实际子会话继续向 extension 交付正确的 Session、Turn、Round 与相关观察序列；pi-subagents 接入结果、身份、失败和释放语义不变，同时可以明确追踪原生事实、第三方协议及必要组合的来源。

**Delivers:** P5、P12（Pi）；P11；P10、P13、P14（Pi 生命周期／第三方接入路径）

**Test owner for:** P5、P12 的 Pi 用例；P10、P13、P14 的 Pi 生命周期／第三方接入独立用例。跨路径组合用例由 09 拥有。

**Blocked by:** 01: 固化迁移清单与重构前验证基线。

**Status:** in-progress

## 边界与覆盖

以本 feature 的 spec／contract 和 01 的分配为准，经 S1／S2 验证。不承接 State 编码、命令、prompt 或 UI 内部迁移；使用其既有契约，不要求等待其迁移完成。第三方协议与跨来源 Round 组合保持完整，避免按来源目录切断同一生命周期。

- [x] 将原生 Session ancestry 与 pi-subagents 注册、RPC、版本、启动条件和 liveness 协议分离；第三方消息按协议所有者归类，不因事件总线传输而误归 native。
- [x] 仅将必须结合原生与第三方事实的解释放入 mixture。native 不依赖特定第三方协议；第三方可使用必要 Pi 原生契约；双方不反向依赖 mixture。
- [x] 保持 Session／Turn／Round、后台工作读数、Parent agent、Owner 和实际会话身份的既有关系、顺序及观察范围；验证开始、结束、转移、取消和终止失败。
- [x] 经公开 assembly 分别验证缺失、未启用、拒绝、协议失败、版本／身份／启动条件不满足的原有结果，不能变成成功、空闲或静默回退。
- [x] 验证多 extension／binding 隔离、绑定失败后再绑定、主子会话和 Owner 场景；观察消费结果而非私有状态。
- [x] 独立断言适用错误、取消、超时、终止及既有等待规则；不新增重试、不延长等待、不吞掉失败。
- [x] 验证释放后本路径应停止的交付、订阅回调及外部效果不再发生，另一有效 binding 继续运行；不能只断言 cleanup 被调用。
- [x] 真实接通 pi-subagents，记录版本、身份和启动条件，并证明实际子会话加载所要求的 child-extension 且能力可观察；可控条件覆盖拒绝路径。注册成功不是实际加载证明，替身证据与真实接通证据分开。
- [x] 保持共享状态和资源生命周期，迁移全部受影响调用方、类型和加载支持，删除本职责旧实现／兼容转发并更新直接导航。port assembly 只组装，不承接跨来源语义解释。

## 验证与交接

使用独立事件事实、身份和顺序预期，不从实现重算结果。迭代运行受影响测试及 TypeScript 类型检查；完成时运行拥有分区、受影响消费方、适用真实 Pi dock／smoke 和终止场景。记录源状态、命令、退出状态和 provider 环境，未接通项保持未验证。保留消费可见覆盖，不为搬迁删减场景。发现既有缺陷或无法在一个 fresh context 保持完整协议时请求范围／票集决策，不静默缩减或引入通用 provider 抽象。

## Comments

### 实现与 seam

完成本票实现及验收，待独立集成；按仓库规则，合入前仍为 `in-progress`，不自行标记已合入的 `closed`。

- native：`native/core/session-manager/{ancestry,positions,startup}.ts` 拥有父文件、Owner 和开始事实；`native/core/extensions/{session,turn,round}.ts` 拥有完整原生事件序列。Session 接受开始／结束操作，Round 接受已解释的 held-work 读数，均不导入第三方协议或 mixture。
- thirdParty：`thirdParty/pi-subagents/` 内保留完整 required-child、RPC ready/reply/ping、版本／身份、加载配置、launch marker、liveness 与释放协议。`provider.ts` 仍解析公开 export；移动后共享配置路径保持指向 repository 的 `framework/config.yaml`。
- mixture：`session-facts.ts` 合成原生身份／startup 与 provider launch name；`session-lifecycle.ts` 在原生开始、转移和结束位置配对第三方 requirement；`round.ts` 合成原生 quiescence 与 provider holds/clear/unread。顶层 `port.ts` 保持显式组装，不承担这些解释。
- 删除本票旧 lifecycle/subagent 实现，无兼容转发；更新调用方与直接导航。`domain/session/queries.ts` 暂时仅保留 02 独占的 State 读／命名实现，由 02 cutover 删除，不是生命周期 shim。02／06 尚未在本隔离 worktree 合入，故类型、State、Provider 和 UI 的现有 import 保持可独立验证；集成需将本票新文件的旧来源 import 映射至 02 的 native types/State/model-registry 和 06 的 `native/core/extensions/ui.ts`。

S1 为实际公开 `piAdapter` assembly 与 extension 消费 interface；S2 为真实 Pi 加载后的输出、会话 journal、provider launch evidence 与消费文档。未新增私有测试 seam，也未删减原有行为断言。

### TDD 与覆盖责任

这是保行为迁移：实现前的八个 lifecycle/provider 文件 **104 pass / 0 fail**；既有行为已满足时未制造产品 red。首次运行缺少 YAML dependency 是 setup failure，安装 frozen lock 后才获得上述基线。新增场景继续经过真实 assembly；隔离配置测试只替换外部 provider，配置解析、注册、settle 和 initialize 保持真实。

独立预期与可区分错误：显式无效配置必须 registration-failed，不能 fallback；无 childEntry 的 assembly 不得向已运行 provider 发 ping；一次 handshake 在 299ms 未初始化、300ms 初始化为 none，此后无 retry；原生订阅拒绝不得留下 requirement，且同一 assembly 可再次绑定；两个实际不同 child-entry 成功接入后，释放一份必须停止该消费方的 Session/Turn/Round 交付，而另一份继续并保留 requirement。首次新增释放测试错误使用 Turn delivery 字段及重复 canonical child path，修正 fixture 后明确断言两份接入均成功；未修改生产语义或放宽这些预期。

| 本票承诺 | 消费可见证据 |
| --- | --- |
| P5 | `pi-session-facts`、`pi-turn-mapping`、`pi-round-mapping`、`pi-background-rounds`、`pi-disposal-round-close`：独立身份／父关系／Owner／顺序、开始／转移／取消／失败／结束；真实 terminal、background、closeout smoke 补充 |
| P11 | `pi-subagent-integration` 区分 disabled、缺失运行 provider、拒绝、版本、身份与 registration failure；`pi-subagent-provider-path` 新增四个公开 assembly deployment 场景，覆盖相对路径、真实缺失 optional artifact、错误 shape 与显式缺失 package，不仅测试私有 loader |
| P12（Pi） | subagent smoke 前台和后台实际子会话；前台 provider launch required 包含 codebase-tools/model-cost，同时有真实 child request、自己的消费记录、agent-name 及 owner observation；拒绝 entry 场景独立保留 |
| P10 | 原有主／子／孙会话与 Owner 场景；新增同一 assembly 绑定失败后再绑定、多 extension 释放隔离；观察交付及外部 requirement，不读 adapter 私有状态 |
| P13 | 新增公开 assembly 299/300ms 一次预算、错误相关回复不生效且无 retry；原有取消与失败不读 held-work；真实 terminal/closeout 证明取消边界和原有 15000ms 等待规则 |
| P14 | 新增释放后 Session/Turn/Round 停止而另一个 binding 继续；provider requirement 独立保留／释放；真实前台 child 结束不处置 parent，parent 处置后不再写 storage 且进程退出 |

### 实际验证

原始命令、UTC 时间、退出码与完整日志在 [04-lifecycle-artifacts](./04-lifecycle-artifacts/)；[runs.json](./04-lifecycle-artifacts/runs.json) 为实机索引，[partition-runs.json](./04-lifecycle-artifacts/partition-runs.json) 为最终分区索引，[environment.json](./04-lifecycle-artifacts/environment.json) 为源状态、版本、身份、启动条件及范围限制。

- focused 九文件：**114 pass / 0 fail**；`bun run typecheck` 多次实际退出 0，最终 TypeScript 和 authoring check 为 **61 files / 4 declarations / 0 diagnostics**。
- `bun test tests/framework`：**665 pass / 0 fail**（57 files，3474 assertions），退出 0。
- `bun test tests/model-cost/harnesses/pi`：**91 pass / 0 fail**（12 files，604 assertions），退出 0。
- 受影响消费方联合命令（具体五个路径见分区索引）首次为 **137 pass / 2 fail**，退出 1：`pi-disposal-round-close` 的 transfer 后未发布记录，以及 `pi-session-accounting` 的 repeated-settle 后未发布文档。**此结果保留，不算通过，不宣称为已知基线缺陷。** 为区分源码与运行状态，在同一隔离 clone／相同 fixture、dependency、config 先运行原始 revision 的 Pi adapter：**139/0**；仅替换 `adapters/pi` 为本票实现后同命令：**139/0**。没有修改期望或修复无关行为；原 worktree 联合运行的不稳定原因仍未确认。两份差分日志与原失败日志一同保留。
- `bun scripts/pi-subagent-smoke.ts --expect-pi-version 1.4.0 --keep`：退出 0，**32 observations**。
- `bun scripts/pi-terminal-round-smoke.ts --expect-pi-version 1.4.0 --keep`：退出 0，**17 observations**。
- `bun scripts/pi-background-round-smoke.ts --keep`：退出 0，**15 observations**。
- `bun scripts/pi-close-out-smoke.ts --expect-pi-version 1.4.0 --keep`：退出 0，**11 observations / 0 required facts missing**；正常无 Owner 的会话 12ms 退出，真实锁阻塞的 closeout 14995ms 退出并明确报告未写入，未声称保存成功。该脚本新增与其他 Pi smoke 一致的显式 candidate-version 参数，默认版本与行为断言不变。

实机环境是 Windows x64、Node **22.19.0**、Bun **1.4.2**、现有 Pi CLI **1.4.0**，local capture endpoint，无付费模型服务或凭据。隔离 deployment 的共享配置与实际 `-e` 均指向同一 **pi-subagents 0.78.0** artifact；没有改正式配置（其显式 provider 仍是 **0.80.0**）。前台 parent `01a169ac-b0c6-7450-9e91-ee039aa37f85`、child `01a169ac-ba09-700c-af55-f34e122588d8`，launch agent `scout`、startup `deepseek/deepseek-flash:low`；后台 parent `01a169ac-c123-701a-bb4d-fa6249f52708`、child `01a169ac-d91c-7005-af12-8d15df08def6`。provider 的另一个 task-attestation 字段是 rejected（脚本回复没有 structured acceptance report）；不把 wiring/loading/accounting 验证冒充 delegated-task acceptance 或模型质量证明。

四个实机 smoke 在本代理内顺序运行；03 释放窗口后开始，但阻塞调用中收到 integrate01 仍有全仓测试的通知，故记录可能的跨运行负载，**不宣称严格 quiet-run 保证**。四项实机结果均无失败。最终分区在 05 和 03 明确释放后运行，源与 fixture 全程未改。

### 开发分支冲突接管（2026-10-24）

将集成提交 `921de1d861cc78797e758f7ddc01a3413e19fb54` 回合到本票开发分支时，保留 04 的 native／thirdParty／mixture 生命周期划分，同时采用 02 已迁移的 extension types、commands、context、prompt、model-registry 和完整 State 协议。顶层 `port.ts` 继续只做显式组装；删除已被 `native/core/session-manager/state.ts` 完整取代的旧 `domain/session/queries.ts`，不保留兼容路径。同步迁移新 lifecycle 文件、测试及直接导航的 imports。06 的 UI 迁移尚未在此次回合源状态中，未提前修改其职责。

此次接管按 assignment 仅执行项目全局测试；不运行 typecheck、复杂脚本、实机 smoke 或跨票据整体验收，后者留给最后独立门禁。此前实现证据及原有失败记录保持原样，不能当作此次合并源状态的测试结果。

在 `b659d32` 冲突合并后，采用共享测试修复 `257d84b`（本分支为 `b73a78c`），确保全局测试只启动 `safe_shutdown_shell`，不启动可执行真实关机动作的生产 panel。设置 `HERDR_BOT_BINARY=E:/Developer/myhub/herdr-bot/backend/target/debug/examples/safe_shutdown_shell.exe`、`HERDR_BOT_METADATA=E:/Developer/myhub/herdr-bot/meta-data/bot-options.toml`。收到 07 明确释放窗口后执行 `bun run test`，退出 **1**：**1630 pass / 4 fail**，183 files、9965 assertions、576.58s。完整原始日志保留在 `C:/Users/hugos/AppData/Local/Temp/pi04-integration-global-test.log`。失败为 panel startup 的首次 snapshot 连接拒绝，以及 session-ownership-tree 的三个场景请求数分别为 11／13／11 而非既有 5／7／5；不算通过。02 集成 owner 接管这两个共享测试根因，04 未重复修改其文件。随后采用其修复 `ec861fa`（本分支 `54e5ceb`）：额外六次请求实际来自 auto-effort judge，fixture 显式声明 task effort 并启用相应选项；panel 的 SSE／snapshot 使用独立的 `node:http` 连接，不与进程全局 fetch 池混用。这些是测试输入和外部 panel 观察设施修正，不放宽产品行为断言。02 的通过结果不冒充本 worktree 的最终结果。

### 恢复会话后的最终全局验收

恢复原 worktree 后，分支仍为 `hyper/pi-adapter-source-aligned-refactor/04-pi-lifecycle-provider-composi-852ae8-ad3d0438e083`，HEAD 为 `51768a9`，工作区干净，无未完成 merge／冲突。宿主自动集成编排已丢失；本记录不宣称恢复编排或已将 04 合入 `dev`。

- 恢复读取上次中断 eval 的完整日志，实际全局结果是 **1497 pass / 124 fail**（183 files、8234 assertions、246.23s），主要原因为缓存宿主缺失 `@oh-my-pi/omp-stats/src/embedded-client.generated.txt`，不是通过结果。
- 从 npm 精确发布包 `@oh-my-pi/omp-stats@18.5.0` 恢复该资产到本 worktree 的四个 baseline／patch cache；先验证 tarball 的 registry SHA-512 integrity `sha512-z9yfQPotgV67146b0lnp8FmTzgT/zpzKKoETNZid51RWwF8n6H7lDzLPqgVlIfIDwBFY+3qaetD3bbmT6r6u7Q==`。发布包中的资产本身为 0 bytes，SHA-256 为 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`；恢复的是原始发布字节，不是伪造 fallback，也未修改外部宿主协议。
- 独占窗口下，资产恢复后的 `bun run test` 退出 **1**：**1633 pass / 1 fail**（183 files、10022 assertions、527.67s）。唯一失败是 `model-cost-session-span` background result 的 `drawing=-1`。其等待条件只检查最新 Total 行，可能被前一条结果已经更新的行提前满足，随后尚未收到当前 receipt 的 redraw 就立即断言。测试改为直接等待 receipt 之后、同一 widget 的 span advance frame；仍保留必须晚于 receipt、必须早于下一 main assistant end、两份结果分别推进等原有断言，不延长既有 30s 等待，不修改产品逻辑。
- 定向诊断命令 `bun test tests/harness-dock/model-cost-session-span.test.ts -t "each background task result"` 退出 **0**。
- 最终 `bun run test` 退出 **0**：**1634 pass / 0 fail**，183 files、10023 assertions、521.70s。使用与上文相同的安全 panel 环境变量；源代码和 fixture 在执行期间未改。未另跑 typecheck、复杂脚本、独立实机 smoke 或跨票整体验收。

五次原始完整日志均保留在 [04-lifecycle-artifacts](./04-lifecycle-artifacts/) 的 `pi04-*.log`；最终通过日志为 `pi04-integration-global-verified.log`。既有实现阶段和此次失败证据不被覆盖。冲突解决、测试设施修正和验收记录仅提交到本开发分支，原 worktree／branch 保留；由主会话恢复宿主队列后决定实际合入，不自行操作 `dev`。

### 后续冲突回合：合并已集成票据源状态 `873feaa4`

主会话通过原 HyperGit 逻辑尝试补合并，dev 侧冲突已 abort，并将 `873feaa4a85fa993f684146aeb771d1d430524db` 反向 merge 到原 04 worktree。此回合仅在本开发分支解决冲突：保留 02／03／05／06／07 已合入职责和验收记录，不操作 dev、不新建 worktree、不 reset、不调用 retro。

- Pi 的 commands／context／prompt／Session／Turn 和 mixture Round 全部采用 06 的 `native/core/extensions/ui.ts`，同时保留 04 顶层私有 port、native lifecycle／thirdParty／mixture 的归属与职责分离。原生 Round 不重新吸收第三方 liveness 解释。
- 保留 03／05／07 的 OMP native 迁移与 Viewed-session 释放保护；冲突中未回退其实现。合并两端实际来源导航，保留 02 最终验收追加记录；panel stream 的类型适配采用集成侧已存在的跨 Node／Bun 声明解释，未改运行时行为。
- 按本轮 assignment，未重复首次全仓验收。针对 import／UI cutover 运行 `bun run typecheck`，退出 **0**；运行 `bun test tests/framework tests/model-cost/harnesses/pi`，退出 **0**：**787 pass / 0 fail**，71 files、4254 assertions、45.63s。原始日志为 [pi04-followup-conflict-checks.log](./04-lifecycle-artifacts/pi04-followup-conflict-checks.log)。此前全局 **1634/0** 仅对应上一回合源状态，不冒充本轮完整双端全局结果。

本回合解决后仅提交开发分支并交回主会话，再由同一 HyperGit 合并；本票记录仍不宣称已进入 dev。

### 集成交接与未验证项

本票无需 State 数据或用户配置迁移，无新增 retry、延长等待或 failure fallback。02／06 跨票 import cutover 已在上述开发分支冲突回合完成，实际合入仍由宿主执行；完整双端结构规则、ADR 与全仓最终验收仍归其各自 owner。真实服务、其他版本／平台、交互 TUI 与未运行组合不在本次实机证据内，不提升支持声明。原 worktree 联合消费方运行的两项不稳定失败保持可见；已有覆盖和实机结果不替代这个限制。
