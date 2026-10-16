# 13 DeepSeek 余额认证与刷新闭环：本轮真实验证记录

本文件只存证据与限制；交付内容与验收归属见 [本票](implementation/13-deepseek-balance.md)、[契约](../contract.md)与 [spec](../spec.md)。未执行正式安装/切换、未清理用户数据、未做付费调用，未新增或轮换任何真实凭据。

## 1. 固定来源与环境

- pi：本机已安装的 `@earendil-works/pi-coding-agent@1.2.0`，驱动工件为
  `D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`（经 `pi.cmd` shim 解析），
  子进程以 `node`（v24.18.0）运行。`pi --version` 报告 `1.2.0`。
- OMP：本轮**未改动任何 OMP / framework 生产代码**；仅改动两个共享 dock 支撑与一个 pi 冒烟脚本（见 §2）。
  OMP 侧工件沿用既有 `@oh-my-pi/pi-coding-agent@18.11.1` 隔离安装（`tests/harness-dock/baseline.ts` 的记录），
  本轮未安装新工件、未打补丁。
- 工作树：`hyper/model-cost-pi-migration/13-deepseek-balance-98a6a9-411dc288ea83`，起点为集成分支 `pi-adapter`
  的合并状态（`5ad9af7`，含 02 票）。
- 运行时：bun 1.4.2；依赖经 `bun install --frozen-lockfile` 装入（typescript 7.0.2 等 6 个包）。
- 隔离：与 02 票相同——每次运行一个临时 run root（agent state、session dir、work dir、capture dir、user home）；
  pi 显式 `--mode rpc --no-extensions -e <单入口> --no-mcp`；`models.json` 把用到的 provider 指向本机 capture endpoint，
  凭据为本脚本自造的合成字面量；`PI_OFFLINE/PI_SKIP_VERSION_CHECK/PI_TELEMETRY` 固定；无真实凭据被读取。

## 2. 本轮改动（不新增生产路径）

|文件|改动|
|---|---|
|`tests/model-cost/provider-balance.test.ts`|新增 1 个用例：换认证后下一查询使用当次凭据、首个答案不被缓存；并把本文件内余额承诺的旧编号标签（P38）更正为当前契约的 P29。|
|`tests/harness-dock/capture-server.ts`|余额脚本项新增可选 `respond(call)`：按次脚本化余额应答（供"先读数、后拒绝"的真实验证）。未给该回调时行为逐字不变。|
|`scripts/pi-model-cost-smoke.ts`|新增 `phaseBalance`（6 个真实 pi 运行场景、19 项检查），并同步该脚本头部说明与限制输出。|

未改动：`extensions/model-cost/**`、`framework/**`、`entrypoints/**`——pi 侧 provider access 接线由 02 票交付的装配
（`extensions/model-cost/harnesses/pi.ts` 的 `context.providerAccess`）与 framework 的 pi adapter
（`framework/adapters/pi.ts` 的 `harnessProviderAccess`）已经成立；本票交付的是对该承诺的完整覆盖与真实宿主证据，
以及失败保留场景所需的按次脚本能力。

## 3. 命令与结果

### `bun run typecheck`

exit 0（无输出）。

### `bun test tests/model-cost/provider-balance.test.ts`

`13 pass / 0 fail`（42 expect）。新增用例首次运行即通过：实现按每次操作调用 `access.resolve`，事实本就取自当次。

**Fault injection（确认该用例能发现所述违规，随后已还原）**：把 `provider-balance.ts` 的 `runQuery` 改为只解析一次
并复用首个答案（缓存当次资料）→ `10 pass / 3 fail`，其中本票新增用例以
`authorization: expected "Bearer key-two", received "Bearer key-one"` 失败，另两个既有用例同时失败；还原后
`13 pass / 0 fail`，`git diff` 对该生产文件为空。

### `bun scripts/pi-model-cost-smoke.ts`（真实 pi 1.2.0，RPC + 可控 capture endpoint）

exit 0；`PI MODEL-COST SMOKE SUMMARY: pi 1.2.0 — 44 check(s) passed, none failed`，13 个隔离 run，wall 27.2s。
其中本票新增的余额阶段 19 项（6 个 run）：

- **接线与成功**：扩展自身发出的余额查询真的离开进程，落在宿主解析出的地址上（`/user/balance`，`/v1` 已去除），
  请求头为 `Bearer <本脚本合成凭据>`；读数到达真实前端绘制的 widget（`Balance: ¥110.00`）；初始化的预取先于第一个模型请求
  （arrivals `["balance","model","model"]`）；TTL 内的第二次 exchange 未再查询（余额调用仍为 1 次）。
- **凭据不外泄、无账号分区**：合成凭据只出现在那一次余额请求上；stderr、session JSONL、序列化后的模型请求、widget 帧、
  存储根全部文件均不含它；保存的活动文档顶层键为 `harnesses / holiday / periodId / schemaVersion / start`，
  未新增账号或凭据分区。
- **成功 TTL 与过期**：`balanceTtlMs: 1` 下，结算请求触发刷新（arrivals `["balance","model","balance"]`）；
  随后真实空闲 2.5s 内余额调用仍为 2 次（无定时器、无轮询）；下一次 exchange 的结算再次触发（3 次），读数保持端点金额。
- **失败保留**：端点对第 1 次调用回答读数、其后一律 503；被拒绝的刷新之后 widget 仍显示 `Balance: ¥110.00`，
  全程从未出现 `Balance: unavailable` 或 `Balance: ¥0`。
- **无可用认证**：会话运行在另一 provider 上、`deepseek` 声明为无凭据（并清除 `DEEPSEEK_API_KEY`）：扩展仍绘制、
  模型 exchange 正常完成，端点未收到任何余额请求，widget 无任何余额行、stderr 无余额失败、无 operator 通知。
- **并发查询**：端点扣住全部余额应答时，预取的 5000ms 业务预算结束第一次 exchange 的等待（不阻塞工作，arrivals
  `["balance","model","balance"]`），无读数时显示 `Balance: unavailable (unreachable)` 而非零；第二次 exchange 的结算
  加入仍在途的查询而不新发（余额调用仍为 2 次，arrivals 加 `model`），释放后该应答被同一实例接受（`Balance: ¥77.00`）且无第三次查询。
- **当次认证（跨进程）**：同一 run root 下第一个进程以凭据 A 查询；它留下的存储根文件不含 A；把同一 run root 的
  `models.json` 换为凭据 B 后，第二个进程的查询以 B 认证。

### 消费者检查（本次改动的共享支撑面）

- `bun test tests/harness-dock/model-cost-balance.test.ts --timeout 900000`：`6 pass / 0 fail`（OMP 真实宿主余额分区，
  直接消费被改动的 `capture-server.ts`）。
- `bun test tests/model-cost`：`354 pass / 0 fail`，27 文件（本票所属分区）。
- `bun test tests/harness-dock --timeout 900000`：`45 pass / 12 fail`，23 文件，101.7s。12 项失败**全部**是本机
  `core.autocrlf=true` 检出造成的既有现象，与本票改动无关，证据如下：
  - 失败签名只有两类：10 项是 `host-patches/omp-18.5.0-viewed-session/patch.diff` / `omp-18.5.0-codex-response-boundary/patch.diff`
    "touches no file"（`tests/harness-dock/host-patch-artifact.ts:224`），2 项是
    `bun.lock: recorded 9e9f4833… but found 7f5c82e6…`（`baseline.test.ts` 与 `session-driver.test.ts` 的锁文件校验）。
  - 行尾证据：`git ls-files --eol` 对这些文件报告 `i/lf w/crlf`，`core.autocrlf=true`；`git show HEAD:bun.lock | sha256sum`
    = `9e9f4833…`（即记录值，LF 字节），而工作区 `bun.lock` = `7f5c82e6…`（CRLF 检出）。`patchTouchedFiles` 以 `\n` 切行并
    匹配 `^diff --git a/(.+?) b/(.+)$`，CRLF 行因此不匹配（脚本内直接验证：两个 patch 文件均返回 `[]`）。
  - A/B 对照：`git stash push` 暂存本票三个文件后，`bun test tests/harness-dock/baseline.test.ts
    tests/harness-dock/viewed-session.test.ts tests/harness-dock/model-cost-modes.test.ts` 以**同一签名**失败
    （`5 pass / 3 fail`）；随后 `git stash pop` 还原（`git status` 只余本票三个改动与证据文件）。
  - 结论：这 12 项在 LF 检出（CI/Linux，或 `core.autocrlf=false`）下不构成失败；本机无法在不改变检出策略的前提下取得
    该分区的全绿，故如实记录为环境限制，而不是本票引入的回归。本票直接消费该支撑的
    `model-cost-balance.test.ts` 在两者状态下均通过。

## 4. 未覆盖 / 未执行（如实记录）

- 真实账户事实未取得：端点回答的是本 fixture 自己的文书，不是任何真实 DeepSeek 账户的读数；未做付费调用。
  P29 覆盖中"真实账户侧确认"按契约归 P53（24 票）。
- 真实宿主上无法更换运行中进程的凭据（pi 的 registry 在进程启动时确定 provider 配置），因此"换认证后立刻使用新凭据"
  由 S2 可控端点用例证明（含故障注入对照），真实宿主证明的是"每次查询使用宿主当次解析出的地址与凭据"以及
  "跨进程替换凭据即被下一进程采用、且旧凭据不落盘"。
- 真实宿主的 TTL 场景使用宿主自己的时钟（配置 `balanceTtlMs: 1`），边界与可控时钟的精确判定在 S2 套件；
  未在真实宿主上做 30000ms 默认 TTL 的长时间等待。
- pi adapter 的 hermetic（非真实宿主）单测仍未编写（02 票已记录的缺口）；本票以真实宿主路径证明 pi 侧接线，
  真实宿主无法在同一进程内更换凭据，因此"每次操作都重读当次资料"这一条只由 S2 用例（含故障注入对照）证明。
- 真实宿主的新检查只做了"计数/顺序/缺席"断言，未对它们做故障注入；可判别性由场景本身给出（端点只在被查询时记录到达，
  TTL 内多一次查询、并发时多一次查询、失败时丢读数、无凭据时发请求或谎报失败，都会改变被断言的计数或文本）。
- 未运行 `tests/framework` 分区与全仓 `bun run test`：本轮未改动 framework/OMP 生产代码，框架分区不在本票改动的影响面内；
  `tests/harness-dock` 分区的 12 项失败为本机 `core.autocrlf=true` 检出造成（见 §3），全仓回归属最终整合。
- 仅 Windows x64 与 pi 1.2.0；未推断 POSIX、其他版本、其他 provider 或其他用户环境。
- 未执行正式安装、切换、清账或用户数据清理；未调用 retro、未派发其他票据、未改动集成分支工作区。
