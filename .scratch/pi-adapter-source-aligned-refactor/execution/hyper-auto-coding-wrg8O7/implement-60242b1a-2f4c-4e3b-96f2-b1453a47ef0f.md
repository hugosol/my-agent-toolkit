# implement

```json
{
  "role": "implement",
  "agent": "tdd",
  "agent_id": "02-pi-native-consumer-pathsmd-eeba718e-dc79-4b20",
  "head": "b7ab5fdf0248fb9a2338663e3d3ef66aa5f5e4c0",
  "exitCode": 0,
  "aborted": false,
  "truncated": false
}
```

{
  "ticket": "02-pi-native-consumer-paths",
  "status": "implemented-and-verified; awaiting independent integration",
  "commit": "b7ab5fd",
  "branch": "hyper/pi-adapter-source-aligned-refactor/02-pi-native-consumer-paths-18f94e-ad3d0438e083",
  "worktree": "C:/Users/hugos/AppData/Local/Temp/hyper-ticket-PXOqXG",
  "delivered": [
    "完整 State entry 命名、分支读取与 append 协议合并至 native/core/session-manager/state.ts；保持 payload、顺序、恢复规则与 writer 所有权。",
    "命令、prompt、context usage、公开结构类型、Node text loader 迁移至 native/core/extensions；目录价格和实时 provider access 迁移至 native/core/model-registry.ts。",
    "全部现存调用方与直接导航迁移，删除被替代实现，无兼容转发；公开 assembly、配置、类型与加载使用方式保持不变。"
  ],
  "acceptance": {
    "P6": "公开 piAdapter 场景验证 toggle/directive、非法参数、prompt identity；真实 manual/auto smoke 验证请求尾部追加、历史前缀与顺序保持。",
    "P8": "直接重放 01 冻结的 pi-state-before、pi-switch-target、pi-switch-other；验证恢复 true、下一 toggle 写 false、保留 init 并选择 reminder、正确分支选择。",
    "P9": "1000/0 budget、有效/非布尔/非法 YAML startup policy、拒绝前不构造和不注册、修正配置后重新绑定；实际 Pi model-cost 配置消费通过。",
    "P10": "同分支多 extension State/prompt 隔离、独立 binding 生命周期、拒绝不污染后续绑定。",
    "P13": "registry 与 directed command 的 rejection/AbortError 保持原错误身份；registry 调用次数验证无新增重试；价格、缺失含义、实时 credential、URL 优先和回落有独立预期。",
    "P14": "cleanup 后 authored command 不再产生效果或写入；prompt callback 停止，独立 binding 继续工作。保留 framework 明确规定的 disposal 后 local toggle 可达行为。"
  },
  "verification": [
    {
      "command": "bun test tests/framework/pi-native-consumers.test.ts",
      "exit": 0,
      "result": "11 pass, 0 fail, 68 assertions"
    },
    {
      "command": "bun run typecheck",
      "exit": 0,
      "result": "TypeScript 与 authoring 检查通过；61 files / 4 declarations / 0 diagnostics"
    },
    {
      "command": "bun test tests/framework",
      "exit": 0,
      "result": "668 pass, 0 fail, 3511 assertions / 58 files",
      "log": ".cache/ticket02-framework.log"
    },
    {
      "command": "bun test tests/model-cost/harnesses/pi",
      "exit": 0,
      "result": "91 pass, 0 fail, 604 assertions / 12 files",
      "log": ".cache/ticket02-pi-consumers.log"
    },
    {
      "command": "bun run check:integrations --adapter pi --json",
      "exit": 0,
      "result": "三个 consumer 均 complete；仅结构证据"
    },
    {
      "command": "bun scripts/pi-codebase-tools-smoke.ts --keep",
      "exit": 0,
      "result": "78 checks / 6 isolated runs",
      "log": ".cache/ticket02-manual.log"
    },
    {
      "command": "bun scripts/pi-codebase-tools-smoke.ts --mode auto --keep",
      "exit": 0,
      "result": "62 checks / 4 isolated runs",
      "log": ".cache/ticket02-auto.log"
    },
    {
      "command": "bun scripts/pi-model-cost-smoke.ts --keep",
      "exit": 0,
      "result": "100 checks / 28 isolated runs",
      "log": ".cache/ticket02-model-cost.log"
    }
  ],
  "environment": "Windows x64; Bun 1.4.2; installed Pi 1.4.0; PI_NODE=D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe (Node 22.19.0)。真实 smoke 顺序运行，78/62/100 与 01 Node22 基线计数一致。",
  "integrationNotes": [
    "04 的顶层 port.ts 迁移须保留本票 native imports；04 新文件中的 internal/native 引用改到 native/core/extensions/types.ts。",
    "04 留下仅含 State helpers 的旧 domain/session/queries.ts 应删除；State helpers 一律使用 native/core/session-manager/state.ts，不能恢复兼容导出。",
    "06 移动 UI transport 时需要同步本票 native command/context/prompt 的 transport imports。",
    "验收与日志索引已写入唯一票据；按仓库规则状态保留 in-progress，由独立集成合入后 closed。验证窗口已直接释放给 03，并告知 05 遵循 Main 顺序。"
  ],
  "limitations": [
    "未运行全仓测试；已完成本票 owning partition、受影响 Pi consumers、真实 Pi smoke 和类型检查。",
    "真实请求使用本机 capture endpoint，余额和 Codex account 使用受控文档；不声称真实服务或账号验证。",
    "TUI 可读性与 H1 未验证，不提升支持声明。",
    "首次测试缺少 yaml，安装锁定依赖后通过；测试编写中的 fixture/类型误设已纠正，最终分区无失败。"
  ],
  "unfinishedImplementation": []
}
