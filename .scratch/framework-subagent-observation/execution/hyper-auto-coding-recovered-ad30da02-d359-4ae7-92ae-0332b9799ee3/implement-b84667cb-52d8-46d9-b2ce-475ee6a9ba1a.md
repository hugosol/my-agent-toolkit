# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "06-follow-observation-independencemd-1ad68365-f3",
  "head": "f0e0d8c3b572b4a46d744e9fa17616e1ea373cb2",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "06-follow-observation-independence（P21、P22、P23）",
  "status": "complete",
  "commit": "f0e0d8c（分支 hyper/framework-subagent-observation/06-follow-observation-independen-ed2819-e98ea402077c，基于 hyper-tdd 的 e50c574）",
  "delivered": {
    "behavior": "P21（follow 在两种进程模式取得 Owner 当前权威值）在执行 checklist 时暴露一处进程模式不一致并已修复：进程内被跟随的读取走 framework/modules/local-access.ts 的 openOwnerAccess → directCaller，而 directCaller 的 ended() 只在自身 dispose() 时置位，于是 Owner 生命结束（cell 退休、offer 撤回）或同一 owner 被重新进入（#offerAccess 换出新 source）后，该 access 继续回答旧生命的值——即另一种形态的永久快照；跨进程路径不受影响（seat 两个半边在边界处释放后 #releaseIfEmpty 销毁连接，远端调用方据连接关闭失效并重连）。修复（framework/modules/local-access.ts，3 处，共 10+/3-）：directCaller(target, seat, source) 增加 target 参数，ended() 扩为 `ended || processSeats()?.get(seatKey(target))?.values !== source`，调用点传 options.target。修复后两种模式含义一致：退休 seat 只答声明默认值，重新进入后的读取取得新生命当前值。P21–P23 其余语义由既有实现承载（state.ts 的 followed/view、followed-owners.ts 读取半边、binding.ts 的 owner seat 接收、observations.ts 进程观察源），未新增 State 权威、公开接口、协议帧或来源存储；brief/detail 与观察互不影响的既有实现（display-preference 逐 entry 内存偏好 + 框架进程观察源按需读取）经验证成立。",
    "new_tests": [
      "tests/framework/follow-observation-independence.test.ts（4 例：P21 进程内直读与 true→false→true 语义读取；P21 access 随 Owner 生命耗尽且新生命数值可读；P23 无 follow 字段的真实进程登记+更新；P22 远端读数采纳不写 Owner 值）",
      "tests/model-cost/form-observation-independence.test.ts（1 例：P23 brief 期间采集、切 detail 显示最新读数、重复切换不重复来源/不停止采集/不重建接入）"
    ]
  },
  "criteria": [
    {
      "criterion": "两种进程模式分别验证初始读取及 Owner 值 true→false 后的后续语义读取；跨进程实际取得 false，不把不可达默认值计为成功读取",
      "evidence": "同进程：新用例 1（首读默认未达 → 到达后 true + marker 行；Owner 写 false 后注入 prompt 与 marker 区同为 false；写回 true 又为 true；读取指向不存在的配置文件，排除定位/端点路径）＋新用例 2（生命结束→声明默认；以 false 重新进入→不携带旧值；新生命写 true/false 即读得 true/false）；owner-follow.test.ts 的 cell 直读 true→false（seat.opens 为空）。跨进程：owner-follow-processes.test.ts『the follower reads what the serving process holds, then follows its change』真两进程 true→false→true，marker 行为独立证据；owner-follow.test.ts『an owner that cannot be reached…』钉住默认值不算成功读取。"
    },
    {
      "criterion": "一次语义处理内相关读取使用所取得的一致快照，不要求每个 getter 分别通信；同进程直接读取，跨进程复用 framework Local access",
      "evidence": "新用例 1：同一 handling 内注入 prompt 与 marker 区同时为开/关；owner-follow.test.ts『reads before the access is reached answer the default, and one attempt is shared』（三次 getter → seat.opens 长度 1）；新用例 1 的读取在配置不存在时仍读得真值＝进程内 seat 直读；local-access.test.ts『reading in the process that serves the seat opens nothing…』；跨进程复用见 owner-follow-processes.test.ts 与 local-access-observation.test.ts（真 record/端点）。"
    },
    {
      "criterion": "读取及观察更新后 Owner 的独立给定值不被修改；错误方向、未声明操作及远端 State 写入被拒绝",
      "evidence": "新用例 1 读后与写入后 serving.view(OWNER).read(FIELD) 仍为 Owner 自己的值；新用例 3（采纳远端读数后 Owner 值仍为 boundary 给定 true、marker 区无新增渲染、无诊断）；无 follow 真实进程用例同样断言 Owner 值不变；owner-follow.test.ts『a widened observation grants no write or effect authority』；local-access.test.ts『the endpoint serves its own seat and refuses a frame for any other』（真实进程 {t:\"write\"} 帧被 refused、服务进程值不变）；local-access-observation.test.ts 的『receives no observations refuses one』『a reading that names another owner is refused』。"
    },
    {
      "criterion": "无 follow 字段扩展在实际进程中仍可完成登记与更新，观察启用不依赖 follow 字段存在",
      "evidence": "新用例 3：state 只声明字段（继承默认 none），真实子进程经真 location record/端点两次 deliver，本进程观察源先后读得 tokens 4242→8888，且该 seat 无 values 半边（localOwnerAccess undefined）；model-cost 用例断言 stateInheritance(MODEL_COST) === \"none\" 且真实进程读数进入该扩展观察源并画入 detail；local-access.test.ts『the pi assembly offers an owner's values only for a follow field, and its observation seat wherever it spawns』。"
    },
    {
      "criterion": "brief 期间更新后切 detail，实际表面显示最新读数；重复切换不重复来源、不停止采集、不重建观察连接",
      "evidence": "model-cost 新用例：brief（默认）期间交付 45,000 tokens 读数→已采集而不画树；/budget detail 后真前端行含 Ctx: 10% (45,000/450.0K)；detail 期间再交付 90,000，两次切换后行含 Ctx: 20% (90,000/450.0K)；再交付 120,000 仍被采集，两次切换后行含 Ctx: 27% (120.0K/450.0K)；会话行恒 1 行；交付进程报告 reached: true、ended: false、3 条读数均经同一接入送达。"
    },
    {
      "criterion": "覆盖 State 消费者、真实进程读取与实际展示切换，执行所属分区 + typecheck，记录证据与未验证限制",
      "evidence": "见 verification 与 unverified；证据文件 .scratch/framework-subagent-observation/implementation/evidence/06-follow-observation-independence-evidence-2026-10-17.md 及 logs/06-*.log。"
    }
  ],
  "verification": [
    {
      "command": "bun run typecheck",
      "result": "exit 0",
      "log": "evidence/logs/06-typecheck.log"
    },
    {
      "command": "bun test tests/framework",
      "result": "559 pass / 0 fail（47 文件，2504 expect）exit 0",
      "log": "evidence/logs/06-partition-framework.log"
    },
    {
      "command": "bun test tests/model-cost",
      "result": "479 pass / 0 fail（45 文件，2630 expect）exit 0",
      "log": "evidence/logs/06-partition-model-cost.log"
    },
    {
      "command": "bun test tests/framework/owner-follow.test.ts tests/framework/owner-follow-processes.test.ts tests/framework/session-observation-access.test.ts",
      "result": "22 pass / 0 fail（110 expect）exit 0",
      "log": "evidence/logs/06-follow-suites.log"
    },
    {
      "command": "bun test tests/framework/follow-observation-independence.test.ts tests/model-cost/form-observation-independence.test.ts",
      "result": "5 pass / 0 fail（55 expect）exit 0（提交后在提交内容上复跑）"
    }
  ],
  "mutations": [
    "followed-owners.#open 丢弃 caller.observe（退回启动快照）→ 新用例 1 捕获；还原后绿。",
    "OwnerAccessHost.receive 只在有 values 半边时接收 → 无 follow 真实进程用例与 model-cost 展示用例同时捕获；还原后绿。",
    "directCaller 的 ended 改成 () => true → 新用例 1 与 owner-follow.test.ts 的 pi assembly 同进程用例捕获；还原后绿。",
    "修复自身的红：修复前新用例 2 失败于『Owner 生命结束后仍读得退休值 true』。"
  ],
  "unverified": [
    "未跑真机 pi CLI 与 OMP 真机：S3 证据为生产前端（attachModelCostWidget）经真实 framework 本机接入 + 真实子进程读数；真宿主/版本证据属票据 12（P34/P35）。未跑 scripts/pi-subagent-smoke.ts 与 tests/harness-dock（dock 需 materialise patched host，共享工作树内代价过高）。",
    "未跑 POSIX 载体；未验证 pi 1.3.0 之外版本；未跑 tests/harness-dock、tests/codebase-tools、tests/connect-bot 分区。",
    "『seat 两个半边都持有时（真实 pi 主进程）连接也在 Owner 边界被销毁』为代码推断（#withdrawValues/#withdrawReadings → #releaseIfEmpty → socket.destroy()），未构造同时持有两个半边的 serving 子进程用例。",
    "新用例 1 的『不看定位/不开端点』由“配置不存在仍读得真值”推出，未对端点创建计数。"
  ],
  "merge_note_for_integration": "framework/modules/local-access.ts 的 directCaller 与票据 05 的同函数改动重叠（两票不同 worktree 各自改同一函数）。整合时：取本票的 directCaller(target, seat, source) 签名、ended: () => ended || processSeats()?.get(seatKey(target))?.values !== source 与调用点 directCaller(options.target, local, local.values)；保留票据 05 在 deliver 内的 const asSource = nextSource(); 与 seat.readings?.adopt(asSource, reading)。票据 05 的 ObservationSource/SessionObservationSink（protocol.ts、OwnerAccessPublisher.receive、ProcessSeat.readings、#accepted 的 lost(source)）不可退回裸函数 sink，否则无法通过类型检查。",
  "notes": "本票未改其他票据文件或工作流报告；未操作集成分支工作区；未合入集成分支；无 reset。"
}
