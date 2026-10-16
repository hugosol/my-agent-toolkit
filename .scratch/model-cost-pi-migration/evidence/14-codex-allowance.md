# 14 Codex 双窗口与独立比例估计：本轮真实验证记录

本文件只存证据与限制；交付内容与验收归属见 [本票](implementation/14-codex-allowance.md)、[契约](../contract.md)与 [spec](../spec.md)。未执行正式安装/切换、未清理用户数据、未做付费调用。

## 1. 固定来源与环境

- pi：本机已安装的 `@earendil-works/pi-coding-agent@1.2.0`，驱动工件为
  `D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`（经 `pi.cmd` shim 解析），
  子进程以 `node`（v24.18.0）运行。`pi --version` 报告 `1.2.0`。
- 工作树：`hyper/model-cost-pi-migration/14-codex-allowance-0c0541-411dc288ea83`，起点为集成分支
  `pi-adapter` 的 `2ea7fee`（已含 01/02/04 三票）。运行时 bun 1.4.2；依赖经 `bun install --frozen-lockfile`
  装入（typescript 7.0.2 等 4 个包）。
- 宿主补丁条件：本票不涉及 OMP 宿主补丁，未改动 `host-patches/`、`framework/docs/harness-baseline.json` 或
  `bun.lock`；pi 侧运行不使用任何宿主补丁。
- 隔离：每次运行一个临时 run root（agent state、session dir、work dir、capture dir）与临时 user home；
  pi 显式 `--mode rpc --no-extensions -e <单入口> --no-mcp`；Codex 的 run 把 `models.json` 的
  `openai-codex` provider 指向本机 capture endpoint，并把登录凭据声明在 run 自己的 `auth.json` 里
  （一条 OAuth 记录，access token 为本脚本字面量）；`PI_OFFLINE/PI_SKIP_VERSION_CHECK/PI_TELEMETRY` 固定。
  默认 agent state、正式配置、机器上的真实凭据与运行中的 agent 均未被触碰。

## 2. 交付内容（实现）

本票复用既有公共业务，未改动任何生产代码（`git diff extensions/ framework/ entrypoints/` 为空）；实现落在
验证与装配支撑：

- 新增 `tests/harness-dock/fixtures/pi-codex-quota/entrypoint.ts`：以生产的 definition 与 `createModelCostRuntime`
  经 framework 的 pi adapter 绑定，只替换账户 API 那一次查询的 transport（按 run 的脚本目录应答并记录每次调用），
  并把 `presentation.quota()` / `presentation.estimate()` 逐次写 stderr。
- `tests/harness-dock/pi-session.ts`：新增 `writePiCredentials`（把 pi 自己的登录凭据写进该 run 的 `auth.json`）。
  这一版是真实宿主事实：pi 的 Codex provider 从其自身凭据存储解析 access token（`models.json` 的 `apiKey` 对它不生效），
  由本票的临时探针在本机 1.2.0 上核对过（`resolve("openai-codex")` 无 `auth.json` 时无 credential，有则返回该 token）。
- `scripts/pi-model-cost-smoke.ts`：新增第 5 个 phase（Codex 额度窗口与比例估计），并顺手让 `filesUnder`
  容忍写入方锁目录在遍历中消失（该 race 在改动前的本轮基线运行上即已复现，属既有缺陷）。

## 3. 命令与结果（本工作树，源码与 fixture 在运行期间未改动）

| 命令 | 结果 |
|---|---|
| `bun run typecheck` | exit 0（无输出） |
| `bun test tests/model-cost` | 377 pass / 0 fail，1927 expect，28 files，6.96s |
| `bun test tests/framework` | 378 pass / 0 fail，1837 expect，31 files，37.85s |
| `bun test tests/harness-dock` | 45 pass / 12 fail，57 tests / 23 files，173.60s |
| `bun scripts/pi-model-cost-smoke.ts`（真实 pi 1.2.0） | exit 0：**43 checks passed, none failed**，11 isolated run，~10s；连续 4 次同结果 |

`tests/harness-dock` 的 12 条失败与本票无关，且全部同类：本 worktree 以 **CRLF** 检出，而 dock 宿主补丁物化器与
lockfile 校验按 LF 写死（`host-patches/omp-18.5.0-viewed-session/patch.diff touches no file` ×8、
`omp-18.5.0-codex-response-boundary/patch.diff touches no file` ×2、baseline lockfile/artifact 检查 2 条）。
本票改动只涉及 `pi-session.ts` 的新增导出与新增 fixture，二者都不被该分区任何测试加载（`host-patches/`、`bun.lock`、
物化器均未改动），与该失败类无因果关系；同一环境事实在 04 的证据中已记录为 45 pass / 12 fail。该分区在本 worktree
因此**不能**作为 OMP 真实宿主证据使用，本票也不依赖它。

### 3.1 真实 pi 宿主 phase 5 的检查（43 条中属于本票的 18 条）

四个 run 共用同一个隔离 user home（即同一个存储根，由 shipped 配置的 `~/cost-archive` 解析而来）：

1. `the loaded extension asked the account API once while it initialized` — 启动时恰好一次账户查询。
2. `the account query used the business address, budget and named proxy selection` — 记录到的调用为
   `GET https://chatgpt.com/backend-api/wham/usage`、`timeoutMs: 10000`、`proxy: "codex"`。
3. `the query authenticated with the credential pi resolved, and the account that credential names` —
   请求头 `Authorization: Bearer <本脚本声明的 token>` 与 `chatgpt-account-id: acct-dock-14`（取自该 token 的 claim）。
4. `the windows are identified by the length each report stated, not by the position that carried them` —
   同一报告中 7 天窗口在 `primary_window`、5 小时窗口在 `secondary_window`，读数分别落到 weekly=40、five-hour=10。
5. `one reported reset is expired and the other invalid, each read at this moment and never rewritten` —
   5 小时窗口的 reset 落后 60s 读作 `expired`，weekly 的 +8 天读作 `invalid`，报告的瞬时值原样保留。
6. `the first paired report published the baseline into its own document before any Turn` —
   在任何 Turn 之前，存储根内出现 `codex-usage-estimate.json`，`ratio: null`，baseline 为 10/40。
7. `a settled Codex Turn asked the account API again once the success TTL had passed` — TTL=1ms 时，一次已结算的
   Codex Turn 后账户查询数变为 2（第 2 次与第 1 次相隔 55ms，见 calls.jsonl 记录）。
8. `the answer that carried one window updated that one alone, and the other kept its reading and instant` —
   只带 5 小时窗口（无 reset）的应答把 five-hour 更新为 60/`unknown`，weekly 的读数、reset 与 `obtainedAt` 逐字不变。
9. `a report that carried one window is no pair, so nothing was measured and nothing was written` —
   估计仍无 ratio，估计文档字节与第 6 条之后完全相同。
10. `one report's own pair refined the ratio from the baseline that report followed` — 第二次 Turn 的成对读数
    50/15 得到 ratio = 3.3333…（相对 baseline 10/40 的增量）。
11. `the refinement stayed out of the document inside the minute that followed the baseline's own write` —
    内存里 ratio 已更新，而文档 `ratio` 仍为 `null`、字节未变（既定限频生效）。
12. `a failed account attempt is a failure beside no window, never a window at zero` — 403 应答后读数为
    `{failure:{detail:"unreadable"}}`，两个窗口都缺席（不是 0）。
13. `a failed attempt earned no success TTL, so that Turn asked again despite the run's ten-minute TTL` —
    该 run 的成功 TTL 为 10 分钟，失败后已结算 Turn 仍发起第 2 次查询。
14. `the answer that followed seeded both windows, and its pair qualified nothing against the stored baseline` —
    两窗口被同一报告填充（20/4），未达阈值 → 内存无 ratio，文档字节不变。
15. `a fresh reading kept the next settled Turn from asking again` — 成功读数后，下一次已结算 Turn 未造成新查询
    （仍为 2 次；TTL 门限在真实宿主上生效）。
16. `a new process continued the measurement the document carries instead of re-anchoring on its first report` —
    第三个进程的启动应答本身就是一对 60/55：文档最终为 `baseline.capturedAt` = 第一个进程写入的瞬时、
    baseline 百分比仍为 10/40、`ratio: 3.3333`；若按自身首个报告重锚，baseline 会变成 60/55 且不会有 ratio。
17. `the period reset archived the saved consumption and opened a non-holiday period` — DeepSeek 入口在同一存储根
    执行 `/budget clear`：`archives/` 出现 1 个归档、`consumption.json` 的 periodId/start 变更、holiday=false。
18. `the reset left the independent Codex estimate exactly as it was` — 清周期前后 `codex-usage-estimate.json` 字节完全相同。

保留样本（`--keep` 一次运行）核对到的产物：
`codex-usage-estimate.json` = `{"baseline":{"capturedAt":"2026-10-16T14:40:45.503+08:00","fiveHour":{"usedPercent":10,"resetsAt":"2026-10-16T14:39:45.000+08:00"},"weekly":{"usedPercent":40,"resetsAt":"2026-10-24T14:40:45.000+08:00"}},"ratio":3.3333}`；
`archives/fa6f17fc-…json`（1276 字节，整份旧周期）；第一个 run 的 `calls.jsonl` 3 条（初始化 1 + 两次已结算 Turn），
第二个 run 2 条，每条地址/预算/proxy/两个请求头一致。
重置后的新周期文档为 `{"periodId":"d400244a-…","start":"2026-10-16T06:40:47.174Z","start_bal":110,"holiday":false,"harnesses":{}}`，
而被归档的旧周期仍带着 codex run 的会话记录（`periodId":"period-fresh"`，含 `openai-codex/gpt-6-luna` 的 startup 快照与用量），
说明重置归档的是整份已保存文档、新周期从零开始，且两者都不含本估计文档。

### 3.2 确定性检查（`tests/model-cost`，本票核对有效并补一处缺口）

- `tests/model-cost/codex-quota.test.ts`（16 tests）：位置互换、单窗口、缺失读数不复零不重定时、失败（no-access/
  misconfigured/unreadable/unreachable）、失败不赚 TTL、查询合并、凭据声明的账户头、两个同长度候选、
  reset 的 unknown/expired/invalid/valid 与「状态不写回读数」——覆盖 P30 的独立报告清单。
- `tests/model-cost/codex-estimate.test.ts`（手算数字）：50 点阈值与 10.0 比例、饱和与不达阈值不替换、
  单窗口配对不成立、跨窗口重锚、5 小时老化边界、baseline 即时发布、一分钟限频、按 capture 瞬时合并
  （较新文档被采纳/较旧被取代/相等留给写入方）、新实例续用文档 —— 覆盖 P31 的数字清单。
- `tests/model-cost/period-switch.test.ts`：重置归档、发布新周期，且独立估计文件原样保留。
- **本票新增**：`codex-quota.test.ts` 的
  `a position whose report carries no usable reading or length is left out rather than completed`
  （缺 `used_percent` 与缺 `limit_window_seconds` 两种位置都不得被补成 0，也不得移动 `obtainedAt`）。
  验证该用例确实能发现违规：临时把 `windowsOf` 改成 `numberOf(window.usedPercent) ?? 0` 后该用例失败
  （received `usedPercent: 0`、`obtainedAt` 被推移），恢复后全文件 16 pass / 0 fail。

## 4. 未覆盖 / 未验收

- **真实账户侧读数**（P53，票 24）：本票全部账户应答都是 fixture 自己写的文档，未接触真实 ChatGPT 账号，也未做任何
  网络请求或付费调用；真实凭据/许可不可得，属明确阻塞项，不标为通过。
- **POSIX / 其他 pi 版本 / 其他平台**：只在 Windows x64 + pi 1.2.0 上运行，不外推。
- **TUI 真实终端观感**（P52）与效率/复杂度终判（P51）仍留给人类验收。
- **真实 OMP 宿主分区**：本 worktree 的 CRLF 环境使宿主补丁物化失败（见 §3），本次未取得 OMP 宿主读数；该分区不由
  本票承诺覆盖（本票为 pi 侧），但读者不应把 §3 的 45/12 当作 OMP 回归结论。
- 启动时的一次账户查询与结算触发的查询都由本 phase 的 TTL 设置与脚本应答驱动；真实 TTL=15000ms 的时长边界仍由
  `tests/model-cost/codex-quota.test.ts` 的受控时钟覆盖，未在宿主上等待真实时长。
