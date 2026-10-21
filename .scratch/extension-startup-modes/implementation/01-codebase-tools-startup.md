# 01: codebase-tools 双模式首次启动

**What to build:** 用户在 pi 或 OMP 中通过显式入口选择 codebase-tools 手动模式或自动启动模式。两种模式共享 framework 公共装配与启动规则，由入口静态选择启动配置；无历史时常规手动关闭、常规自动开启。启动同步设置明确目标，使首个模型请求已包含应有贡献，而不是执行一次 toggle。启动后仍可使用原命令，重复观察不会重新应用启动默认值。

**Delivers:** P8, P10, P11, P12, P36；P2, P3, P4, P26, P33 的 codebase-tools 分区。

**Test owner for:** P2, P3, P4, P26, P33 的 codebase-tools 分区；connect-bot 分区由 03 编写测试，全部分区满足后对应 promise 才完成。

**Blocked by:** None (can start immediately).

**Status:** in-progress

依据：[已批准契约](../contract.md)、[Spec](../spec.md)。

- [x] 保留原手动入口；在 codebase-tools 原支持的 pi、OMP 组合中真实加载并执行原命令，不扩大其他 extension 的支持范围。
- [x] 自动入口无需命令触发首次启用；常规宿主加载参数即可选择模式，不新增运行时配置档参数或环境覆盖。
- [x] 两模式复用 extension 定义、公共 adapter 装配和同一启动规则。纯声明 State 消费者无需增加空业务初始化函数；不新建独立启动 runtime，不改变 initialize 等待含义。
- [x] 无有效历史时，常规手动 false、常规自动 true；分别核对贡献、marker 交付和对应 State 效果。相同历史与宿主条件下，两入口分别给定明确 true/false，按独立预期核对，不仅比较两边相等。
- [x] 启动应用明确目标而非模拟命令或 toggle；历史 true、目标 true 的场景仍开启，实际贡献存在。
- [x] 捕获真实首个模型请求，确认同步 State 设置已发生且该请求包含应有贡献；事后 marker 不能替代此证据。
- [x] 启动后原命令仍能开启、关闭；核对贡献、marker 交付与原有持久化效果。
- [x] 启动后通过命令改变选择，再重复相关会话观察并发出模型请求；确认启动目标不会重新覆盖命令选择，也不产生额外启动写入。仅重复设置 true 后仍为 true 不足以证明一次性应用。
- [x] 无历史、常规手动关闭且没有启用或命令操作时，退出后无新增 State 载荷；允许宿主写入正常的其他会话记录。
- [x] 通过契约 S1 公共装配 interface 和 S2 真实 harness 验证，不新增私有 State 调试口、测试专用生产启动入口或源码文本断言。
- [x] 为 P8 准备 OMP/pi 隔离启动命令、场景清单、终端截图或录制与自动结果。只将 marker 实际显示判断交给用户；未确认前保持未验证，不暂停其余可执行工作。
- [x] 完成受影响用例、所属分区及公共 API 受影响消费者检查；TypeScript 变更执行类型检查和相关 authoring/integration 静态检查，真实 harness 验证独立记录。遵守共享工作树测试协调规则，并更新本票行为对应的必要说明。

## 跨票覆盖分区

下表项目的实现与测试均由本票负责；其余消费者项目由 03 负责，完整分区见对应票。

| Promise | Coverage item | Ticket | Test owner |
|---|---|---|---|
| P2 | codebase-tools：pi、OMP 原手动入口及原有操作 | 01 | 01 |
| P3 | codebase-tools：无命令启动与首轮贡献 | 01 | 01 |
| P4 | codebase-tools：两入口显式 true/false 的独立预期 | 01 | 01 |
| P26 | codebase-tools：重复观察和首轮请求不重做启动应用，不覆盖后续命令选择 | 01 | 01 |
| P33 | codebase-tools：常规宿主参数下由显式入口静态选择配置 | 01 | 01 |

## Comments

### 实现摘要

- 框架启动策略：`framework/core/startup.ts` 读取入口静态选择的策略文档（按 extension id 的 `enabled: boolean`，只校验当前绑定 extension 的块，按文件每进程读一次），`ExtensionAssembly.startupPolicy` 由 `createAssemblyBinding` → `bindExtension` 在同一加载期路径上解析；非法/缺失文档与 extension 配置一样产生 `configuration` 失败并拒绝绑定。
- State 应用：`StateStore.reconcile` 在**进程首次 owner 会话开始**时，仅当分支没有有效记录值时采用启动选择；`true` 经由与命令写入相同的 `session-entry` 持久化介质记录，`false`/默认不写；历史 `true`/`false` 始终优先；选择是目标而非 toggle；进程内后续 new/resume/fork 不再应用。
- 入口与装配：`entrypoints/{omp,pi}-auto/codebase-tools.ts` 为薄入口（纯 re-export，保持既有 import-boundary 约束）；`extensions/codebase-tools/harnesses/{omp,pi}-assembly.ts` 为两种模式共享的唯一装配，`{omp,pi}-auto.ts` 仅命名自动模式的策略文档与子代理 childEntry。原手动入口与命令行为不变。
- 文档：`framework/docs/framework-capabilities.md`、`framework/README.md`、`framework/GLOSSARY.md`、`extensions/codebase-tools/README.md`（含两种模式的启动命令、语义边界与人工可视验收场景）。

### P8 人工可视验收准备（marker 实际显示仍待用户确认）

隔离命令（临时 agent state，不触碰正式配置；`<repo>` 为本仓库根，`<provider>/<model>` 为可用模型）：

```bash
# OMP 手动（对照）：应先无 marker、无贡献，/codebase-tools 后出现 marker
PI_CODING_AGENT_DIR=<throwaway> omp --no-extensions -e <repo>/entrypoints/omp --model <provider>/<model>
# OMP 自动：启动即应显示 ◈ codeBaseTools（无 enable 通知），首轮已带 init
PI_CODING_AGENT_DIR=<throwaway> omp --no-extensions -e <repo>/entrypoints/omp-auto/codebase-tools.ts --model <provider>/<model>
# pi 手动（对照）
pi --no-extensions -e <repo>/entrypoints/pi/codebase-tools.ts
# pi 自动
pi --no-extensions -e <repo>/entrypoints/pi-auto/codebase-tools.ts
```

场景清单（详细步骤见 `extensions/codebase-tools/README.md` 的 H1/H1b）：(1) 无历史自动入口启动即显示 marker；(2) 无 enable 通知；(3) `/codebase-tools` 关闭、marker 消失、下一轮无新贡献；(4) 再次开启、marker 回归、下一轮为 reminder；(5) 同进程新会话默认关闭；(6) `--resume` 已开启会话立即显示 marker、无第二次启动写入。自动结果（RPC frame / 会话 JSONL / 捕获请求）由下述用例记录；终端截图或录制需用户在交互终端执行后补充。

### 验证记录（实际执行）

- `bun run typecheck`：通过（tsc + `check:authoring`，55 files / 0 diagnostics）。
- `bun run check:integrations`：exit 0（结构分析）。
- `bun test tests/codebase-tools`：35 pass / 0 fail across 9 files（含新增 S1 `startup-modes.test.ts` 7 例、S2 `startup-modes-dock.test.ts` 4 例）。
- `bun test tests/framework tests/authoring tests/integrations`：726 pass / 0 fail across 63 files。
- `bun test tests/model-cost`：524 pass / 0 fail across 51 files（共享 adapter/binding 的消费者回归）。
- `bun test tests/connect-bot`：136 pass / 5 fail；5 例均为真实面板互操作用例，失败原因仅为缺少外部 `herdr-bot.exe`（与本改动无关）。
- `bun scripts/pi-codebase-tools-smoke.ts --mode auto`：pi 1.3.0，31 checks 全通过（真实 pi CLI、隔离状态/捕获端点）。
- `bun scripts/pi-codebase-tools-smoke.ts`（manual）：25 个行为检查通过；进程退出检查在 pi 1.3.0 + Node 24.18.0 下报 libuv assertion（`UV_HANDLE_CLOSING`，exit 9），在未修改的 HEAD 上同样复现，属既有环境/版本问题；脚本按既有预期版本为 pi 1.2.0。
- 故障注入：临时移除“仅首次启动应用”标志后，S1 与 S2 的 P26 用例均按预期失败，随后恢复并通过。

未完成/未验证：P8/P9/P18/P19 的终端 marker/反馈实际显示仍为 human-led，未由自动结果替代；pi 手动 smoke 的进程退出检查受上述既有环境问题阻塞，其行为断言部分已通过。
