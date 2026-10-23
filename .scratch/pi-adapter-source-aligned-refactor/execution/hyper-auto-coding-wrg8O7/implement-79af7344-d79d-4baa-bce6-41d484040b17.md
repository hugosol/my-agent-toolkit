# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "08-source-assembly-integrationmd-a005c2d3-8b46-4",
  "head": "69766e5e896c1720a34114f2251ee317539f2a7e",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "08-source-assembly-integration.md",
  "result": "本票实现及自动验收完成，已提交，worktree 可交给独立集成代理；未自行合入 dev。",
  "commit": "69766e5",
  "branch": "hyper/pi-adapter-source-aligned-refactor/08-source-assembly-integration-ced4fd-7ee6d70b4806",
  "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-CEGbaT",
  "changes": [
    "Pi 公共 assembly 安装其 native Node 文本加载支持，移除 codebase-tools 对私有来源路径的依赖；公开类型、HarnessPort 与绑定方式不变。",
    "复用 import-boundary 测试，保护 native/thirdParty/mixture 的批准依赖方向及消费方只能使用公共 adapter assembly；不冻结私有文件清单。",
    "更新 ADR-0002、README、能力导航、接口架构、接入指南及既有 assembly 构造说明，移除过时 domain-first 规则。",
    "本票验收清单、完整结构审查、命令、环境与限制已记录到唯一指定票据；未修改其他票据或工作流报告。"
  ],
  "acceptance": {
    "P1": "从两个真实 port assembly 逐项追踪 native、pi-subagents 与必要 mixture；对照外部原生源码、provider 发布契约与可选 host patch，审查结果见票据 Comments。",
    "P2": "来源导入约束通过；临时注入 native→thirdParty、thirdParty→mixture 均准确触发失败，恢复后通过。04 集成 owner 确认共享 PiPortContext 的 type-only 注入不承担第三方解释。",
    "P3": "生产旧路径/规则检索无命中；无兼容转发、空来源分组或第二套实现；更新区域 68 个文档链接/anchor 检查通过。",
    "P4": "公共 assembly 成功/拒绝、消费方分区及 Pi 条件类型凭据通过；真实 Pi 与 OMP 加载另有运行证据。",
    "P16": "实际两端 CLI 检查的六个消费组合全部 complete、0 diagnostics；每端 codebase-tools/connect-bot/model-cost 的 11/19/29 个 required 全部 provided。保留原可选 unavailable/conditional 状态，未删需求或增加手工供给表。"
  },
  "verification": [
    {
      "command": "bun test tests/framework/import-boundary.test.ts",
      "exitCode": 0,
      "result": "16 pass，0 fail，461 assertions；另观察到预期 red 与恢复后的 green。"
    },
    {
      "command": "bun run typecheck",
      "exitCode": 0,
      "result": "TypeScript 与 authoring gate 通过；61 files，4 declarations，0 diagnostics。"
    },
    {
      "command": "bun test tests/framework tests/integrations tests/authoring tests/codebase-tools tests/connect-bot tests/model-cost",
      "exitCode": 0,
      "result": "1527 pass，0 fail；152 files，8727 assertions，243.67 秒。",
      "evidence": "artifact://353"
    },
    {
      "command": "bun run check:integrations --adapter pi --json",
      "exitCode": 0,
      "result": "三个真实消费组合全部 complete，无 required 缺口。",
      "evidence": ".cache/ticket08-integrations-pi.json"
    },
    {
      "command": "bun run check:integrations --adapter omp --json",
      "exitCode": 0,
      "result": "三个真实消费组合全部 complete，无 required 缺口。",
      "evidence": ".cache/ticket08-integrations-omp.json"
    },
    {
      "command": "bun test tests/harness-dock/startup-modes-loading.test.ts",
      "exitCode": 0,
      "result": "真实隔离 OMP 18.5.0：5 pass，0 fail，58 assertions。"
    },
    {
      "command": "PI_NODE=D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe bun scripts/pi-codebase-tools-smoke.ts --pi D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js",
      "exitCode": 0,
      "result": "实际通过 Windows cmd 设置环境执行；Pi 1.4.0 / Node 22.19.0，manual mode，6 个隔离运行，78 项检查全部通过，包括公共入口 Markdown 加载、恢复/switch 与真实 detached child 跟随 Owner。"
    }
  ],
  "environment": {
    "platform": "Windows x64 10.0.26200，Bun 1.4.2",
    "sourceBase": "6693ac79382320d97259614ba4da513225da8c70",
    "inspectedUpstream": {
      "pi": "36be9c612e64082a4f0d4d0a94706c38ecbc20a1",
      "omp": "611c189fa2f6b8c9b368559ea6b98062b9b54539"
    },
    "providerDistinction": "Pi smoke 加载 repo-pinned pi-subagents 0.78.0 extension；现有 framework/config.yaml 显式指定的 required-child-extension 公共 export 来自用户安装的 0.80.0。配置未改动，未混称为单一版本验证。",
    "externalServices": "真实 smoke 使用 credential-free 本地 capture/panel；未使用真实模型或面板凭据，未安装/修改宿主补丁。"
  },
  "unresolvedFailures": [],
  "remainingVerification": [
    "09 在稳定窗口执行最终全量回归；本次不是全仓库测试声明。",
    "H1 日常 TUI 人工体验仍未确认。",
    "本票 OMP loading smoke 未验证真实补丁 Viewed-session 交互；静态 provided 不表示宿主补丁存在。"
  ],
  "ticketStatus": "按仓库规则，票据合入前保持 in-progress；验收清单已全部勾选，由独立集成方合入后关闭。"
}
