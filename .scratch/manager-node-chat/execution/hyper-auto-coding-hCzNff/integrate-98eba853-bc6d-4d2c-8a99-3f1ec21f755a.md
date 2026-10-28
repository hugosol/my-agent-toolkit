# integrate

```json
{
  "role": "integrate",
  "agent": "hyper-integrate",
  "agent_id": "integrate-11-durable-operations-guidemd-5ceee7a8",
  "head": "c1cb95b3fb29dbfbae82f8421d67066bd5eac232",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "status": "completed",
  "ticket": "11-durable-operations-guide.md",
  "branch": "hyper/manager-node-chat/11-durable-operations-guide-4e2580-0d11c09cbcb9",
  "head": "c1cb95b3fb29dbfbae82f8421d67066bd5eac232",
  "sync_result": "当前开发分支 HEAD 已是宿主回合并提交 c1cb95b，包含本票文档提交 0ee743d；没有冲突或待提交修改。",
  "commands": [
    {
      "command": "git status --short --branch && git log -4 --oneline && git merge-base --is-ancestor c1cb95b3fb29dbfbae82f8421d67066bd5eac232 HEAD",
      "result": "成功；HEAD=c1cb95b，祖先检查成功，工作区干净。"
    },
    {
      "command": "bun run test",
      "result": "成功；1751 pass、0 fail、11433 expect() calls，214 个文件，耗时 140.78 秒。",
      "output": "artifact://447"
    },
    {
      "command": "git status --short --branch",
      "result": "测试结束后工作区仍干净。"
    }
  ],
  "changes": [],
  "new_commit": null,
  "blockers": [],
  "scope_limits": "按本轮指派仅运行项目全局测试；未额外运行 typecheck、复杂脚本、独立 smoke 或跨票据整体验收。未操作集成工作区、切换分支、新建 worktree、reset、调用 retro 或直接合入 dev。"
}
