# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "03-connect-bot-startupmd-a93bbe1d-2fd9-4ee7-9e2a",
  "head": "263916c74a7d856106ce4cd043fbea7fcd629b41",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "status": "completed_with_environment_limitation",
  "ticket": "03-connect-bot 非阻塞自动登记成功路径",
  "branch": "hyper/extension-startup-modes/03-connect-bot-startup-dd5a69-b21292ab9ce5",
  "commit": "263916c Add connect-bot manual and automatic startup modes",
  "worktree_clean": true,
  "delivered": [
    "新增 entrypoints/omp-auto/connect-bot.ts，保留 entrypoints/omp/connect-bot.ts 为手动入口；两者共用 extensions/connect-bot/harnesses/omp-assembly.ts、同一 definition 与同一登记业务。",
    "framework 新增实现声明 startup 槽与 StartupDelivery；StateStore.reconcile 返回本次首次 owner 启动的有效启动目标，binding 在不等待的情况下把启用意图交给实现；不新增登记完成屏障，也不改变 initialize 等待链。",
    "自动策略在首次主会话启动时复用 PanelRegistrations.activate：无命令触发 register；有效 receipt 前实际 State/marker 保持关闭，成功后写 enabled、发送状态报告、启动 heartbeat；拒绝沿用原反馈，off/owner 结束仍使迟到结果失效。",
    "手动/自动策略文档分别加入 connect-bot enabled:false/true；connect-bot 保持 memory + none，子代理不独立登记，无 UI 拒绝规则不变。",
    "文档更新：connect-bot README 的 Startup modes（加载、启动目标、实际 State、非阻塞登记）、framework capabilities 的 startup 激活槽与两种消费者、framework glossary 的启动策略说明。"
  ],
  "criterion_evidence": {
    "P2 connect-bot 手动入口": "tests/connect-bot/startup-modes.test.ts 手动入口 test + tests/harness-dock/connect-bot-startup.test.ts 手动模式真实 OMP 用例（加载后两轮 prompt、随后 /connect-bot 与 /connect-bot off）均通过。",
    "P3/P33 自动入口无命令触发、静态入口选择": "tests/harness-dock/connect-bot-startup.test.ts 自动模式用例：真实 OMP 通过普通 -e 加载 entrypoints/omp-auto/connect-bot.ts，无命令出现 register；同文件手动入口不产生 register。",
    "P4 两入口显式 true/false 独立预期": "tests/connect-bot/startup-modes.test.ts 分别使用 shipped manual/auto 入口核对 no-register/register；另有自定义 true/false policy 文档驱动同一 assembly 的独立预期。",
    "P15 手动启动不登记": "tests/connect-bot/startup-modes.test.ts 手动模式测试驱动 session start、run 生命周期与 60s 受控时钟，requests/notifications/timers 均为空；dock 手动用例两轮 prompt 后 register 为 0。",
    "P16 命令与自动启用同一协议、成功后 heartbeat/状态/反馈": "S1 自动测试核对 register 与 state envelope、marker、timer，并手动触发 timer 断言 heartbeat 报文；dock 自动测试在成功前 register 被挂起、成功后听见成功反馈并出现 marker；真实面板读侧用例因环境面板版本不兼容未能通过（见限制）。",
    "P17 首个模型请求不等待登记": "tests/harness-dock/connect-bot-startup.test.ts 第一个用例：register 被有意保持未答，session.prompt 仍 completed，独立 capture endpoint 记录到真实模型请求；通过。",
    "P18 成功前 State 关闭、受控顺序": "tests/connect-bot/startup-modes.test.ts latch 用例按未完成→拒绝→有效成功顺序断言 marker/timer/协议效果；未完成和拒绝阶段无 marker/state report，成功后才出现。dock 第一个用例同样先断言无 marker，释放 receipt 后才出现 marker。真实终端 marker 显示仍待用户确认。",
    "P19 失败沿用关闭与反馈": "S1 latch 用例与 dock 自动拒绝用例均观察既有关闭文案、marker 关闭，且后续 prompt 仍 completed。",
    "P22 memory 不恢复旧连接": "tests/framework/implementation-startup.test.ts 断言 memory 字段忽略旧 enabled:true payload，只有 policy 与本次结果参与。",
    "P23 拒绝条件不绕过": "tests/connect-bot/startup-modes.test.ts no-UI 用例捕获既有 stderr 拒绝且无请求/计时器；subagent 用例无请求、无通知、无 marker。",
    "P26 首次自动触发不重复、人工重复不合并": "tests/connect-bot/startup-modes.test.ts：首次 start 后切换新主会话/run/tree 导航，register 仍为 1；随后两次 directed /connect-bot 各登记一次，共 3 次。dock 自动用例第二个 prompt 后 register 仍为 1。"
  },
  "verification": [
    {
      "command": "bun run typecheck",
      "result": "pass: tsc --noEmit + check:authoring (58 files, 3 declarations, 0 diagnostics)"
    },
    {
      "command": "bun test tests/framework/implementation-startup.test.ts tests/codebase-tools",
      "result": "41 pass / 0 fail (10 files)"
    },
    {
      "command": "bun test tests/connect-bot/startup-modes.test.ts tests/framework/implementation-startup.test.ts tests/connect-bot/native-session-boundary.test.ts tests/connect-bot/native-timer-boundary.test.ts",
      "result": "21 pass / 0 fail"
    },
    {
      "command": "bun test tests/connect-bot/*.test.ts (excluding budget-regression, harness-exit-budget, panel-registration-lifecycle)",
      "result": "137 pass / 0 fail (16 files)"
    },
    {
      "command": "bun test tests/connect-bot (all files, HERDR_BOT_BINARY set to E:/Developer/myhub/herdr-bot/backend/target/release/herdr-bot.exe)",
      "result": "142 pass / 7 fail: all 7 fail in pre-existing real-panel files because that sibling build requires a new mandatory [herdr] config section (`missing field herdr`), not because of this ticket's behavior. Without the env var, the same 7 fail because the expected sibling path has no binary."
    },
    {
      "command": "bun test tests/harness-dock/connect-bot-startup.test.ts",
      "result": "3/4 pass: (1) held register + first model request + marker after release, (2) controlled refusal, (3) manual no-register then command arm/disarm. The fourth (actual isolated herdr-bot panel) fails at panel startup with `missing field herdr` from the incompatible sibling build."
    },
    {
      "command": "bun test tests/harness-dock/connect-bot-startup.test.ts -t \"refused startup receipt\"",
      "result": "1 pass after fixing the scripted panel's hold-then-refuse ordering"
    }
  ],
  "human_led_pending": [
    "P18: 实际 OMP 交互终端中成功前无启用 marker、成功后有 marker 的显示，需用户确认。已准备可控场景的自动证据（tests/harness-dock/connect-bot-startup.test.ts 首个用例：挂起 register → 无 marker、首个模型请求已完成 → 释放有效 receipt → marker 出现）以及 S1 latch 用例；真实终端截图/录制尚未由用户确认。",
    "P19: 实际 OMP 终端的失败反馈与关闭显示留给用户确认；自动侧失败反馈与关闭已由 S1/dock 受控用例证明。"
  ],
  "limitations": [
    "真实隔离面板未能完成互操作证据：本机唯一可用的 herdr-bot release 构建比基线新，要求配置包含 [herdr] 段；仓库冻结的 panel 测试辅助器生成旧配置，启动即报 `missing field herdr`。未修改共享 panel 测试设施以避免改变基线测试语义。",
    "因此 P16 的“真实隔离面板记录”以及 P18 的真实面板读侧确认仍未取得；P18 的受控顺序、State 关闭、非阻塞首个请求等自动证据已取得。",
    "未运行完整仓库 bun run test；本次按 ticket 范围运行了 typecheck、框架/消费者相关套件及新增 dock 场景。"
  ],
  "notes": [
    "未修改其他票据文件、未操作集成分支、未合入 dev。",
    "新增 tests/harness-dock/connect-bot-startup.test.ts 的真实面板用例在当前环境为红，原因是上述外部面板版本不兼容；其余三个用例通过。"
  ]
}
