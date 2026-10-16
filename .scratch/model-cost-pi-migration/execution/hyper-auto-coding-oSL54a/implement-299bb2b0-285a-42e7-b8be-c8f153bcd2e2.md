# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "03-request-pricing-roundsmd-1b0ee18e-05e1-48be-9",
  "head": "f4e4d8f9ba72be2e08e0e14a4a78d70dc47cab7f",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

"**票据 03（P7 / P9 / P18）交付完成，worktree 干净已交出。**\n\n提交：`388f9dd`（实现）、`3987b68` + `f4e4d8f`（证据）。分支 `hyper/model-cost-pi-migration/03-request-pricing-rounds-eca602-411dc288ea83`，起点 `5ad9af7`。未动集成分支工作区、未合入、未 reset、未改其他票或工作流报告、未调用 retro。\n\n## 交付的行为\n\n1. **真实宿主暴露的缺陷已修复（本票最重要发现）**：pi 在 context 未知时（压缩之后、下一次响应建立读数之前）发布 `tokens: null`；pi 前端把它当数字传给 token 格式化器，使 widget 重绘抛错，而该重绘运行在记账的变更通知**之内**，于是 `turn_end`/`round_end` 订阅者一并失败、该会话消费**从不落盘**。修复：`framework/adapters/pi.ts` 如实声明 `tokens: number | null`；`extensions/model-cost/harnesses/pi/widget.ts` 把 null 当“无读数”。修复前真实运行有 2 条 `handler failed`，修复后整轮 smoke 0 条；回归守卫 `tests/model-cost/pi-widget-reading.test.ts`（先红后绿，红即真实栈）。\n2. pi 映射的新套件（S1）：`tests/framework/pi-turn-mapping.test.ts`、`pi-round-mapping.test.ts`、`support/pi-surface-double.ts`。\n3. pi 真实宿主新阶段（S2/S3）+ 探针入口 `fixtures/pi-round-facts/`；dock 支持加法（多 `-e`、多模型、per-request 失败/延后作答）；顺带修复 smoke `filesUnder` 的锁目录竞态。\n\n## 逐条验收与证据\n\n- **P7 锚价**：S1 —— 请求自身 provider/model/时刻两端一致、改模型与事后目录价变化只影响后续请求、未报价与全零报价皆非价；S2/S3 —— smoke `request-anchor`：两模型手算 `0.00003506` / `0.00012645` CNY，pi 自身 777/888/999/1111 USD 价与手算不同且从未被采用；峰/谷/周末/假日边界由共享记账套件的受控时刻独立字面量覆盖。\n- **P9 读数与口径**：S1 —— 上报读数（含零桶）原样交付、pi 全零即无读数、`usage.cost` 不进入交付、outcome 映射；S2/S3 —— `reading-silent`（无 usage → 提示“跳过不等于免费”、无持久化贡献）、`reading-partial`（`output 0` 如实存储、金额 `0.00000706`）、`reading-allowance`（`referenceCostUsd 0.0001269`、无 `costCny`）。\n- **P18 连续活动**：S1 —— 低层 run 结束不关轮、settle 只是候选且只在宿主下一 task 且静止成立时关轮、仍忙/仍有排队/事实缺失皆不关轮、无开轮的 settle 不关任何轮、结束后 start 开新轮；S2/S3 —— 工具、自动重试、压缩、原生排队继续各一对公共开闭、关轮晚于最后一次结算、一次保存承载该轮全部请求（`saveVersion 1`）。后台保活归 09、取消/终态归 10，无待补分支或永久跳过测试。\n\n## 实际运行的验证\n\n`bun run typecheck` exit 0；`bun test tests/framework tests/model-cost` **756 pass / 0 fail**（+25 例）；`bun test tests/codebase-tools` 24 pass；`round-facts.test.ts` + `model-cost-accounting.test.ts` 6 pass；`bun scripts/pi-model-cost-smoke.ts` **44 checks / 0 fail**（pi 1.2.0、node v24.18.0、bun 1.4.2，18.35s，同源再跑同结果）；故障注入分别命中 1 例与 8 例失败，还原后 22/22 green。全部逐例数值、命令、来源/环境在 `.scratch/model-cost-pi-migration/evidence/03-request-pricing-rounds.md`。\n\n## 未完成 / 未验证（如实记录）\n\n整分区 `bun test tests/harness-dock` 为 **45 pass / 12 fail**：12 例全部是**装配前的基线/宿主补丁供给失败**（11 例 `host-patches/omp-18.5.0-*/patch.diff touches no file`，1 例 `baseline.test.ts` 的 `bun.lock` 记录哈希不符），本票 diff 未触及其中任何文件（`git diff --name-only 5ad9af7..HEAD` 仅本票 12 文件），属既有环境/基线条件，未修复也未并入通过。另外：**pi 的压缩摘要调用不在 Turn 轴上**（真实看到 4 次 provider 请求、仅交付 2 个 Turn，该次调用未被锚价/记账——需新权威决定，未静默改映射）；真实峰价时段（墙钟不可控）、缺价格与 hidden/token-only 渠道（无法向真实进程注入自造数据）仅由共享记账套件覆盖；TUI 观感（P52）、真实账户（P53）、耗时（P24）、后台保活（P19）、取消/终态（P21）不在本票；证据限 Windows x64 + pi 1.2.0。"
