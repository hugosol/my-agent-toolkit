# 21 无 UI 同后端与干净 RPC 反馈：自动证据与命令记录（2026-10-13）

本文件是本票（Delivers P42／P43／P69）的自动覆盖与实际运行记录，供 25 票的完整验收与人工确认使用。
所有运行均在隔离环境内完成：dock 的真实宿主运行各自使用临时 agent state／session／工作／capture 目录与
`<run root>/user-home` 下的隔离用户主目录，扩展自己的 `config.yaml`（仓库中未改动）在该隔离 home 内解析；
S2 用例各自 `mkdtempSync` 独立根。**未触碰正式 OMP 的配置、会话、扩展加载或统计**，未使用任何真实凭据
（工作副本里的口令是本 run 自己的 fixture 字面值 `dock-key`，以及本仓测试自己的合成哨兵）。

## 1. 本票交付的行为与生产变更

变更只有一个生产文件：`extensions/model-cost/shared-logic/runtime.ts`。

- 新增 `PROVIDER_REQUEST_FAILURES`（`unreachable` / `unreadable` 两种分类）与 `stateProviderFailures(delivery)`：
  当一个 provider 余额／额度查询**确实发出并失败**时，在该 delivery 自身的通道上按 `error` 级别报告一次；
  `hasUI === true` 时**不发布任何东西**（同样的失败由 widget 绘制只读结果）。
- 调用点：`initialize`（两条启动预取收口后）与实例处理的每个 delivery —— `turn_start`／`turn_end`／
  `round_start`／`round_end`／`session_facts` 及 `/budget` 的三个 action。失败的查询在触发它的 delivery
  *之后*才落地（settled request 的刷新是后台工作），因此在**下一个 delivery** 报告；实例已 dispose 时不报告。
- 去重按**失败尝试对象本身**：同一次失败不在后续 delivery 重复；新的失败尝试（TTL 过期后的下一次查询）再报一次。

对照规格与《展示》权威（`spec.md`「余额／额度失败有 UI 在 widget 显示不弹通知；无 UI 经公共反馈 stderr」、
`lighthouse/08-presentation.md` 的「无 UI 记账与公共错误反馈」表）：

| 情况 | 有 UI | 无 UI | 落点 |
| --- | --- | --- | --- |
| 余额／额度**请求**失败（传输失败／超时、回答无可用读数） | widget 内显示，不发布通知 | framework Extension feedback → stderr，`error`，每次尝试一次 | `stateProviderFailures` |
| 查询**没有发出**（本机无该 provider 凭据 `no-access`；命名代理未配置 `misconfigured`） | 只读结果 | 同样只留在只读结果（没有请求结果可报告） | 同上（分类过滤） |
| 缺 usage／适用价格、普通保存失败、统计暂停、命令结果 | 公共反馈 | 同一公共能力的 stderr | 既有实现（本票加无 UI 侧用例） |

**没有公共契约变更**：`framework/**`、其它扩展、配置与宿主补丁均未改动，`FeedbackTransport`／`hasUI` 的既有语义
（无 UI → 一行 stderr，永不进入模型上下文）照旧；因此不存在需要迁移的调用方（P58 见第 6 节）。

## 2. 新增永久 tests

| 文件 | seam | 例数 | 观察面 |
| --- | --- | --- | --- |
| `tests/model-cost/headless-feedback.test.ts` | S2（生产 definition 经公共绑定 + `createModelCostRuntime`，HTTP 与 providerAccess 以此唯一依赖替换；交付带真实 `hasUI`） | 10 | 框架发布的 feedback（级别＋文本）、只读结果、真实文件、真实目录 |
| `tests/harness-dock/model-cost-headless.test.ts` | S5（隔离真实安装 + 真实 loader + 真实 RPC + 本地 capture endpoint） | 7 | stdout 协议帧、stderr、捕获的模型请求、Session JSONL、真实 `consumption.json` |

## 3. 逐 acceptance criterion 的落点

| Acceptance criterion | 证据 | 结果 |
| --- | --- | --- |
| 真实 RPC 下同一观察／usage 记账／round_end 保存／初始化调度，无 widget | S5「one session's exchanges are accounted, saved and drawn nowhere…」：`arrivals = [balance, model, model]`，`consumption.json` 中本会话自身记录 = 手算 `{input:14, cacheRead:6, cacheWrite:0, output:14}`、`costCny ≈ 0.00007012`（两次请求各 `7/1e6·1 + 3/1e6·0.02 + 7/1e6·4`，谷价 flash 1／0.02／4 CNY 每百万 token）；全程 0 个 `extension_ui_request` 帧 | pass |
| 真实 RPC 下 TTL 刷新调度 | S2「the fact that a later delivery sees is stated once…」用可控时钟越过规格 30000ms TTL，在 `hasUI:false` 下观察到**第二次** balance 查询发出并再次失败；S5「the provider refresh a settled request begins still happens with no UI…」在真实无 UI 运行中观察到读数为空时 settled request 发起的第 2 次查询（`balanceCalls()===2`）且不阻塞下一请求 | pass |
| 真实 RPC 下 headers／estimate 调度 | S5「two real reports feed the windows and the ratio with no widget in the process」：patched 宿主交付响应边界（`hasHttpFacts` 两例皆 true），脚本 header 的两份报告把窗口更新为 70／30，并驱动 ratio＝60/10＝6、left≈(100−30)/100×6＝4.2；全程无 UI 帧 | pass |
| 公共反馈保持 info／warning／error，错误只报一次 | S2：「a session without a UI is told both failures, once each, at error severity」（2 条 error）、「the fact that a later delivery sees…」（同一次失败不再重复，新尝试再报一次）、「a command's own result…」（`/budget detail` 一条 info；`/budget nope` 一条 error）、「a request with no reliable usage…」（两条 warning）、「a save that did not land…」（error）；S5 同类三例（stderr 行数逐一断言） | pass |
| UI 余额／额度网络错只在 widget | S2「a session with a UI draws it in the widget and publishes nothing」：两源皆失败、`feedback === []`，只读结果仍带 `unreadable`／`unreachable`。既有 S5 用例（12／15 票）在真实 UI 运行中已断言 widget 行出现、`stderr === ""` 且无 notify 帧——本票未改动该路径 | pass |
| 其他业务错公共反馈、无 UI 送 stderr | S2 三个业务错用例 + 暂停用例；S5「an unusable baseline pauses the instance with one error line, and the agent still runs」「a command's own result and an unrecognized argument are both on stderr, once each」 | pass |
| 不受 enable／扩展数量开关隐藏 | S5「another extension's presence in the same process hides none of it」：同进程两个 `-e` 扩展（model-cost + admission-probe），balance 失败仍在 stderr 恰好一行；框架反馈通道本身不做过滤（P43 合同行「不新建打印系统／不因扩展 enable 隐藏」） | pass |
| 隔离真实 RPC 触发业务错误后继续发请求；逐帧解析 stdout；stdout 无协议外文本；stderr 有对应错误 | S5「a refused balance is visible on stderr and the session goes on issuing requests (P43, P69)」：首次请求前的 prefetch 被 503 拒绝（stderr 恰好 1 行 `余额读取失败（unreadable）`），随后第二个请求正常 `completed`，`capture.requests()===2`；`protocolFaults()`（即被 dock 标为 `<unparsable>` 的 stdout 行）为空、`uiFrames()` 为空 | pass |
| 独立核对真实消费文件、出站请求捕获、Session 日志，证明后端继续且反馈不进入模型内容或记录 | S5 三处独立读回：`readFileSync(consumption.json)`（不经扩展内存视图）、capture endpoint 落盘的出站请求原文、`sessionLog()` 读回的 JSONL——三者均不含反馈文本；「合成秘密不进入模型内容或记录」由 S2 合成哨兵用例（见下）与 12 票的 S5 哨兵用例持有 | pass |
| 合成秘密脱敏（P53 在本通道的延伸） | S2「a stated failure carries no credential…」：合成哨兵作为 balance 凭据、且 quota 传输错误的 message 里也带哨兵；发布的 feedback、只读结果与本 run 根下全部文件均不含哨兵。S5 拒绝用例额外断言 stderr 不含 `dock-key` | pass |
| 退出／旧访问失效，不越过已退役生命周期效果权限 | S2「a disposal before the answers land leaves the operator channel untouched」：dispose 后落地的失败不报告，下一个实例只报自己的失败 | pass |
| 缺 usage／价格、保存失败／暂停、网络失败覆盖 | S2「a request with no reliable usage…」（warning×2）、「a save that did not land…」（目标不可读 → error；坏基线 → 暂停 error 一次且后续保存不再重复）、网络失败＝本文件全部拒绝用例（503 与传输 reject） | pass |
| 观察只经批准的生产公共 seam，预期来自合同／规格或独立手算；永久网络 tests 用 mock | S2 全部经生产 definition＋公共绑定＋`createModelCostRuntime`；S5 全部经真实 loader／RPC／本地 capture endpoint。期望值：规格字面值（30000ms TTL、5000／10000ms 业务预算、schema 形状）、本 run 端点自己的脚本文档、以及**手算**（`7/1e6·1 + 3/1e6·0.02 + 7/1e6·4 = 0.00003506`；两次＝`0.00007012`；ratio＝`60/10`；left＝`(100−30)/100×6`），无一处用被测实现重算 | pass |

## 4. S5 运行清单（隔离真实 RPC，全部带 `--no-ui`）

| run label | 端点脚本 | 关键观察 |
| --- | --- | --- |
| `model-cost-headless-happy` | balance 110.00，usage 10/7/3 | `arrivals=[balance, model, model]`；`stderr == ""`；文档＝手算两笔；0 UI 帧、0 非协议行 |
| `model-cost-headless-refresh` | balance 第 2 次起持有不答 | 真实无 UI 运行中第 2 次 balance 查询发出（`balanceCalls()===2`）且不阻塞第二次请求 |
| `model-cost-headless-refused` | balance 503，第 2 次起持有 | stderr 恰好 1 行 `余额读取失败（unreadable）`；两个请求都 `completed`；文档＝两笔；stdout 全为协议帧 |
| `model-cost-headless-paused` | 坏基线文档 | stderr 恰好 1 行含「暂停」且指向隔离 home 内的真实文件路径；文件字节不变；请求仍完成 |
| `model-cost-headless-commands` | — | `/budget detail` 一行 info 文案；`/budget nope` 恰好一次 help（error），偏好不变 |
| `model-cost-headless-two-extensions` | balance 503 | 第二个扩展（admission-probe-one，自己写 stderr）在场时错误仍恰好一行 |
| `model-cost-headless-codex`（patched 安装 + `fixtures/codex-quota`） | 两次 Codex SSE 响应各带脚本 `x-codex-*` header（10/20 → 70/30） | 0 UI 帧；两份报告更新窗口并驱动 estimate（ratio 6／left 4.2） |

**`--no-ui` 即宿主的 headless 入口**：宿主自己的 CLI 帮助写着「With --mode rpc or rpc-ui: run extensions headless」，
其 RPC 模式把 `headless: true` 交给扩展运行层，扩展这时拿到的 `hasUI` 为 `false` 且宿主不再产生 UI 帧。
因此“真实 hasUI=false”不是测试伪装出来的：本票运行中 provider 失败**落在 stderr 而不是 ui_request 帧**、
且 stdout 完全没有 `extension_ui_request` 帧，这两件事同时成立只能由 `hasUI === false` 解释。

## 5. 命令与结果（本机 Windows x64／Bun 1.4.2）

| 命令 | 结果 |
| --- | --- |
| `bun test tests/model-cost` | 265 pass / 0 fail（含本票新增 10 例；改动前为 255） |
| `bun test tests/harness-dock/model-cost-headless.test.ts` | 7 pass / 0 fail |
| `bun test tests/framework` | 385 pass / 0 fail |
| `bun test tests/harness-dock` | 70 tests：68 pass / 2 fail —— 两条均为既存 `baseline record` 失败（兄弟 checkout `../oh-my-pi` 停在 579da1d6 而非 v18.5.0 9348320），与本票无关，20 票运行记录同款 |
| `bun test`（全仓） | 见第 8 节 |
| `bun run typecheck`（`tsc --noEmit`） | 通过，无输出 |

## 6. P58／P52 中本票的具名责任

- **P58（受影响消费者迁移后原协议／State／prompt／历史／效果不变）**：本票**未改动** `framework/**`、
  `extensions/connect-bot/**`、`extensions/codebase-tools/**`、任何配置或宿主补丁，也未改动扩展的
  `definition.ts`（命令、配置字段、订阅组形状不变）。唯一的生产改动在 model-cost 自己的 shared logic 内部，
  没有公共接口、协议帧、State 值或 prompt 注入面的变化，因此不存在需要迁移的调用方。无 UI 会话里多出的
  stderr 行是规格已批准的行为（同规格的公共反馈通道），不是契约变化。
- **P52（持久文档只含批准 schema，不增加账本）**：本票未新增／修改任何文档字段、`schemaVersion`、`periodId`
  或 `harnesses.<h>.sessions` 形状；本票的用例只**读回**既有文档来核对记账（`readFileSync` 直接读，不经扩展内存视图），
  且失败/暂停用例断言坏文件字节不变、根目录不新增文件。完整跨文档 schema 检查仍由 06／24 票持有。

## 7. 未验证与限制

- **未等待真实 30s TTL 边界**：真实无 UI 运行只观察到「读数为空时 settled request 发起的刷新查询」（`refused`／
  `refresh` 两例）；成功读数的 TTL 过期需要真实等待规格的 30000ms。该**边界规则**由可控时钟在 S2 落点持有：
  本票 `headless-feedback`（`hasUI:false`、时钟前进一个 TTL）与 12 票的 `provider-balance.test.ts`（有 UI 侧）。
  这是刻意的分工：时间规则用可控时钟比真实等待更准，而本票真实运行证明“无 UI 不改变该调度”。
- **H1／H2 不适用，条件性 H3 未触发**：P42／P43／P69 的 Coverage 列没有 H1／H2 项；三行的 H3 都是“仅当本条真实 OMP
  脚本多次失败或成本明显过高才可转人工”的条件项——本次隔离真实 RPC 运行全部一次通过（第 4 节），因此**没有**需要
  交人工的转交项，也没有未确认即记通过的项。本文件不声明任何人工结果。
- **视觉不属于本票**：无 UI 运行不绘制任何东西，widget 的视觉形态（P67）与 TUI 边界重绘（P41 H1）由 20 票持有。
- **Codex 侧的复用**：headless 的 headers／estimate 运行复用 13 票的 patched 安装与观察 fixture；跨功能的最终组合
  （真实 Codex 与全部业务同时在线）仍由 24 票持有，本票不代其断言。
- **真实服务**：余额／额度文档都是本地 capture endpoint 的脚本字面值，`usage` 也是脚本读数；本文件不证明任何真实
  DeepSeek／Codex 账户的读数，也不证明真实模型用量。
- **平台**：Windows x64／Bun 1.4.2／本机本地文件系统；未覆盖其它操作系统或网络盘。
- **既存无关失败**：`tests/harness-dock/baseline.test.ts` 两条（兄弟 checkout revision）与 17／19／20 票已记录的
  同类环境性波动，本票不认领。
  - **已过时（superseded，2026-10-13）：这两类失败在当前工作树里都不再出现。** 24 把 `baseline.ts` 的锚点校验改成比对**记录 revision 自身的 blob 字节**（不再要求兄弟 checkout 的 HEAD 等于 anchor），并记录其运行里「改动前记录到的失败共 6 项，现在全部消失」。25 本轮（20 的修复后的树）实跑复核：全仓 **864 pass / 0 fail**（98 files，4820 expect）、`tests/harness-dock` **80 pass / 0 fail**、`tests/connect-bot` **142 pass / 0 fail**。上面的原始读数按原样保留（历史记录，未重跑改写）。

## 8. 全仓基线

| 命令 | 结果 |
| --- | --- |
| `bun test`（全仓一次运行） | 888 tests：883 pass / 5 fail，用时 264s |
| `bun test tests/connect-bot tests/codebase-tools` | 168 tests：165 pass / 3 fail |
| `bun test tests/framework` | 385 pass / 0 fail |
| `bun test tests/model-cost` | 265 pass / 0 fail |
| `bun test tests/harness-dock` | 70 tests：68 pass / 2 fail |

全仓的 5 条失败＝下列两处之和，**均与本票改动无关**（本票唯一改动的生产文件
`extensions/model-cost/shared-logic/runtime.ts` 只被 model-cost 自己的用例与 dock 的 model-cost 用例导入）：

1. `tests/harness-dock/baseline.test.ts` 两条：`the checkout is at the recorded revision anchor`、
   `the run artifact stays byte-identical to the anchor for the recorded contract files` —— 兄弟 checkout
   `../oh-my-pi` 停在 579da1d6 而非 v18.5.0 的 9348320（20 票运行记录同款）。
2. `tests/connect-bot` 三条：
   - `panel-registration-lifecycle` 域的 30s 窗口实测两例
     （`the protocol the actual omp-bot panel receives is the frozen one (P23)`、
     `an unregister that never arrives leaves the row to the panel's own window (P25)`）—— 17／19／20 票已记录的同类环境性波动；
   - **跨票缺口（本票发现并报告，不代修）**：`native-session-boundary.test.ts` 的
     `the harness's own shutdown name is code only where the adapter synthesizes the disposal` 失败，原因不是本票：
     该扫描在 `ADAPTER_DIRECTORY` 之外只找到一处 `session_shutdown` 字面量 ——
     `extensions/model-cost/harnesses/omp/widget.ts`（widget 前端自己的 detach 注册）。
     本票未触碰该文件（本票改动在 `shared-logic/runtime.ts`），该断言与 model-cost widget 的寿命接线之间的取舍
     需要由相应票（widget／装配域）或用户裁决：或该前端改用框架提供的钩子，或该扫描把 model-cost 的这个装配列入允许处。
     证据：`bun test tests/connect-bot/native-session-boundary.test.ts` 单独复跑为 5 tests：4 pass / 1 fail，
     失败输出即上述 `[extensions/model-cost/harnesses/omp/widget.ts]`。
  - **已过时（superseded，2026-10-13）：上列 5 条失败与这条跨票缺口在当前工作树里都已消失。** 24 的记录：两项 `baseline`
     anchor 漂移由本票改比对「记录 revision 自身的 blob 字节」关闭；两项面板 30s 窗口与这条
     `native-session-boundary.test.ts` 命中 `widget.ts` 的缺口「由 22 的改动修好，已在工作树」（24 只运行其分区并如此记录，
     不认领其修法）；另一项 balance 存储根遍历 ENOENT 由 24 容忍原子发布的瞬态且未再复现。25 本轮实跑复核：
     全仓 **864 pass / 0 fail**、`tests/connect-bot` **142 pass / 0 fail**。上列 888／883／5 fail、168／165／3 fail、
     70／68／2 fail 等读数保持原样（历史记录，未改写为「未跑」）。
