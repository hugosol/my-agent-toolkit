# 08：一次记账与直接父 Session 汇总（记录）

**本文件是本票交付的验证记录**：pi 上的"每个已观察请求只累计一次"（P8）、"Round 只累计本实际会话请求，子消费只沿直接父 Session 链参与 Session 汇总"（P10）与"当前树只含真实所属会话及其后代"（P40）的 S1/S2/S3 证据、真实宿主记录，以及一个**必须回到权威决定**的真实宿主缺口。

- **入口（可重跑）**：
  - `bun test tests/model-cost/pi-session-accounting.test.ts`（本票新增的 S1/S2/S3 分区）
  - `bun test tests/model-cost`（所属分区及共享契约消费者）
  - `bun test tests/framework`（S1 共同契约消费者复核）
  - `bun run typecheck`
  - `bun scripts/pi-session-accounting.ts`（真实宿主入口；见 §3、§5）
- **源状态**：分支 `hyper/model-cost-pi-migration/08-session-accounting-cc1d9d-411dc288ea83`，起点 `304451e`（05 合并后的集成分支）。本票改动：新增 `tests/model-cost/pi-session-accounting.test.ts`、新增 `scripts/pi-session-accounting.ts`，本文件。**未改** `extensions/**`、`framework/**`（见 §5 的缺口说明）。
- **环境**：win32 10.0.26200 / x64 / bun 1.4.2 / node 24.18.0；真实宿主 pi 1.2.0（`D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`）、第三方工件 `pi-subagents@0.78.0`（本仓库 `node_modules/pi-subagents`）。无 provider 凭据、无付费调用：所有模型请求由本机 OpenAI 兼容捕获端点回答。

## 1. 交付的行为（本票）

| 能力 | 落点 | 语义 |
| --- | --- | --- |
| pi 上的三条承诺的 S1/S2/S3 覆盖 | `tests/model-cost/pi-session-accounting.test.ts`（7 例） | 生产 pi 装配（真实 pi adapter + 真实 definition/runtime/前端 + 本 run 自己的 `config.yaml`）绑到受控原生面：pi 自己的 lineage link 决定直接父、`agent_start`/`agent_settled` 决定 Round、`before_provider_request`/`message_end` 决定 Turn。全部期望值为本文件手算的字面量。 |
| 一次记账的扩展侧mark | 同上，第 4 例 | 把框架**已经派发的同一个 Turn 交付**再次交给扩展自己的公共 handler：同一 `sessionId+turnId` 不重计；该标记跨 Round 边界与周期切换仍在，且不进文档（记录里没有请求账本字段）。 |
| 真实宿主记录 | `scripts/pi-session-accounting.ts` | 真实 pi + 固定 provider 的一次后台委派：端点自己的请求计数 vs 文档里各自记录的用量、直接父链、以及"由已保存记录恢复的树"。事实缺失时**记录 FAIL 并继续**，最后以非零退出码交出完整记录。 |

## 2. S1/S2/S3 自动证据（真实运行）

```
$ bun run typecheck                                  # tsc --noEmit，无输出
$ bun test tests/model-cost/pi-session-accounting.test.ts   # 7 pass / 0 fail（53 expect）
$ bun test tests/model-cost                          # 401 pass / 0 fail（32 files, 2064 expect）
$ bun test tests/framework                           # 430 pass / 0 fail（35 files, 2027 expect）
```

- **P10（第 1、2 例）**：工具继续（同一 run 内的后续请求）留在本会话本 Round；子代理的请求进它自己的 ledger 与自己的 Round；父 Round 不含子消费；父的 Session 含后代合计（`inclusiveTotals` 沿直接父链一次一份）；嵌套会话的直接父（child）≠ Owner（main）；并发两个请求各自落账；子 Round 结束后只写子自己的记录（父保存不写子记录，反之亦然）；子代理在后一轮续跑时在自己的记录上累加。
- **P8（第 3、4、5 例）**：同一 finalized message 重复交付不重计（跨 Round 边界、跨新 run 也一样）；真正的新请求仍计一次；下一进程从文档读回的是"真正发生过的两次"；同一 Turn 的交付重放不重计（框架与自己 handler 两侧都覆盖）；周期被另一 writer 替换后重复交付仍不重计、且不落盘；子自身的已保存记录 + 本根观察同一子会话 + 共享文档三者只算一份消费（baseline 上继续而非替换或重复），主子两条记录各自的版本与值不被对方改写。
- **P40（第 6、7 例）**：同一文档混放"当前树 + 另一根 + 另一 harness（含与主子同 id 的记录）"时，`agentTree` 只有 root、root 自己的 model 行与真实后代行（子 depth 1、孙 depth 2），另一根与另一 harness 的会话一行也没有；每行是自己一份用量（子的行不含孙的）；含后代合计来自同一权威视图；名称回退＝最新名 →（pi 不报 task/agent 名）→ 文档里的名字 → session id；读树前后文档逐字节不变；新进程（第二个装配）读回同一棵树、前端按直接父缩进画（子两空格、孙四空格），且不发请求、不改文档。

**故障注入（每条注入后立即还原并复跑绿）**：曾一度把 `started()` 改为在会话 start 交付上 `remember()`（以为"started 也说身份"），`tests/model-cost` 立刻 1 例红（`session-ownership-tree.test.ts:352` 明确要求"只有 start 的会话没有 identity"），据此**还原**；这记下一条既有语义：身份来自**承载该会话事实**的交付（`session_facts`/`turn_*`/`round_*`/记录），一次 start 本身不建立 identity。

## 3. 真实宿主事实（本机实测，源不变）

一次完整运行（隔离 agent/session/work/home + 本 run 自己的配置根与子入口，`pi-subagents@0.78.0` 真实后台委派）：

```
$ bun scripts/pi-session-accounting.ts
  ok    the harness under test is the fixed version this script states        # pi 1.2.0
  ok    the pinned provider artifact this repository installs is present
phase: one background delegation, and what each session's own record holds
  note  the root's Round ended after its background child's completion woke it
  ok    the delegation really created a child session of its own, linked to the root's own file
  FAIL  the child's own process accounted and saved its own session in the shared document
        document: [["<根 id>",null,{"deepseek":{"deepseek-flash":{"tokens":{"input":3000,...,"output":600},"costCny":0.0108}}}]]
  ok    the root's own process accounted and saved its own session in the shared document
  ok    the delegated task ran as its own session's requests, beside the root's own
  FAIL  the child's own record holds exactly the requests that really ran in it, once each
        child own {} for 1 request(s)
  ok    the root's own record holds its own requests alone, with no descendant's consumption added
  FAIL  every request carries this extension's own price for one reading, and the two records price it the same
        child ¥undefined, root ¥0.0108 for 3 request(s)
  FAIL  the document holds the two sessions and no third accumulation
        [["<根 id>",null,2]]
  FAIL  the child's record states the real direct parent
        child parent undefined, root "<根 id>"
  ok    the child session's own file names the root's file as the session it came from
  ok    the child's own process really loaded this extension
phase: a second process resumes the root session and draws the tree
  ok    the second process runs the very session the first one left
  FAIL  the tree carries the child session the document already holds, one step in by its direct parent
        lines ["🔥 … 0% (1,200/450.0K) …","Total:  Cache: -  ¥Cache/In/Out：--:--:--  Cost: -  Span: —"]
  ok    the resumed session's own consumption is the record the first process committed
  ok    drawing the tree asked the model for nothing
  ok    drawing the tree changed nothing in the shared document

11 observations held, 7 required facts missing。   # 退出码 1
```

已核对的独立事实（一次保留的 run root，四次运行结论一致）：

- **端点自己的计数**：4 次 completion 请求 = 根 3 次（1 次委派、1 次唤醒后续写、1 次收尾）+ 子 1 次（`captures/request-003` 的首条 user 消息是委派任务文本）。
- **根的记录**：`own.deepseek."deepseek-flash".tokens = {input 3000, output 600}`（= 3 × 捕获用量，一次一份）、`costCny = 0.0108`（= 3 × 0.0036，本扩展维护数据的 flash 峰时价；端点携带的宿主自算 cost 是 3 × 0.0014 = 0.0042，**没有被采用**）、`parent: null`、`saveVersion: 2`。子的一次请求的用量**没有**被加进根自己的记录。
- **子的身份与父链**：子会话文件 `…/run-0/session.jsonl` 首行 `{"type":"session","id":"01a143c8-66b0-727c-…","parentSession":"…/<根会话>.jsonl"}`；provider 自己的运行元数据 `…_scout_meta.json` 记 `parentSessionId = <根会话 id>`、`launchResolvedExtensions.required = ["model-cost"]`、`effective = [runtime, model-cost]`、`usage = {input 1000, output 200, turns 1}`。
- **恢复态**：第二个进程真的 resume 了同一会话文件；`/budget detail` 后前端有 `Total:` 行（该行数值为破折号＝本次展示面按目标当前 pair 读到的空值，属 [18] 展示范围，本票只据文档核对"已保存消费被恢复"），且未发任何模型请求、文档逐字节不变。
- **缺口**：子会话自己的**记录从未出现**在共享文档里（等待 45 s 后文档仍只有根一条）。

### 3.1 缺口机制（代码位置，非推断结论）

- `framework/behaviors/binding.ts:315` 只在 `session.owner.kind === "owner"` 的 `session_start` 上调用 `initializeImplementation`。
- 子进程里唯一的会话是那个被生成的子会话；pi adapter 按 pi 自己的 lineage 链把它的 owner 解析为**跨进程可达的顶层根会话**（`framework/adapters/pi/session.ts`：`owner = {kind:"inherited", key:"main:<根 id>"}`），因此 `owner.kind !== "owner"`。
- 扩展的初始化（进而 `storage.period()`）不发生 ⇒ `request-accounting` 的 `turnStarted`/`turnSettled` 在 `period === undefined` 时直接返回 ⇒ 子进程既没有累计、也没有提交（记录只在 Round 结束且有增长时写）。
- 这解释了实测：子进程**确实加载了**本扩展（provider 自己的启动证据）、**确实跑了**一次真实请求（端点 + 子会话文件 + meta 三方一致），但共享文档里没有它的任何消费。

### 3.2 影响与归属

- 影响的是 P8/P10 覆盖里"**子自身记账**"与"文档同步"这一半：跨进程（后台）委派的子消费目前完全不落账；同进程（前台）路径由根实例观察（本票第 1/2/5 例即其确定性证据），但前台真实路径另受 ticket 05 记录的 ctx 失效崩溃阻挡。
- **本票未做静默补丁**：修法属于公共生命周期语义或跨进程观察推送，二者都超出"本票只分割交付"的范围，且都会影响 OMP 与其它消费者（P50）。按票据的执行约束，带回权威决定：
  1. 让 framework 在"本进程接手的第一个会话（即使它不是自己的 owner）"上初始化/清理实现；**或**
  2. 由 spec §6 的"单向事件推送"（[06] 本机通信）把子进程的会话/Turn 事实推给**已初始化**的所属进程，由它记账（届时本票第 3/5 例的"一个已观察请求只算一次"正是该路径的准入规则）。
  在决定落定前，`scripts/pi-session-accounting.ts` 的该条期望保持 **FAIL（未验收）**，不以 mock 或降级写法冒充通过。

## 4. 未验证 / 未覆盖

1. **跨进程子消费落账**：见 §3.2，等权威决定；本票未改公共路径。
2. **前台委派的真实子会话事实进入公共交付**：受 ticket 05 记录的 pi 前端 `ctx` 失效崩溃阻挡（父进程死亡），非本票机制。
3. **嵌套/取消/失败/晚到**真实宿主路径：本票只在确定性 S1/S2 覆盖（第 2 例嵌套+并发、第 1 例晚到与工具继续）；真实宿主未驱动。
4. **POSIX**：所有真实运行均在 win32；POSIX 未运行。
5. **每次真实验证的复现条件**：pi 1.2.0 + `pi-subagents@0.78.0` + 本机捕获端点；`--keep` 只保留 run root，不写仓库文件与操作者真实存储根（本 run 的存储根在 run root 的 `user-home/.omp/cost-archive`）。

## 5. 复用与归属

- **复用（已复核有效）**：`request-accounting.test.ts`（一次记账、Round 结束保存）、`round-totals.test.ts`（Round 只含本会话、工具继续、晚到不回收）、`session-ownership-tree.test.ts`（直接父链合计、身份来自交付、名称回退）、`detail-tree.test.ts`（S1/S2 的静态树与另一根混放）、`session-recovery.test.ts`（fork/重启）＝ P8/P10/P40 的宿主无关 S1/S2/S3 先例；本票在其上补的是 **pi 实现**（原生事实→公共交付→文档→新进程）、跨 round/跨周期的**未重计**，以及"另一 harness 同 id 记录混放"这一类。
- **未认领**：Round/Turn 边界与后台保活属 [03]/[09]/[10]；只读同步/逐记录裁定属 [04]；provider 余额/额度属 [13]/[14]；原生绘制属 [18]；子入口加载与身份映射属 [05]。
