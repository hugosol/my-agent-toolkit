# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "11-subagent-runtimemd-223f37b8-9369-45b6-a46e-ab",
  "head": "fea87c78e59d8480d88194b8d4d6895ffa9af2a4",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "11-subagent-runtime（累计活动耗时与旧值兼容；P24、P25、P27）",
  "status": "implemented + committed（本 worktree 可交接）",
  "commit": "fea87c7 11: 子代理活动耗时改由公共 Round 区间累计，旧 runtimeMs 与缺口标记保留（P24、P25、P27）",
  "delivered_behavior": {
    "metric": "子代理 session 的累计耗时改为已批准的粗粒度活动估算：一个子代理 Round 就是一次活动，Round 两个边之间的区间在 Round 结束时结算，因此模型工作、工具与活动中的委派等待都在内，不同活动间的 Idle 天然排除；不采第三方/OMP 自报 duration，不新增 execution 时间轴，运行中不刷新。",
    "accumulation": "extensions/model-cost/shared-logic/subagent-runtime.ts 只吃活动边（开始/结束时刻 + 观察者时钟），seed 自记录里的 runtimeMs 与 runtimeGap；仅结算已结束活动；缺失结束不补离线时间；同周期多次活动累加；周期替换后旧活动不再计入新周期。",
    "commit_rule": "request-accounting 的 Round 结束提交条件从「仅消费增长」改为「消费或耗时任一增长」，因此仅耗时增长也能落盘；记录新增可选 runtimeGap: true（已知缺口标记，后续成功不清除，缺字段不判损坏也不代表历史完整）；旧 runtimeMs 原值保留并继续累加。",
    "common_path": "两端同一路径：OMP 与 pi 适配器只报各自 run-cycle 事实（Round 轴），估算完全在 model-cost shared-logic；旧生产路径已删除，不保留别名/shim：framework 的 subagent_runtime 轴（protocol 类型与 HarnessPort.onSubagentRuntime）、behaviors/binding、subscriptions、public.ts 导出、framework/adapters/omp/subagents.ts（整文件）、OMP 的 task 载荷与子代理帧 duration 映射、pi 的 execution-duration 缺事实拒绝、tests/framework/subagent-runtime.test.ts；文档（framework/docs/framework-capabilities.md、harness-support.md 的 execution.subagent-duration 行）与 scripts/efficiency-baseline.ts 同步迁移。"
  },
  "criteria_coverage": {
    "AC1 / P24（受控区间算例 + 真实宿主活动；不采第三方或旧 OMP 最终 duration）": "tests/model-cost/subagent-runtime.test.ts：两次活动 [T,T+30s]、[T+90s,T+120s] → 60000（不是 120000 的墙钟跨度，也不是最后一次的 30000）；一次活动内 10s 处的请求、60s 处的 Round 结束 → 60000（不是该请求自身延迟）；主会话自己的 Round 不计耗时（记录无 runtimeMs，view 为 undefined）；测量的零与「未知」分开（0 落盘、未观察为 absent）；时钟不可读 → 报错 + 保留小计 + 标记缺口，后续成功不清除标记；不存在的旧 duration 供给面（编译期：轴与适配器映射已删除，测试 double 不再提供 deliverSubagentRuntime）。真实宿主：tests/harness-dock/model-cost-persistence.test.ts（真实 OMP 18.5.0 隔离工件 + 真实 task 委派，4 pass）、tests/harness-dock/detail-tree.test.ts（3 pass）——真实委派下每个子会话记录带正的 runtimeMs（其自身 Round 区间），主会话记录无。",
    "AC2 / P25（同周期多次累计、仅耗时增长也提交、新进程恢复、不只显示最后一次）": "tests/model-cost/subagent-runtime.test.ts：「仅耗时增长」用例（子会话零消费、活动 45000 → saveVersion 2 携带 runtimeMs=45000、own 不变；再 +30000 → 75000；同 root 新实例恢复 75000 并续到 90000）；运行中未结算的活动不写盘、不被后续恢复当作已计；「Total 与行」用例断言图不是最后一次活动。assembled-consumption（P9 组合）与 detail-widget（行绘制、测量零）用例同步迁移后通过。",
    "AC3 / P27（独立旧文档：缺值、合法零、已有 runtimeMs、合法新缺口信息；不判损坏、不一律标不完整、不凭缺字段证明完整）": "tests/model-cost/subagent-runtime.test.ts 的 old-document 用例：手写文档含 missing / runtimeMs:0 / runtimeMs:480000+runtimeGap:true 四类记录，读入不暂停、各值原样被 view 读出；活动 +20000 更新 → 500000 且 runtimeGap 保留，缺失记录的字段原样、零仍是零、无标记不被推断为有标记；新实例恢复 500000。非法可选值（runtimeMs:\"8 minutes\"、runtimeGap:\"yes\"）只丢该字段并按时间/耗时无效报错（runtimeMs / runtimeGap 各一条），消费本身仍严格（own 缺失仍整份拒绝）。",
    "AC4（不新增 execution 时间轴/持续刷新/执行器精确时间要求；不丢弃已有标记）": "已删除 execution 轴与运行中读数路径（见 common_path）；无运行中刷新（open 活动不贡献，仅 Round 结束结算）；不给执行器加精确时间要求（只用已有的 run-cycle 事实 + 观察者时钟）；已有 runtimeGap 标记在 seed→写回路径中保留（见 P27 用例）。16 负责的「缺口不被成功覆盖的完整场景」未越界实现，只实现标记的持久化兼容与不做清除。"
  },
  "verification_actually_run": [
    {
      "command": "bun run typecheck",
      "result": "exit 0（clean）"
    },
    {
      "command": "bun test tests/model-cost tests/framework",
      "result": "843 pass / 0 fail（68 files，46.1s；model-cost 分区 + framework 分区，含迁移后的 assembled-consumption / detail-widget / period-switch / pi-session-accounting / session-recovery / session-ownership-tree）"
    },
    {
      "command": "bun test tests/harness-dock/model-cost-persistence.test.ts",
      "result": "4 pass / 0 fail（36.1s，真实 OMP 隔离工件 + 真实 task 委派）"
    },
    {
      "command": "bun test tests/harness-dock/detail-tree.test.ts",
      "result": "3 pass / 0 fail（28.5s，真实宿主 + 冻结 Viewed 补丁；子会话行 runtimeMs 与新进程读回）"
    }
  ],
  "unverified_or_open": [
    "pi 真实宿主：本票未跑任何 pi 真实宿主 dock（本 worktree 内没有使用 tests/harness-dock/pi-session.ts 的 dock 套件可跑），因此「后台子会话在自己进程里累计」只有单元/公共接缝证据（tests/model-cost/pi-session-accounting.test.ts 通过 pi 适配器公共面驱动，runtimeMs 只断言为数字），没有真实 pi 运行证据。",
    "本票未跑的其它真实宿主路径：OMP 后台/独立进程子会话、取消/失败活动、以及「周期替换时有活动跨边界」的真实宿主形态（周期边界只有控制用例：tests/model-cost/period-switch.test.ts）。",
    "scripts/efficiency-baseline.ts 已随公共路径迁移（删除 declareRuntime、第三个序列改为用自身时钟给出子代理 Round 区间、对应不变量改写），但本票未执行该入口；evidence/01-efficiency-baseline.json 是变更前记录，P51/22 需要重录对照。",
    "环境备注（影响 dock 复现）：本 worktree 的 checkout 因 core.autocrlf=true 把 host-patches/*/patch.diff 落成 CRLF，导致 tests/harness-dock/host-patch-artifact.ts 的 patchTouchedFiles 解析不到文件而整套 dock 无法启动；我以 git -c core.autocrlf=false 重新物化这三个 patch.diff 为 LF（索引内容本就是 LF，git status 显示未修改）后 dock 才可运行。新 worktree 复现 dock 前需要同样处理。",
    "「结束但从未观察到的开始」（activityEnded 无 open 活动）这一防御分支在 framework 的 Round 合成下不可达（它从不投递没有开边的 round_end），只有单一会话快照被拒后丢弃 ledger 的路径可能触发；本票未为它写用例，也没有把它作为已知缺口的生产来源。"
  ]
}
