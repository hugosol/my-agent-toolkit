# 03 请求锚价与原生连续活动完整计费：本轮真实验证记录

本文件只存证据与限制；交付内容与验收归属见[本票](implementation/03-request-pricing-rounds.md)、[契约](../contract.md)与 [spec](../spec.md)。未正式安装/切换、未清理用户数据、未做付费调用。

## 1. 固定来源与环境

- pi：本机已安装的 `@earendil-works/pi-coding-agent@1.2.0`，驱动工件
  `D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`（经 `pi.cmd` shim 解析），子进程以 node v24.18.0 运行。
- OMP：`@oh-my-pi/pi-coding-agent@18.11.1` 已安装但本轮未改动其代码；`tests/harness-dock` 的两个受影响文件被运行以核对共用 dock 支持未回归。
- 工作树：`hyper/model-cost-pi-migration/03-request-pricing-rounds-…`，起点 `5ad9af7`（= 集成分支 `pi-adapter` 的 02 合并点）；实现提交见 §3 末尾。
- 运行时：bun 1.4.2（`bun install --frozen-lockfile` 装入 yaml 2.9.1、typescript 7.0.2 等 4 包）。
- 隔离：pi 每次运行一个临时 run root（agent state、session dir、work dir、capture dir、user home）；显式 `--mode rpc --no-extensions -e <入口> [ -e <探针> ] --no-mcp`，`models.json` 把被测 provider 指向本机 capture endpoint，凭据为 dummy key；`PI_OFFLINE/PI_SKIP_VERSION_CHECK/PI_TELEMETRY` 固定。未触碰正式配置、运行中的 agent 或用户数据；仓库文件未被运行写入。

## 2. 本轮实现变更（均为 pi 路径上的真实宿主事实驱动）

1. **修复：pi 的“未知 context”被当作数字**（真实宿主触发）。
   pi 在 context 未知时（压缩之后、下一次响应建立读数之前）以 `tokens: null` 发布读数；pi 前端把
   null 传给 token 格式化器（`formatTokens`），使**整个 widget 重绘抛错**，而该重绘正运行在记账的变更通知里，
   于是 `turn_end`/`round_end` 订阅者一并失败，会话消费从不落盘。修复：`framework/adapters/pi.ts` 的
   `getContextUsage` 结构类型如实声明 `tokens: number | null`；`extensions/model-cost/harnesses/pi/widget.ts`
   把 null 当作“无读数”（与显示层既有规则一致：未知不是零）。
   修复前真实运行 stderr：`modelCost: model-cost: turn_end handler failed: Cannot read properties of null (reading 'toLocaleString')`
   与 `round_end handler failed: …`（各 1 次），修复后整轮 smoke 中 `handler failed` 出现 **0** 次。
2. **smoke 辅助函数竞态修复**：`filesUnder` 在存档锁目录与遍历之间被移除时不再致命（此前一次运行在
   `consumption.json.lock` 上以 ENOENT 中断）。
3. **dock 支持（测试支撑，均为加法）**：pi 驱动可加载多个 `-e` 入口、可为一次 run 声明多个模型；
   capture endpoint 的 per-request 脚本可指定失败状态与“记录到达但延后作答”的窗口。

## 3. 命令与结果

| 命令 | 结果 |
|---|---|
| `bun run typecheck` | exit 0 |
| `bun test tests/framework tests/model-cost`（本票所属分区） | **756 pass / 0 fail**，3660 expect，61 文件，58.45s（起点同分区为 731 pass；本票新增 25 例） |
| `bun test tests/codebase-tools`（capture-server 消费者） | 24 pass / 0 fail，47.36s |
| `bun test tests/harness-dock/round-facts.test.ts tests/harness-dock/model-cost-accounting.test.ts`（受影响 OMP dock 文件） | 6 pass / 0 fail，13.95s |
| `bun scripts/pi-model-cost-smoke.ts` | exit 0，**44 check(s) passed, none failed**，15 个隔离 run，18.35s；同源状态再跑一次同为 44/0（20.00s） |
| 故障注入（临时改 `pi/turn.ts` 的 all-zero 读数直通、`pi/round.ts` 的 settle 映射为 activity_started） | 命中 1 例（P9 all-zero）与 8 例（P18 关轮语义）失败；还原后 22/22 green（`framework/adapters/pi.ts`、`pi/round.ts` 已恢复原状） |
| `bun test tests/harness-dock`（全 dock 分区，OMP 真实宿主） | 已启动（后台）；结果见本文件末尾“未覆盖/未执行”的说明 |

真实宿主 smoke 的逐例结果（`--keep` 运行保留的 run root 读回；金额为该脚本自身对维护数据 off-peak 价的手算，
`EXCHANGE_TOKENS = {input 7, cacheRead 3, cacheWrite 0, output 7}`）：

- **round-tool**：2 次 provider 请求 → 一条会话记录，`input 14`，`costCny 0.00007012 (= 2×0.00003506)`，`saveVersion 1`；
  公共探针边缘 `round_start → turn_start → turn_end → turn_start → turn_end → round_end`（关轮在最后一次结算之后）。
- **round-retry**（首次作答 500）：2 次请求 → `input 7`，`costCny 0.00003506`，`saveVersion 1`；被拒尝试的
  `turn_end … usage=<none>` 被交付，其后仍为同一对开闭边缘。
- **round-compaction**（`contextWindow 1` + `reserveTokens 0`）：4 次 provider 请求、journal 中 2 条 `compaction` 条目、
  2 个被交付的 Turn → `input 14`，`costCny 0.00007012`，`saveVersion 1`，边缘仍为一对。
- **round-queued**（忙时以 `streamingBehavior: "steer"` 提交第二条）：2 次请求、14 input、`saveVersion 1`、一对边缘。
- **request-anchor**（pi 自身价 777/888/999/1111 USD 与维护数据 CNY 价故意不同；会话中途 `set_model` 换到
  `deepseek-v4-pro`）：`deepseek-flash 0.00003506`、`deepseek-v4-pro 0.00012645`（= (7·4.5+3·0.15+7·13.5)/1e6），
  `saveVersion 2`（两轮各存一次）；pi 自身 journal 中的 cost 为另一数量级，未被采用。
- **reading-silent**（endpoint 不报 usage）：1 次请求、无会话记录、操作者收到“没有可靠的 usage 读数…跳过不等于免费”。
- **reading-partial**（wire `{input 10, output 0, cacheRead 3}`）：`{input 7, cacheRead 3, cacheWrite 0, output 0}`，
  `costCny 0.00000706`（零桶如实存储且不贡献金额）。
- **reading-allowance**（`openai-codex/gpt-5-codex`，host 目录价 3/15/0.3/3.75 USD）：`referenceCostUsd 0.0001269`，
  **无 `costCny`**。

实现提交：`388f9dd`（"Price every request from its own start on pi, and keep its Rounds whole"）。

## 4. 覆盖对照（P7 / P9 / P18）

| 承诺 | 检查（seam） |
|---|---|
| P7 请求锚价 | S1：`tests/framework/pi-turn-mapping.test.ts`（请求自身的 model/provider/时刻两端一致；会话改模型不重估已结束请求；目录价在请求开始后变化只影响后续请求；harness 未报价与全零报价都不是价）；S1(共享)：`tests/model-cost/request-accounting.test.ts` 的“锚价为本请求在数据时区自身起点”组（峰/谷/周末/假日的独立时刻与字面量）。S2/S3：smoke `request-anchor`（两模型各自手算金额；第三方最终 cost 明显不同且未被采用）。 |
| P9 读数与口径 | S1：`pi-turn-mapping`（上报读数原样交付、零桶在内；pi 全零即无读数；第三方 cost 不进入交付；outcome 映射）+ 共享记账套件（缺价格、token-only、allowance、一次性）。S2/S3：smoke `reading-silent`（提示 + 无持久化贡献）、`reading-partial`（确认零桶如实存储与小计）、`reading-allowance`（参考美元独立保存、不进实际消费）。 |
| P18 原生连续活动 | S1：`tests/framework/pi-round-mapping.test.ts`（start 开轮且轮内再 start 不开新轮；pi 低层 run 结束不是关轮；settle 只是候选，只在宿主下一 task 且静止读数成立时关轮；仍忙/仍有排队消息/事实缺失都不关轮；无开轮的 settle 什么也不关；结束后的 start 开新轮）。S2/S3：smoke 四个连续路径（工具、自动重试、压缩、原生排队继续）各自一对公共开闭、最终结算之后关轮、一次保存承载该轮全部请求；`candidate 后一 task 重检`由 S1 用例断言机制，真实宿主侧只可观察到“关轮晚于最后一次结算”。 |

## 5. 未覆盖 / 未执行（如实记录）

- **pi 的压缩摘要调用不在 Turn 轴上**：真实宿主可见 4 次 provider 请求而只交付 2 个 Turn——pi 为其自身压缩发起的
  摘要调用到达 endpoint（capture 计数可见），但未作为 provider-request/请求-响应事实发布给扩展，因此该次调用
  既未被锚价也未被记账。本轮未改这一映射（需要新的权威决定，不在本票承诺内），已在 smoke 的“cannot assert”
  段与本节记录；压缩所在 Round 的边界不受影响，即本票 P18 的断言对象。
- **真实宿主的峰/谷时段未驱动**：pi 的时钟是墙钟，smoke 的每个算例都在其基线周期的假日（全谷）季，只有
  季节边界、峰窗端点、周末与假日的**受控时刻**算例（共享记账套件）覆盖峰价；未做跨时段真实运行。
- **缺价格（monetary tier 无价）与 hidden/token-only 渠道未在真实宿主驱动**：shipped 维护数据把两个官方 id 都定价，
  真实进程无法注入自造数据；这三类由共享记账套件（自造数据、独立输入）覆盖，pi 侧只覆盖“harness 未报价/全零报价
  都是无价”。
- 未运行 TUI 真实终端观感（P52）、真实账户侧读数（P53）、子代理耗时（P24）、season 边界定时重绘与后台保活
  （P19）及取消/终态失败（P21）——分别属其他承诺或其他票；本票不含待补分支或永久跳过测试。
- 仅 Windows x64 + pi 1.2.0 + node v24.18.0；capture endpoint 的读数与余额是该 fixture 自己的文书，不是真实账户事实，
  也未做付费调用。未推断 POSIX、其他版本或其他 provider。
- 全 dock 分区（`bun test tests/harness-dock`，OMP 真实宿主）已运行：**45 pass / 12 fail / 57 例 / 23 文件 / 154.06s**。12 例失败全部是**装配前的基线/宿主补丁供给失败**，与本票改动无关，本票改动也没有触及其任一文件
  （`git diff --name-only 5ad9af7..HEAD` 只列出本票的 11 个实现/测试文件 + 本证据文件）：
  - 11 例为 `host-patches/omp-18.5.0-{viewed-session,codex-response-boundary}/patch.diff touches no file`
    （`tests/harness-dock/host-patch-artifact.ts` 在构造 18.5.0 补丁工件时抛错，失败文件
    `codex-response-artifact`、`combined-host-artifact`、`detail-tree`、`model-cost-codex-quota`、
    `model-cost-modes`、`model-cost-persistence`、`session-driver`、`viewed-marker`、`viewed-session-host`、
    `viewed-session-total`、`viewed-session`）；
  - 1 例为 `baseline.test.ts` 的 `bun.lock` 记录哈希与实际不符（`9e9f4833…` vs `7f5c82e6…`），属基线记录本身与当前锁文件不一致；
  两者都是既有环境/基线条件（本工作树安装的 OMP 为 18.11.1，而记录基线与补丁面向 18.5.0），当前工作树干净（`git status` 无输出）
  证明本票未改动 `bun.lock`、`host-patches/` 或 `harness-baseline.json`。
  与共用 dock 支持直接相关的两个文件（`round-facts.test.ts`、`model-cost-accounting.test.ts`）单独运行 **6 pass / 0 fail**。
  未对上述 12 例做修复：它们属基线供给与其他票的范围，本记录如实标明“失败”而非并入通过。
