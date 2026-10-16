# 02: Round 驱动的活动观察与切换保护

**What to build:** 会话 Working/Idle 由 framework 共同 Round 语义提供给扩展。自动继续、待处理输入和等待异步工作期间保持 Working；真正静止才 Idle。普通 transferred 或查看位置切换不因离开该位置而强制结束实际会话的 Round。

**Delivers:** P10, P33

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P10、P33 全部 coverage 与测试。与 01 可独立开始；相邻公共消费 interface 的改动须保持一致，不建立第二套观察或生命周期派发。

- [ ] 用独立场景验证自动继续、待处理输入、持有异步工作及真正静止；只有满足共同结束条件时才观察到 Idle。
- [ ] adapter 仅映射宿主执行事实；不能把 pi 子会话创建或原生执行结束通知直接解释为 Working 或 Idle，也不能把 settled 无条件等同 round_end。
- [ ] 活动与待继续阶段切换会话或查看位置，不产生额外 round_end、保存或 Idle；普通 transferred 与正常 disposed 的含义保持不同。
- [ ] 在共同消费 interface 和实际 OMP、pi 表面验证活动状态；实现复用现有 Round 判断，观察不得反向驱动重复计费生命周期。
- [ ] 按仓库测试规范执行相关确定性场景、所属分区和受影响消费者；TypeScript 变化执行 typecheck。记录实际宿主证据与限制，不以 mock 或历史运行代替本次观察。

## Comments

- **交付行为**（本票首次执行；worktree = 集成分支 `hyper-tdd` 尖端 `bf4c291`，未合入）：framework 新增**活动轴**——一种语义事件 `session_activity`，配套 `AgentActivity`（`working`/`idle`）、`SessionActivityObservation`、`SessionActivityDelivery`、`SessionActivityEventHandler(s)` 词表（`framework/core/protocol.ts`，并入 `SemanticEvent`/`SemanticEventDeliveryMap`，经 `framework/public.ts` 导出）。唯一派生规则 `ACTIVITY_OF_EDGE` 落在新模块 `framework/behaviors/session-activity.ts`：Round 开⇒working、Round 确认结束⇒idle；`round-events.ts` 的合成在**它自己刚派发的那次转换之后**把该读数交给活动轴（`RoundSynthesisInputs.activity`），读数未移动则不交付（一次转换至多一条观察，不新增流量）。`subscriptions.ts` 新增 `SESSION_ACTIVITY_KINDS`；`binding.ts` 在扩展订阅活动种类时同样注册 Round 钩子，不建立第二套观察或生命周期派发。model-cost 改为只从该观察取得每会话读数（`runtime.ts` 的 `session_activity` 处理器；`round_start`/`round_end` 只做计费边界），本地 `SessionActivity` 联合改为复用框架 `AgentActivity`。adapter 未改动：活动语义完全来自 framework 的既有 Round 判断（P10 的“adapter 只映射事实”因此不需要新代码）。P33 未新增生产路径：base 中没有任何“离开位置⇒结束 Round”的实现，本票只把该不变量钉在公共通道上（见下）。
- **验收条目 → 证据**：
  1. 四场景独立用例在 `tests/framework/session-activity.test.ts`：自动继续（`willContinue` 的 settle 是 Round 内的暂停，不产生读数）、待处理输入（`quiescent:false` 不转 idle）、持有异步工作（`heldWork:true` 保持 working，holder 清空后转 idle；`heldWork` 未取得陈述时不关轮；cancelled 活动仍按共同结束条件收口）、真正静止（确认后 idle）；另加「创建会话/重报事实=不开始工作」「每会话各自读数」「远端读数不铸造 Round、不驱动计费生命周期」。
  2. 「原生 settled ≠ round_end」「不把子会话创建当 Working」：framework 合成路径的既有 S2 用例（`tests/framework/round.test.ts`、`tests/framework/pi-round-mapping.test.ts`）不变即为证据；本票的活动用例只经 framework 合成驱动，未新增任何 adapter 判读。
  3. P33 在三个 seam 上：S1 = 新用例（`session-activity.test.ts` 的 “leaving a session's position ends nothing of it”：working 期与待继续期各一次普通 switch（transferred 结束 + 下一会话 start + 事实重报）都不产生 round_end/读数/新 Round，其后该会话自己的 settle 才结束同一个 Round；transfer 后 binding 继续交付）+ `tests/model-cost/detail-tree.test.ts` 新用例（switch 与视图变化后消费文档逐字节不变、行仍强调 working，随后该会话自己的 settle 才落 idle 与清除强调）；S2 = `tests/framework/pi-round-mapping.test.ts` 新用例（pi 侧：settle 后待确认的候选，在 switch 走开之后的重检中**不**被确认——sessionOver 只认 `session_shutdown`，transfer 不是会话自身结束；其后该会话自身静止才产生唯一 round_end）；S3 = `tests/harness-dock/activity-facts.test.ts` 真机用例（见下）。
  4. 共同消费 interface 与真机表面：`tests/harness-dock/activity-facts.test.ts`（3 例全绿）用记录过的 18.5.0 baseline 安装 + 本仓 model-cost entrypoint + 新 fixture `tests/harness-dock/fixtures/activity-facts/entrypoint.ts`（同一 binding 记录 `session_activity` 读数、Round 边沿与会话边界）驱动真实 RPC 会话：一次工具续跑 = working/idle 各一次（两次模型请求同属一个 Round，无中途读数，并断言“边沿先于它留下的读数”的顺序）、第二条 prompt 各自成对、以及 switch 走开时被留下的会话只有 session_start/round_start/working——没有 round_end、没有额外读数、消费文档里没有它的记录。
  5. 「观察不反向驱动计费」：模型侧读数的唯一写入点是 `session_activity` 处理器且不触碰 accounting；框架侧直接构造的远端读数用例断言不派发任何 edge。
- **变异验证（临时注入后已还原，`git diff` 已核对无残留）**：A：合成里让 `willContinue` 的 settle 仍走结束候选 ⇒ 4 例失败（含本票「自动继续」与「待继续期 switch」）；B：活动轴去掉“读数未移动不交付”去重 ⇒ 2 例失败（远端读数重复交付）；C：pi adapter 在 transfer 时把离开的会话记入 `endedSessions` ⇒ 新增的 pi 侧 P33 用例失败。
- **实际执行的检查**：`bun run typecheck` → exit 0（含 harness-dock 新文件）；`bun test tests/framework tests/model-cost` → 980 pass / 0 fail（82 files / 4871 expect）；`bun test tests/harness-dock/activity-facts.test.ts` → 3 pass / 0 fail（真实 18.5.0 安装 + 本仓 entrypoint，8.9s）；`bun test tests/harness-dock/round-facts.test.ts` → 2 pass（同安装，确认 dock 在本机可运行，作为改动未扰动既有真机面的回归）。`tests/harness-dock` 全分区与 `tests/connect-bot`、`bun run test` 全仓本次未跑（时间预算），属最终集成范围。
- **未验证／限制**：(1) POSIX 未执行，全部观察在 win32；(2) 真实 pi 表面（`scripts/pi-subagent-smoke.ts --foreground-only` 路径）本次未重跑，故 pi 的**活动读数**只有 S1/S2（pi adapter 映射 + 共享活动轴）证据，没有真机 pi 的活动序列证据——同进程意义上的活动轴与 harness 无关，但“实际 pi 表面”的读数序列仍属未观察；(3) OMP 真机用例只覆盖活动相位；「待继续阶段」的真机 switch 未构造（该相位在 S1 有确定性用例）；(4) 真机观察到的宿主事实，未在本票解决：会话在工作途中被 `new_session` 离开后，该会话不再被读作静止，framework 因此不确认其结束、读数保持 working（不伪造 idle）；同一运行里宿主/RPC 报出的 `session_end(transferred)` 命名的会话与正在工作的那个不同——本票的真机用例因此只断言“被留下的会话自身没有结束/读数/提交”，transfer 的命名与其归属属宿主事实映射范围，需要后续核对（不把它当作通过）；(5) 跨进程（子进程 → Owner）的活动交付属 03/05/06/07 的观察与来源寿命范围，本票只提供并验证共享含义与交付形状。
- **文档**：`framework/README.md`（behaviors 布局）、`framework/docs/framework-capabilities.md`（活动轴条目 + 活动轴 prose + 交付能力措辞）、`framework/docs/harness-support.md`（`lifecycle.semantic-events` 行）、`docs/adr/0002-semantic-extension-framework.md`（语义生命周期模型新增 Activity axis 条目）；扩展侧 `presentation/session-activity.ts`、`display.ts`、`runtime.ts` 头部说明同步。
