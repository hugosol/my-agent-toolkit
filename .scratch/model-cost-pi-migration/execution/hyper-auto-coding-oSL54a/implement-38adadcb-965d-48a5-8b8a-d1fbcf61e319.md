# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "20-assembly-lifecyclemd-41ff96d7-6f87-4949-ae92-",
  "head": "d6d72d4a1f98085f7837dc4d842e468af949ec71",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "20-assembly-lifecycle（P48、P49 完整 Coverage S1/S2/S3 + P57 的 P48/P49 两项）",
  "status": "implemented，已提交，worktree 干净",
  "commits": [
    "127638a 20: 装配的共同准备、根侧效果与会话结束后的迟到读取（P48、P49 的装配线修复）",
    "d6d72d4 20: 记录本票的验证证据与未覆盖项（P48、P49 装配线）"
  ],
  "branch": "hyper/model-cost-pi-migration/20-assembly-lifecycle-dea293-411dc288ea83（起点 1ccc443，未合入 pi-adapter）",
  "delivered": {
    "behavior_fixes": [
      "共同记账准备与根侧效果分离（extensions/model-cost/shared-logic/runtime.ts）：baseline/estimate 的“共同准备”由该实例服务的第一个 delivery 拉起、并发共享一次结果；owner 节点的 framework initialization 只在此之上做根侧效果（两个 provider 预取 + UI）。于是 spawned session 自己的实例（pi 每会话一次求值，同进程或子进程）能在配置/有效基线就绪后记账并保存自己的消费，而不冒充 Owner 触发根侧效果。",
      "根侧 provider 读取只属于开始了自己根侧启动的实例（runtime.ts 的 rootSideStarted 门）：没有读数但从未 initialization 的实例不再因 due(undefined) 去查同一 provider account（修复同进程/子进程重复的根侧读取）。",
      "会话自身结束后的迟到读取（framework/adapters/pi.ts 的 endedSessions + framework/adapters/pi/round.ts 的 sessionOver）：Round 结束候选在下一个 task 复检时，pi 已作废该会话 ctx，过去抛错导致 Round 永不收口、该会话消费永不保存；现在由 adapter 自己观察到的 session_shutdown 回答“已结束 ⇒ 静止、且无东西还能继续它”。framework 的 Round/Owner/initialize/cleanup 公共含义未改，OMP 未改。"
    ],
    "tests_added": "tests/model-cost/pi-assembly-lifecycle.test.ts（10 例，S1/S2/S3 生产装配：真实 definition + 真实 pi adapter + createModelCostRuntime + 真实 observeSessionContext/attachModelCostWidget，前端释放按生产装配组合进 framework 的唯一 cleanup；记录式 boundary timer 与 modelRegistry 替身均有明确契约）",
    "script": "scripts/pi-subagent-smoke.ts：真实前台委派阶段补齐装配寿命断言（父子记录、单次预取、子绑定不绘制、子结束不误清理、退出无残留与退出后不写盘），后台委派阶段改为等待 detached runner 写出的子会话文件并记录其未达事实；并修好了该脚本既有的“每次请求都委派”脚本化缺陷（此前阶段2因永不 settle 而中断）。",
    "docs": "framework/docs/harness-support.md 的 work.next-task-boundary 行补记 pi 侧会话结束后的迟到读取与本票证据"
  },
  "acceptance_evidence": {
    "AC1_实际主子_同独立进程_并发准备_配置基线价格就绪": "hermetic：第一请求等待初始化（两条 provider 请求出站且都未作答）、两次并发 run initiation 共享一对预取、工厂跑完时存储根尚不存在；真实宿主：前台委派下父会话在同一进程站着子会话仍 settle 且累计落盘",
    "AC2_工厂无外部效果_根侧与共同准备分离_不新增租约引用计数资源池": "hermetic：绑定时出站请求 0、存储根不存在、widget 0 帧、边界等待 0、notice 0；spawned session 自己的实例出站请求 0、widget 0、等待 0 却仍记帐落盘；本票只新增一个 memoized promise 与两个布尔，无租约/引用计数/资源池",
    "AC3_退出与适用重载后迟到结果_旧句柄无作用_无残留任务_Idle不误清理": "hermetic：quit 后 widget 清除帧 + 等待登记 1→0、后续交换不绘制不写盘、synchronize()=closed、迟到 provider 回答经重绘不产生帧不写盘；spawned 结束与 idle Round 结束都不清理活实例；真实宿主：进程自行退出（非被 kill）、退出后不再写盘、子结束不处置父实例",
    "AC4_P57项_效果计数与文件前后对照": "网络计数（子实例 0 / owner 恰好一对）、文件字节与 widget 帧前后对照、边界等待登记计数，且每项都有敏感性对照（同一用例的后续真实交换/§5 注入会让对照显示变化）",
    "AC5_组合行为票_装配竞态修复与回归": "发现并修复三处装配线缺陷，各有无故障注入的回归用例（注入 A/B/C 各自只让对应用例失败）",
    "P48_完整Coverage": "hermetic 6 例（工厂无效果、第一请求等待、并发共享、子实例准备且无根侧效果、同实例第二会话不重复、子实例不刷新无读数）+ 真实前台委派 5 项检查",
    "P49_完整Coverage": "hermetic 4 例（owner 处置全释放、spawned/idle 不误清理、会话结束后迟到复检仍落盘、失效 ctx 重绘不抛不绘）+ 真实退出/退出后无写入；适用 reload 的真实路径未驱动（见限制）"
  },
  "verification_run": [
    "bun run typecheck — 无输出",
    "bun test tests/model-cost — 463 pass / 0 fail（40 files，含本票新增 10 例）",
    "bun test tests/framework — 481 pass / 0 fail（38 files，共同契约消费者）",
    "PI_CLI=D:/nvm4w/nodejs/pi.cmd bun scripts/pi-subagent-smoke.ts — 20 observations held，前台委派阶段 11 项全 ok、stale-ctx 诊断为 0；日志 evidence/logs/20-assembly-lifecycle-host.log",
    "故障注入 A/B/C 各自复现对应失败后立即还原并复跑绿（pi-assembly-lifecycle 10 pass）"
  ],
  "unverified": [
    "独立子进程（后台 detached runner）形态：真实主机未取得证据——该 dock 的 runner 在本机不产生模型请求（子会话文件被写出但 artifacts/记录始终缺），未标为通过；同一代码路径由 hermetic 分区覆盖",
    "适用 reload（session_shutdown reason=reload）的真实路径未驱动（RPC 入口未找到可脚本化的 reload 动作），reload 语义由 hermetic 与既有 pi framework 分区覆盖",
    "OMP 真实 dock 回归本 worktree 无法启动（host-patches/omp-18.5.0-viewed-session/patch.diff 被检出为 CRLF 报 patch.diff touches no file，既有环境条件，本票未改该文件）；本票对共享路径的证据是 tests/framework 全绿 + OMP adapter 未改动",
    "tests/connect-bot 的 panel 生命周期分区在本 worktree 因缺少 OMP bot 工件失败 5 例（与本票改动无关，既有环境条件）",
    "spawned session 自己实例的 cleanup 不随其自身会话结束运行（framework cleanup 语义保持 owner-only，本票未改，也未新增按会话释放机制以避免租约/引用计数）；未观察到残留效果，但该形态的长期行为未单独验证",
    "POSIX 未运行（全部真实运行在 win32）"
  ]
}
