# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "07-omp-viewed-session-feedbackmd-ca69c32b-1544-4",
  "head": "12cf245ffad1e4ab8a97fc2e7df34878a82d253a",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "07-omp-viewed-session-feedback",
  "commit": "12cf245",
  "branch": "hyper/pi-adapter-source-aligned-refactor/07-omp-viewed-session-feedback-75c384-ad3d0438e083",
  "status": "实现已提交，worktree 已交接；存在明确保留的既有 P14 失败，票据保持 in-progress，未宣称全部验收通过。",
  "delivered": [
    "将 OMP feedback、Marker、可选 Viewed-session 映射迁至 native/extensibility/extensions；UI 类型唯一声明迁至 ui.ts。删除旧实现路径，没有兼容转发或对称第三方分组。",
    "迁移相关 imports、公开类型出口和直接导航，保持共享 Marker area、Owner 解析及原有映射算法。",
    "经公开 ompAdapter assembly 增补 outlet 缺失、身份不可用、原样错误传播、queued callback 停止及另一 binding 继续投影的覆盖。"
  ],
  "acceptance": {
    "P7": "Marker 输出、有效 State、severity、有／无 UI、输出渠道和模型上下文隔离由 marker.test.ts、feedback-harness.test.ts、viewed-marker.test.ts 支持；适用真实 OMP 场景通过。H1 未验证。",
    "P15": "受控 outlet 存在／缺失、切换、不可用身份均覆盖；真实 patched outlet 和 unpatched control 均实际运行通过。",
    "P10": "多 binding 隔离及释放一个 binding 后另一 binding 继续投影通过。",
    "P13": "同一个 native outlet Error 原样传播，仅一次失败读取，后续正常 publication 恢复；未新增重试或等待。",
    "P14": "取消订阅后的 queued view callback 不再发布，通过；迟到 native run 重新打开订阅的既有缺陷未通过，未修复。"
  },
  "verification": [
    {
      "command": "迁移前：bun test tests/framework/viewed-marker.test.ts tests/framework/feedback-harness.test.ts tests/framework/marker.test.ts",
      "exit": 0,
      "result": "23 pass，0 fail；首次缺 yaml 后执行 bun install --frozen-lockfile 建立依赖。"
    },
    {
      "command": "迁移后定向三文件检查（新增单独已知缺陷复现前）",
      "exit": 0,
      "result": "27 pass，0 fail，81 assertions。"
    },
    {
      "command": "bun test tests/framework",
      "exit": 1,
      "result": "672 pass，1 fail，3533 assertions，58 files；唯一失败是明确记录的既有 P14 重订阅缺陷。",
      "log": ".cache/ticket07-framework.log"
    },
    {
      "command": "bun test tests/harness-dock/viewed-marker.test.ts tests/harness-dock/viewed-session-host.test.ts tests/codebase-tools/marker-lifecycle.test.ts tests/codebase-tools/command-toggle.test.ts tests/codebase-tools/startup-modes-dock.test.ts",
      "exit": 0,
      "result": "14 pass，0 fail，177 assertions，5 files。",
      "log": ".cache/ticket07-real-omp.log"
    },
    {
      "command": "bun run typecheck",
      "exit": 0,
      "result": "TypeScript 通过；check:authoring 为 61 files、4 declarations、0 diagnostics。"
    }
  ],
  "known_failure": {
    "reproduction": "两 marker bindings 启动并启用 → session_shutdown：subscribers 2→0 → 迟到 before_agent_start：subscribers 0→2，无新增 widget。",
    "cause": "原 createViewedSession.watch 未检查 viewedListeners 是否为空；迟到 native run 经 context tracker 重新触发订阅。迁移前源逻辑相同。",
    "scope_decision": "Main 明确要求保持结构迁移范围，不纳入现存缺陷修复，失败单独记录且不计通过。",
    "retained_test": "a native run arriving after release must not reopen Viewed-session subscriptions (P14, known existing defect)；正常失败测试，没有 skip/todo/expected-failure。"
  },
  "real_environment": {
    "platform": "Windows x64，Bun 1.4.2",
    "harness": "既有 isolated exact OMP 18.5.0，以及既有 18.5.0-viewed-session 冻结补丁安装。",
    "isolation": "仅在本 worktree 建 junction 复用已有前缀；未安装、修改或重新应用宿主补丁，未修改集成工作区。",
    "limits": "RPC 与本地模型 capture，不是日常 TUI 人工验收、真实交互 focus 或远程模型服务证明。昂贵窗口已释放给 integrate04。"
  },
  "integration_notes": [
    "本票独立基于 921de1d，按 Main 指示未摘取 03／05。",
    "集成时将新 UI 模块的 internal/native、domain/context/queries、domain/session/queries 依赖分别接至 native/extensibility/extensions/types.ts、context.ts、session-facts.ts。",
    "同步迁移 03／05 的 context/lifecycle/private port 中 feedback／marker imports，以及 types/session-facts 中 Viewed-session 类型引用；OmpUiContext 唯一声明保留在 ui.ts，public index 从此导出。不要恢复旧路径或兼容实现。"
  ],
  "handoff": "本票文件已记录逐项证据、失败复现和范围决定、前后输出、环境、操作步骤及 H1 限制，供独立集成代理和 09 使用。用户日常 TUI 确认仍未验证。"
}
