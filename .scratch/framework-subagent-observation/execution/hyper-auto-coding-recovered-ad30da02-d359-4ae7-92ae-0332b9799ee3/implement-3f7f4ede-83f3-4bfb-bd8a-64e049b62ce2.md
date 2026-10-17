# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "05-reconnect-source-lifecyclemd-53508336-6477-43",
  "head": "874a00c860347545003cf547f7ac2096f6a3d857",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "05-reconnect-source-lifecycle (P5, P6, P7, P8)",
  "branch": "hyper/framework-subagent-observation/05-reconnect-source-lifecycle-b03b39-e98ea402077c",
  "commit": "874a00c",
  "head_before": "e50c574",
  "worktree_state": "clean, all 26 changed files committed, no other ticket's files touched",
  "behavior_delivered": [
    "观察来源 (ObservationSource): 服务端进程按接受顺序为其每个连接编号；接收入口从裸函数改为 SessionObservationSink { adopt(source, reading), lost(source) } (framework/core/protocol.ts, framework/modules/local-access.ts)。",
    "读数按来源归属 (framework/core/observations.ts): 活动与上下文各记录陈述它的最新来源；更旧的词既不覆盖也不撤销；来源结束只撤销它陈述过的实时读数，保留会话身份、直接父关系与已保存消费；被撤销字段的来源戳保留，旧来源无法复活它；read()/snapshot() 投影出公开读数形状，不泄漏来源戳。",
    "失效对消费者的表达：新增语义事件 session_unobserved (delivery + handler 类型)，binding 在来源失效时按会话投递；活动轴 forget 使重连后同一读数再次投递 (framework/behaviors/{binding,session-activity,session-context}.ts)。",
    "接收侧自行观察连接结束 (#accepted 的 close 覆盖正常释放/进程退出/被 kill)，不依赖将退出进程发出任何收尾帧。",
    "受影响消费者：model-cost 处理 session_unobserved → 忘记本实例活动读数并重绘；detail 行失去 Working 强调与 Ctx:，行/位置/树总量/消费文档不变 (extensions/model-cost/**)。",
    "文档：framework/GLOSSARY.md 新增 Observation source；framework/docs/framework-capabilities.md、extensions/model-cost/GLOSSARY.md 与 README.md 更新 detail 不可用语义。"
  ],
  "criteria_evidence": [
    {
      "criterion": "断开后状态变化再重连立即接收最新快照，无额外 Turn/Round/计费交付",
      "evidence": "tests/framework/session-observation-access.test.ts「a source that reaches the seat again restores what was withdrawn…」(投递序列恰为 activity/context/unobserved/activity/context)；tests/model-cost/detail-tree-live-sessions.test.ts 同名用例 (重连后 detail 恢复 Working 与 Ctx: 50,000/450.0K，消费文档字节不变)"
    },
    {
      "criterion": "真实进程 + 可控交付顺序验证重复/迟到/旧来源退出，新来源读数保持，不用概率性 sleep",
      "evidence": "tests/framework/local-access-observation.test.ts「two real processes' words about one session are ordered…」(两个真实子进程；断言每个词所属来源、重复词、迟到词、lost 只属于旧来源；顺序由子进程应答链 + 有界 until 等待保证)；tests/model-cost/detail-tree-process-sources.test.ts「an earlier process's end takes none of a later process's readings…」"
    },
    {
      "criterion": "正常释放与异常退出分别触发所属来源不可用；interface 读取不可用；实际 detail 不残留 Working/实时上下文",
      "evidence": "local-access-observation.test.ts「a real process releasing its access ends one source…」「a real process ended abruptly ends one source just as well」(release 与 kill 两条路径)；detail-tree-process-sources.test.ts「a killed process's reading is withdrawn and the row keeps its place…」(绘制行丢 Ctx:，行模型 nameEmphasis undefined，身份/深度保留)"
    },
    {
      "criterion": "不可用不冒充 Idle/失败/完成，不伪造计费生命周期",
      "evidence": "同一 S1 用例断言该次失效中订阅者收到的投递种类恰为 [session_activity, session_context, session_unobserved]；detail 用例断言消费文档字节不变、行数不变"
    },
    {
      "criterion": "断连前后树与消费保留：身份、直接父关系、已保存消费；实时登记身份仅内存保留",
      "evidence": "session-observation-access.test.ts「the readings a source's end withdraws are gone for a reader, and its identity is not」(read/snapshot 仍有 session+owner)；detail 用例失效后仍读同名同深度行、文档不变、无新增登记行"
    },
    {
      "criterion": "旧连接关闭不清除新连接读数；正常撤销不依赖退出进程的最后一条通知",
      "evidence": "session-observation-access.test.ts「a word a later source stated survives the earlier source's end…」；真实进程用例（被 kill 的进程未发任何收尾帧仍被观察为结束）"
    },
    {
      "criterion": "受控时序/真实关闭/异常退出/实际 detail 观察，覆盖分区与消费者；typecheck；可归因日志",
      "evidence": "见下的 verification"
    }
  ],
  "verification": [
    {
      "command": "bun run typecheck",
      "result": "exit 0 (log 05-typecheck.log)"
    },
    {
      "command": "bun test tests/framework",
      "result": "exit 0, 563 pass / 0 fail, 46 files, 62.45s"
    },
    {
      "command": "bun test tests/model-cost",
      "result": "重跑 exit 0, 483 pass / 0 fail, 44 files, 17.13s；第一次运行 exit 1 (482 pass / 1 fail，见 unresolved)"
    },
    {
      "command": "基线对照 git worktree add ../tc05-baseline HEAD + bun test tests/model-cost",
      "result": "exit 0, 478 pass / 0 fail；对照后已删除该 worktree"
    },
    {
      "command": "故障注入（临时改坏→红→复原→绿，5 项：binding 不 withdrawSource / observeActivity 去掉来源新旧判定 / 去掉 activityAxis.forget / close 不陈述 lost / model-cost 缺 sessionActivity.forget）",
      "result": "每项都被对应断言检出并变红，复原后全绿；注入未保留"
    }
  ],
  "evidence_files": [
    ".scratch/framework-subagent-observation/implementation/evidence/05-reconnect-source-lifecycle-evidence-2026-10-17.md",
    "evidence/logs/05-typecheck.log",
    "evidence/logs/05-framework-partition.log",
    "evidence/logs/05-model-cost-partition.log",
    "evidence/logs/05-model-cost-partition-first-run.log"
  ],
  "unresolved": [
    "真实 harness 未运行：本票的真实进程证据是「真实 bun 子进程 + 真实命名管道 + 生产前端/详情模型」，未执行 pi/OMP smoke，真实宿主上「子进程退出后 Owner 收到 session_unobserved」仍未验证（宿主版本/平台证据缺失，显式标注为实现限制，不折算为通过）。",
    "POSIX 未验证：仅 Windows 10.0.26200；命名管道与套接字文件差异未取得运行证据。",
    "第一次 model-cost 分区运行出现 1 例失败，非本票断言：tests/model-cost/pi-disposal-round-close.test.ts（票据 10）「leaving a session for another one closes no Round…」报 no record for pi-disposal-child was published；该文件单独运行、与本票新增文件三者合跑、以及整个分区重跑均通过，基线 worktree 同分区亦通过 → 判定为本票新增的多进程文件带来并行负载下该用例自身时序假设的偶发失败，未被本票修改也未修复；两份日志（红/绿）都保留。",
    "未运行 tests/codebase-tools、tests/connect-bot、tests/harness-dock 分区（票据范围外；session_unobserved 为新增事件种类，对既有扩展声明是增量）。",
    "与票据 06 的 shared-file 协调：对方在独立 worktree 改同一函数 directCaller（加 target 参数与 ended() 判定），本票在该函数体内新增的 const asSource = nextSource() 与 seat.readings?.adopt(asSource, reading) 需在合并时保留；已通过 agent:// 消息告知对方与集成要点。"
  ]
}
