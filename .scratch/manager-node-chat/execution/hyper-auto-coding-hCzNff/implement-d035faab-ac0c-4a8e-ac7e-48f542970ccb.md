# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "07-collect-lifecycle-cancellationmd-b739e0db-3e1",
  "head": "96c8dc9ddceac1d477310d5dbde1be02d92a8430",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "07-collect-lifecycle-cancellation",
  "status": "implemented-and-verified-awaiting-independent-integration",
  "commit": "96c8dc9",
  "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-xLHFP8",
  "delivered": [
    "复用已有公共 HTTP 与角色生命周期连线，新增 P19 真实 omp 验收：工具 abort、Session 切换及正常 shutdown，全部覆盖真实后端 200 响应头已转发、正文未完成阶段。",
    "将测试后端代理改为透明 TCP 转发，观察客户端 FIN、后端自行返回 FIN，并验证恢复原 Session 后新 collect 仍能收取真实报告。",
    "新增 P21 工具 interface 终止原因覆盖及公共 HTTP 终止竞争覆盖，不建立全局优先级，不伪造成功快照。",
    "更新长期取消/故障说明、实际连接观察样本及本票验收证据。"
  ],
  "acceptance_evidence": {
    "P19": {
      "tests": "tests/harness-dock/manager-collect-lifecycle.test.ts",
      "observed": "后端期限与客户端预算均为30秒；abort、new_session、shutdown分别在连接建立后3/3、4/4、5/5ms观察到客户端/后端FIN，正文均为0字节；恢复原生Session后，新collect均返回notification与对应真实报告标识。",
      "log": "artifact://330"
    },
    "P21": {
      "tests": [
        "tests/workflow-chat/manager-collect-termination.test.ts",
        "tests/framework/http-collect-termination.test.ts"
      ],
      "observed": "正常后端timeout、cancelled、客户端timeout、transport、parse可区分；响应前断线、200后断流、不完整正文及非法JSON均不生成reason/snapshot。竞争测试保留实际采用原因及错误身份。",
      "logs": [
        "artifact://315",
        "artifact://324"
      ]
    }
  },
  "verification": [
    {
      "command": "bun test tests/workflow-chat",
      "result": "11 pass / 0 fail；195 assertions"
    },
    {
      "command": "bun test tests/harness-dock/manager-collect-lifecycle.test.ts tests/harness-dock/manager-collect-budget.test.ts tests/harness-dock/manager-collect-pending.test.ts tests/harness-dock/manager-state-actions.test.ts tests/harness-dock/manager-resume-finish.test.ts tests/harness-dock/manager-dispatch-recovery.test.ts",
      "result": "15 pass / 0 fail；292 assertions"
    },
    {
      "command": "bun test tests/framework",
      "result": "725 pass / 0 fail；3905 assertions"
    },
    {
      "command": "bun run typecheck",
      "result": "exit 0；Authoring 67 files / 6 declarations / 0 diagnostics"
    }
  ],
  "tdd_evidence": "既有产品行为初次验证通过；临时移除两条请求取消信号后，真实abort用例直到30031ms才释放并失败于<5000ms断言。已恢复信号，最终真实dock全绿，未保留变异。",
  "limitations": [
    "Session切换时omp丢弃旧工具结果，未伪造该结果；shutdown实际反馈cancelled / Session ended，abort反馈cancelled / Interrupted by user。",
    "通过双向FIN、未等满期限和后续报告收取观察等待响应释放，不直接测量后端内部watch数量。",
    "外部provider与Herdr CLI受控，不证明真实模型决策、取消回滚或无限网络保证。",
    "未运行全仓库总入口，留给独立集成代理；本票技术验收无剩余项。"
  ],
  "handoff": "已提交本票实现，未修改其他票据或工作流报告、未操作集成工作区、未自行合入dev。按仓库约定，本票保持in-progress直至独立集成完成；worktree交由集成代理接管。"
}
