# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "09-role-prompts-input-boundariesmd-995af82f-6cfa",
  "head": "8444bfdd8421151b890126ff4f8e8411cf623ce1",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "09-role-prompts-input-boundaries",
  "status": "implemented-and-verified; ready-for-independent-integration",
  "commit": "8444bfd",
  "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-M3Mjgn",
  "summary": [
    "补全 manager 首次指引：十种 run action、collect 五种原因与等待预算、派发核实、recover/retry、真实人工交接、部分效果及不自主重试。",
    "通过真实隔离 OMP 捕获两角色实际 Prompt 与持久化身份，验证普通轮次和切换不重复注入。",
    "通过真实后端生成的启动正文及实际 OMP 输入验证 Task 固定文本、本次工作和工具指引的边界；未修改后端启动输入组合。",
    "完成并保留实际后端故障演练：已保存但通知失败、原执行恢复、独立重试、读取真实材料后人工 complete。更新长期 README。"
  ],
  "acceptance_evidence": [
    {
      "criteria": "P26：实际注入、完整 manager/node 指引",
      "tests": [
        "tests/workflow-chat/role-prompts.test.ts"
      ],
      "result": "首次 red 在真实请求中检出缺失 reconcile_dispatch；补全后 green。node 既有指引通过覆盖验证，无人为制造失败。"
    },
    {
      "criteria": "P26：first-enabled-run 身份、历史及切换规则",
      "tests": [
        "tests/harness-dock/role-prompts.test.ts"
      ],
      "result": "两角色分别验证隐藏持久化身份、普通轮次不追加、新 owner 不重复自动启用、切回原会话不重置。"
    },
    {
      "criteria": "P27：输入职责与禁止复制",
      "tests": [
        "tests/workflow-chat/role-input-boundaries.test.ts"
      ],
      "result": "实际后端 CLI 提交正文作为一个未修改文本块进入 OMP，角色指引单独贡献；Bot 文档、完整 Map 标记和向 node 自动传播的 user_input 均不存在。保留宿主原生 system-reminder 文本块。"
    },
    {
      "criteria": "P26：Agent 指引故障演练和证据",
      "tests": [
        "tests/harness-dock/role-guidance-rehearsal.test.ts"
      ],
      "result": "真实工具与后端完成通知失败收取、recover/retry 确认及 paused 限制、原/新执行区分、人工读取真实材料后交接；证据明确标注受控 provider/Herdr 和测试产物来源。"
    }
  ],
  "verification": [
    {
      "command": "bun test tests/workflow-chat tests/harness-dock/role-prompts.test.ts tests/harness-dock/role-guidance-rehearsal.test.ts",
      "result": "exit 0；16 pass，0 fail，320 expect；14 files；30.93s"
    },
    {
      "command": "bun run typecheck",
      "result": "exit 0；TypeScript 通过；authoring 67 files、6 declarations、0 diagnostics"
    }
  ],
  "retained_evidence": {
    "directory": "C:/Users/hugos/AppData/Local/Temp/role-prompts-09-green-20261029",
    "files": [
      "verification.log",
      "guidance-rehearsal.json",
      "各角色子目录中的 captures/request-*.json 与 sessions/*.jsonl"
    ],
    "contents": "实际注入全文、原始 provider 请求、Session 历史、故障演练工具结果、HTTP 请求和外部 CLI 记录。"
  },
  "limitations": [
    "受控 provider/Herdr 证据不证明真实模型自主完成工作或真实 Herdr 启动模型。",
    "H1 未宣称通过，按票据分工交由 12 汇总并由用户作唯一整体使用判断。",
    "未自行合入 dev，未修改其他票据或工作流报告；票据 closed 状态须待独立集成合并后处理。"
  ],
  "handoff": "本票实现已提交，worktree 交由独立集成子代理接管；没有本票未完成的技术验收项。"
}
