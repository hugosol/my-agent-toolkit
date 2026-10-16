# 24 真实 provider 账户侧核对：本轮账户观察材料

本文件只存证据与材料；交付内容与验收归属见[本票](../implementation/24-provider-account-acceptance.md)、[契约](../contract.md)与 [spec](../spec.md)。

未执行正式安装/切换、未清理用户数据、未做任何付费调用，未新增、复制成新存储或轮换任何真实凭据。本票**未改动任何生产代码**（`git diff extensions/ framework/ entrypoints/` 为空）：交付是账户侧观察入口、其确定性检查与本文的材料。

## 1. 固定来源与环境

- pi：本机已安装的 `@earendil-works/pi-coding-agent@1.2.0`，驱动工件
  `D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`（经 `pi.cmd` shim 解析），
  子进程以 `node` 运行；`pi --version` 报告 `1.2.0`。
- 被测入口：本 worktree 的 `entrypoints/pi/model-cost.ts`（薄入口，re-export 扩展的 pi 装配）。
- 工作树：`hyper/model-cost-pi-migration/24-provider-account-acceptance-3c3510-411dc288ea83`，起点为集成分支
  `pi-adapter` 的合并状态（`3dd3dc1`，已含 13/14 两票）。运行时 bun 1.4.2；依赖 `bun install --frozen-lockfile`。
- OMP 宿主补丁条件：本票不涉及——pi 路径不使用任何宿主补丁；未改动 `host-patches/`、
  `framework/docs/harness-baseline.json` 与 `bun.lock`。
- 隔离：每次运行一个临时 run root（agent state、session dir、work dir、user home，均在本机临时根下）；
  pi 以 `--mode rpc --no-extensions -e <单入口> --no-mcp` 启动，`PI_OFFLINE` 显式清除（这是真实在线运行，
  不是 dock 的受控离线运行）。扩展的存储根由隔离 home 解析（`<home>/.omp/cost-archive`），因此账户读取
  不写用户真实存储根。
- 凭据：只读机器自身 pi 存储 `C:\Users\hugos\.pi\agent\auth.json` 中 `deepseek` 的一条记录（`type: api_key`，长度 35），
  值只进入子进程，从未打印、未写盘、未进入任何提示词或日志；报告里只有指纹 `sha256:5b50a042915c`。
  机器正式 agent state 与运行中的 agent 未被触碰。
- 平台：Windows x64；本材料不推断 POSIX、其他 pi 版本、其他机器或跨用户访问控制。

## 2. 交付内容（本票新增，均为验证与观察支撑，不改产品行为）

|文件|内容|
|---|---|
|`scripts/pi-provider-account-read.ts`|账户侧观察入口：按场景解析凭据 → 独立读账户两次（宿主运行前/后）→ 用真实 pi 加载 shipped 入口跑一次真实宿主 → 等真实前端绘制的读数 → 对照并输出脱敏报告|
|`scripts/support/provider-account-reading.ts`|该入口的独立读取与对照逻辑：provider 答案/绘制行的独立解读、指纹与整篇报告的 secret 清除、两侧对照判定|
|`tests/model-cost/provider-account-reading.test.ts`|上述逻辑的 9 个用例（字面量期望），本票新增测试归属|
|`package.json`、`README.md`|可运行入口 `bun run verify:provider-account` 及文档索引一行|

入口没有模型请求：读取是扩展初始化自己的预取，因此**没有付费调用**，且账户读数不会被折进消费文档。
`--prepare` 只创建隔离 agent state 并打印缺失 provider 的登录步骤，不登录、不安装、不切换。

## 3. 自动协议/错误检查（先完成；在本 worktree 复核有效）

|命令|结果|
|---|---|
|`bun run typecheck`|exit 0（无输出）|
|`bun test tests/model-cost`|390 pass / 0 fail，1978 expect，30 files，6.45s|
|`bun scripts/pi-model-cost-smoke.ts`|exit 0：**81 checks passed, none failed**，25 个隔离真实运行，wall 31.6s|
|`bun test tests/model-cost/provider-account-reading.test.ts`|9 pass / 0 fail|

这些检查证明的是**接线、协议解析、失败保留与 TTL/去重语义**（13/14 票的自动覆盖：`provider-balance`、
`codex-quota`、`codex-estimate` 及真实宿主的 balance/codex phase）；它们的应答是脚本自己的文书，
**不是账户事实**，因此不能替代 §4。故障注入复核（随后还原、复跑全绿）：把对照判定改成恒真、把缺 CNY 行补成
零、把报告清除停用，分别只让对应用例失败（`outside the account's readings`、`0`、明文 secret 出现在报告里）。

## 4. 真实宿主/provider 路径（本次实际执行）

命令：`bun scripts/pi-provider-account-read.ts`（默认两场景；另有 `--scenario deepseek-balance` 与 `--prepare`）。
三次真实运行均 `1 observed, 1 blocked, 0 failed`（codex 场景见 §4.3）。报告文件在 `.cache/provider-account/readings-*.json`
（gitignored 的本机产物），每次运行约 1.2s。

### 4.1 读数、时间与场景

|运行|宿主绘制读数（扩展自己的 widget 行）|账户独立读 before → after|凭据|结论|
|---|---|---|---|---|
|15:15:51.823+08:00 (07:15:51.823Z)|`💰 Balance: ¥254.30`（绘制时刻 15:15:52.499+08:00）|254.30 (15:15:51.824) → 254.30 (15:15:52.512)|sha256:5b50a042915c|the account's own value|
|15:16:35.927+08:00|`💰 Balance: ¥253.91`（15:16:36.586）|253.91 → 253.91|sha256:5b50a042915c|the account's own value|
|15:18:52.900+08:00|`💰 Balance: ¥252.95`（15:18:53.530）|252.95 → 252.95|sha256:5b50a042915c|the account's own value|

场景要素（每次运行相同）：provider `deepseek`、会话 `deepseek/deepseek-flash`（机器自身的默认对）、
**无 prompt、无模型请求**（报告的 `modelRequests` 为 "none: no model request was made by this run"，且无
`agent_start`/`agent_end` 帧）、宿主退出码 0。第三条运行的完整绘制行与账户原始应答：

```
🔥  [░░░░░░░░░░░░░░░░░░░░   0% (0/450.0K)]  Effort: high  💰 Balance: ¥252.95  ⏳ Accrued: ¥0.0000
Total:  Cache: -  ¥Cache/In/Out：--:--:--  Cost: -  Span: —
GET https://api.deepseek.com/user/balance -> 200
{"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"252.95","granted_balance":"222.93","topped_up_balance":"30.01"}]}
```

### 4.2 期间可观察且未被误用的其他事实

- **账户读数不落消费文档**：三次运行的隔离存储根在运行后为空（`storageFiles: []`）——没有会话消费就没有提交，
  账户读数也不因此被写进任何文档；机器真实存储根 `~/.omp/cost-archive` 的前后清单逐字相同
  （`changedByTheseRuns: false`）。
- **凭据不外泄**：报告中的凭据只有指纹；`stderr`、绘制行与消费文档都在写入前逐个清除，整份报告在落盘前
  再做一次 secret 清除；本材料的读数、文档与命令均不含任何 key。
- **读取路径**：balance 走 `<baseUrl 去掉结尾 /v1>/user/balance`、`Bearer <当次凭据>`、直连（`proxy: false`），
  与产品自己的规则一致；独立读使用本脚本自己的解析与连接，因此与宿主的读数不是同一次解析。

### 4.3 Codex 账户侧：明确阻塞（未执行，不标通过）

- 机器 pi 自身凭据存储只声明 `deepseek` 一个 provider；`codex-usage` 场景因此 `BLOCKED`：
  `neither .../.cache/provider-account/agent-state/auth.json nor C:\Users\hugos\.pi\agent\auth.json holds a usable
  credential for 'openai-codex'`，**未发出任何请求**，也未用任何模拟值代替。
- 需要的许可/前置（人类动作，命令已由 `--prepare` 打印）：
  ```
  # 先清除解析偏移：OMP_PROFILE PI_PROFILE XDG_DATA_HOME XDG_CONFIG_HOME PI_CODING_AGENT_DIR OMP_AUTH_BROKER_*
  PI_CODING_AGENT_DIR=<repo>/.cache/provider-account/agent-state pi login openai-codex
  bun scripts/pi-provider-account-read.ts --scenario codex-usage
  ```
  凭据只落在该隔离 state，不进正式存储；登录后同一命令会用真实 pi 1.2.0 + shipped 入口读取真实
  `/wham/usage`（经共享配置 `framework/config.yaml` 的 `codex` 代理），把 5h/7d 窗口读数与前端绘制行对照。
- 未做的替代：未把 OMP 侧的 `openai-codex` OAuth 凭据搬进 pi（跨 harness 搬运真实凭据可能触发轮换、
  且未获授权）；未用 fixture 应答冒充账户读数。该项保持**未验收**。

## 5. 对照材料

### 5.1 账户事实 vs 本地模拟（严格区分）

|来源|读数|证据类型|可以证明什么|
|---|---|---|---|
|本票真实路径（§4.1）|CNY `252.95`（15:18:53.530+08:00）|**账户事实**|真实 DeepSeek 账户在自己的 endpoint 上的应答，且与真实前端绘制一致|
|13 票真实宿主（端点应答是脚本自己的文书）|`¥110.00`|协议模拟|接线、解析、TTL、失败保留与凭据不外泄|
|14 票真实宿主（同上）|5h `10` / 7d `40`，ratio `3.3333`|协议模拟|双窗口识别、独立更新、比例测量与保存恢复|

只有第一行可以核对为账户侧结果。本地模拟、RPC 输出与研究实测都不能当账户事实。

### 5.2 余额变化不是请求费用真值（本次可观察证据）

- 三次运行本身**没有任何模型请求**，而账户读数在约 3 分钟内从 254.30 走到 252.95（granted 份额同步从
  224.28 到 222.93）：账户的变化来自账户侧的消耗（本机 pi/OMP 的代理活动、其他客户端、granted 与 topped-up
  的构成、以及价格表已含的折扣），不是这三次观察造成的请求费用。
- 因此本材料**不**把余额变化当请求费用真值，也**不**要求 provider 实际收费等于模型参考价。
- 参考价只作为参考记录：机器自身 catalog 对本次 run 的模型（`deepseek-flash`）声明
  `input 0.3 / output 1.2 / cacheRead 0.006 / cacheWrite 0`（USD per million tokens，报告的 `referencePrice` 字段），
  真实账户收费与之是否相同不在本票承诺内。
- 若要观察"一次真实请求 ↔ 请求前后余额"的对照，需要**另行授权的付费调用**（本票未执行）：在隔离 home 下用
  真实 pi 跑一次 `deepseek/deepseek-flash` 请求，保留请求时刻、该请求的 model-cost 自身金额与前后余额读数，
  并明确三者是不同性质的事实（请求费用由 model-cost 按请求锚价计算；余额差还含账户侧其他变化）。

## 6. 人类验收清单（P53）

账户侧结果由你核对；下列各项中只有第 1、2 项在本轮由 Agent 准备完毕，结论仍是你的判断。

- [ ] **重放并核对读数**：`bun run verify:provider-account`（单场景重放：`bun scripts/pi-provider-account-read.ts --scenario deepseek-balance`），
      确认 `drawn 💰 Balance: ¥<金额>` 与你 DeepSeek 控制台在同一时刻的余额一致；报告时间戳（本地带时区 + UTC）
      与凭据指纹已随读数记录。
- [ ] **确认没有秘密**：报告里除 `sha256:` 指纹外没有任何 key/token；`stderr`、绘制行与消费文档同为脱敏后内容。
- [ ] **Codex（需你先登录）**：按 §4.3 在隔离 state 登录后重放，核对 5h/7d 百分比与 reset 是否等于
      `/wham/usage` 答复；未登录前该项保持未验收。
- [ ] **可选（另行授权付费调用）**：按 §5.2 的最后一段做一次请求级对照；余额差不必等于参考价，也不作为请求费用真值。

## 7. 未覆盖 / 未验收（如实记录）

- **Codex 真实账户读数**：缺 pi 自身可解析的 `openai-codex` 凭据/许可，属明确阻塞，未验收（§4.3）。
- **真实付费调用**：未授权，未执行；因此"真实请求的成本"与"账户收费"的对照未产生。
- **平台与版本**：仅 Windows x64 + pi 1.2.0 + 本机网络路径；不外推 POSIX、其他版本或其他用户环境。
- **余额控制台对照**：读数与时间已记录，最终一致性判断属人类（§6 第 1 项）。
- **到期 TTL / 失败保留的真实边界**：真实宿主用宿主自己的时钟（13 票以配置 `balanceTtlMs: 1` 驱动），
  边界与受控时钟判定在 S2 套件；本票的真实路径只观察"启动预取即读数"与直接读。
- **OMP dock 分区未重跑**：本票未改动任何共享支撑或生产代码（新增文件 + 测试归属 + 文档），其本机
  `core.autocrlf=true` 既有失败与 13/14 票记录一致；未跑全仓 `bun run test`（属最终整合）。
- 未执行正式安装、切换、清账或用户数据清理；未调用 retro、未派发其他票据、未改动集成分支工作区。
