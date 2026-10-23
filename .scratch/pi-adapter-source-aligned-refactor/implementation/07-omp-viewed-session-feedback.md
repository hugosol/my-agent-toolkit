# 07: OMP Marker area、反馈与可选 Viewed-session 路径迁移

**What to build:** OMP extension 的 Marker area、Extension feedback 与 Viewed session 投影保持既有输出和交互语义；可选 Viewed-session 契约存在与缺失时分别维持原有行为，并正确识别为原生契约变体。

**Delivers:** P7（OMP 自动化与真实运行覆盖）；P15；P10、P13、P14（OMP UI／投影路径的适用覆盖项）

**Test owner for:** P7 的 OMP 输出／身份／投影／有无 UI 用例；P10、P13、P14 的 OMP UI 路径独立用例。跨路径组合用例及 H1 交接由 09 拥有，H1 结论由用户确认。

**Blocked by:** 01: 固化迁移清单与重构前验证基线。

**Status:** in-progress

## 边界与覆盖

遵循本 feature 的 spec／contract 与 01 分配，经 S1／S2 观察。使用既有 Session 身份和 Owner 契约，不等待其内部目录迁移。可选补丁是 native variant，不是第三方 provider；不安装、实现或修改宿主补丁。

- [x] 按实际消费的 OMP 原生 UI／Viewed-session 契约归置完整映射，不跟随最终 TUI 执行位置机械镜像，不为对称建立第三方分组。
- [x] 经公开 assembly 自动验证 Marker area 输出、会话身份、有效 State 投影、反馈严重级别及有／无 UI 分支，保持输出渠道和模型上下文隔离。
- [x] 用可控契约输入分别验证 Viewed-session outlet 存在及缺失；覆盖既有查看切换和目标身份不可用的投影规则，不能用名称伪造身份或把 Viewed session 当作 Owner。
- [x] 验证本路径适用的多 binding 隔离、既有错误传播、释放后订阅及迟到回调停止，另一有效 binding 的投影继续工作。不新增不存在的重试、等待或回退机制。**本轮获授权修复 P14 重订阅缺陷，全局测试通过；修复前失败证据保留如下。**
- [x] 迁移相关调用方和类型，保持共享 Marker area 与资源生命周期，删除本职责旧实现和转发路径并更新直接导航。
- [x] 执行当前环境适用的真实 OMP 场景；真实运行只声明实际存在的分支。没有补丁环境时明确记录接通缺口，受控双分支检查仍须完成，不把替身当作真实补丁接通证据。
- [x] 准备环境／版本、重构前后输出、可重复操作步骤、自动检查结果和已知差异，交给 09 汇总 H1；用户确认前实际日常 TUI 体验保持未验证。

## 验证与交接

迭代运行受影响测试及 TypeScript 类型检查；完成时运行拥有分区、受影响消费方和适用真实 dock／smoke。断言来源于独立预期和既有契约，不从实现重算。记录命令、退出状态、源／环境及限制。H1 只覆盖实际可用环境，不替代身份、状态、输出和补丁分支的自动验证，也不阻塞其他自动工作。跨行为入口的同一组合用例唯一归 09。

## 实施与验收记录（2026-10-24）

### 交付与来源

- 本 worktree 基于 `921de1d`，按 Main 明确决定独立交付，不摘取 03／05。UI 类型及反馈、Marker、Viewed-session 实现归入 `adapters/omp/native/extensibility/extensions/{ui,feedback,marker,viewed-session}.ts`，旧实现删除，没有转发层、第三方分组或新公共 interface。
- 归属依据是 OMP `extensibility/extensions/types.ts` 的 ExtensionUIContext 及既有补丁公开的 Viewed-session 契约，不是 `modes/interactive-mode.ts` 的最终绘制位置。共享 widget identity、placement、State store、context tracker、Owner 解析与订阅生命周期算法均未修改。
- 集成 03／05 时需将新模块依赖从本基线的 `internal/native`、`domain/context/queries`、`domain/session/queries` 分别接到 `native/extensibility/extensions/types.ts`、`context.ts`、`session-facts.ts`；后两者与 `types.ts` 对旧 feedback／marker／viewed-session 的引用同步迁移，`OmpUiContext` 的唯一声明保留在 `ui.ts`，public index 从这里导出。private port 的 UI import 同步迁移。不要恢复旧实现或兼容导出。

### S1 自动结果与固定预期

批准 seam 为公开 `ompAdapter` assembly 和 extension delivery；仅以外部 OMP context／registry／UI／outlet 输入控制条件。

- 迁移前：`bun test tests/framework/viewed-marker.test.ts tests/framework/feedback-harness.test.ts tests/framework/marker.test.ts`，退出 0，23 pass／0 fail／64 assertions。首次运行因本 worktree 没有依赖而失败（找不到 yaml），`bun install --frozen-lockfile` 后建立此基线；安装未改变锁文件。
- 新增 variant／身份／错误／迟到回调场景在迁移前映射语义下先检查，14 pass。首次 fixture 检查暴露同进程 Marker area 使用既有 session id 带来的另一已激活 marker，并暴露 framework-local toggle 在 disposal 后有意仍可达的既有规则；改用独立 failure session id、保留 toggle 规则，不改公共预期或实现。
- 迁移后定向三文件：退出 0，27 pass／0 fail／81 assertions（在增加单独的已知缺陷复现前）。
- 最终 `bun test tests/framework`：**退出 1，672 pass／1 fail，3533 assertions，58 files，42.63s**。唯一失败为下述 P14 已知缺陷；其余用例通过。完整输出 `.cache/ticket07-framework.log`。
- 最终 `bun run typecheck`：退出 0；包含 `check:authoring`，61 files／4 declarations／0 diagnostics。

对应覆盖：

- P7：`marker.test.ts` 验证共享 key `semantic-extensions`、`aboveEditor`、排序及无 UI 不写 widget；`feedback-harness.test.ts` 经 assembly 验证三种 severity、UI／stderr 单一输出渠道、State 记录和模型 contribution 中没有反馈文本。
- P7／P15：`viewed-marker.test.ts` 保留主／子 effective State、切换重新读取、Viewed 不授予 Owner 写权限；新增无 outlet 的 delivery-seat 分支，以及空 session id／伪层级 parent 不能恢复身份。
- P10／P14：queued native view callbacks 在取消订阅后不再发布，独立 binding 继续显示并能关闭自己的 marker；释放后的 native run 重新订阅这一子项未通过。
- P13：native outlet 抛出的同一个 Error 原样传播，仅一次失败读取；之后正常 publication 恢复。未增加重试、等待或回退。

### 已有缺陷及范围决定（未修复、未算通过）

复现：两 marker bindings 启动并启用 → `session_shutdown` → subscribers 从 2 降为 0 → 调用宿主仍持有的 `before_agent_start` → subscribers 回到 2；没有新增 widget 输出。`createViewedSession.watch` 原实现不检查 `viewedListeners.size`，context tracker 在迟到 native run 上重新记录 context，因而重新订阅。迁移前原文件具有相同逻辑；此次仅移动并重接 imports，未改此算法。

保留正常失败测试 `a native run arriving after release must not reopen Viewed-session subscriptions (P14, known existing defect)`，独立预期是 0，实际 2，不使用 skip／todo／expected-failure 把缺口计成绿色。建议另行授权在 watch 入口拒绝无 framework listener 的重订阅，并核对首次订阅及重绑顺序。Main 明确决定本票保持结构迁移范围，不纳入现存缺陷修复；因此本票未声明全部 P14 通过、未关闭合并状态。

### 本轮集成修复（2026-10-24）

本轮用户明确要求解决冲突并直接修复全局测试问题，覆盖此前“不修复既有 P14 缺陷”的实施范围决定。合并 `b38a209d0af48095b0ee7f39a94546677fa99330` 的文档冲突时，同时保留 OMP 的 native feedback／marker 路径和 Pi 的 native UI 路径。

`createViewedSession.watch` 现在仅在至少一个 framework listener 存在时创建 native subscription，避免释放后迟到 native run 通过 context tracker 重新订阅。既有公开 assembly 回归测试保留其 `0` subscriber 和无新增 widget 的独立预期，并去掉“known existing defect”说明；未修改错误传播、重试、等待或宿主契约。上方失败记录为修复前历史证据，不是当前结果；本轮全局测试结果在下方补录。

本轮全局验收命令均为 `bun run test`（未另跑 typecheck、复杂脚本或额外 smoke）：

- 第一轮退出 1，1635 pass／4 fail／10008 assertions，184 files，591.03s；日志 `.cache/ticket07-integration-global.log`。P14 已通过；失败为 panel snapshot 的 Bun fetch ConnectionRefused，以及 delegation 额外 effort judge 请求导致的三个请求计数差异（5→11、7→13、5→11）。
- 采用同轮已完成的共享 fixture 修复 `257d84b`＋`ec861fa` 的完整文件状态（本分支提交 `aad5f5f`）：panel SSE／snapshot 独立使用 `node:http`，delegation fixture 固定 task effort，保留原请求数预期及失败诊断。同步已有 README 和 02 证据，不修改生产 consumer 行为。
- 最终退出 **0，1639 pass／0 fail／10065 assertions，184 files，526.81s**；日志 `.cache/ticket07-integration-global-fixed.log`。测试源状态为 `aad5f5f`，包含 merge 解决 `45904bb` 和 P14 修复 `7ee3cc0`。其后只修改本票证据。
- 两轮使用 `HERDR_BOT_BINARY=E:/Developer/myhub/herdr-bot/backend/target/debug/examples/safe_shutdown_shell.exe`、`HERDR_BOT_METADATA=E:/Developer/myhub/herdr-bot/meta-data/bot-options.toml`，不使用日常 panel。与其他集成代理串行；最终释放给 04。

本票开发分支已完成本轮可执行验收，等待宿主排队合入 `dev`；未直接操作集成工作区。按 tracker 的 implemented＋tested＋merged 约定，合入前保留 `in-progress`，宿主合入后可关闭。H1、复杂脚本及跨票据整体验收仍交最后独立门禁，不将它们记为本轮通过。

### 再次回合并冲突处置（2026-10-24）

宿主将 `230e4e5931e858948f91f87067f6491e5479e4cc` merge 回本开发分支后，本轮保留 03／05 的 native lifecycle、context、session-manager、registry 和顶层 private port 迁移，并将 07 的 feedback／marker／viewed-session 依赖接到迁移后的同级 native 模块。`OmpUiContext` 仍仅在 `ui.ts` 声明并从公开入口直接导出；保留 P14 listener demand guard，没有恢复旧 domain／internal 路径。旧 `domain/context/events.ts` 已被合入 `native/extensibility/extensions/context.ts`，因此删除冲突残留，避免双实现。保留 02 的最终验收证据和 incoming panel Web Stream 类型转换修正。

按本轮要求未启动完整验收。必要定向验证：`bun run typecheck` 退出 0，authoring 61 files／4 declarations／0 diagnostics；随后 `bun test tests/framework/viewed-marker.test.ts tests/framework/feedback-harness.test.ts tests/framework/marker.test.ts` 退出 0，28 pass／0 fail／86 assertions，3 files。其后只调整 assembly 归属注释和本票证据。上轮全局结果仍为上轮源状态的证据，不冒称是本轮合并树的全局结果。等待宿主再次排队合入。

### S2 真实环境与结果

Windows x64，Bun 1.4.2；实际执行既有 isolated exact `@oh-my-pi/pi-coding-agent@18.5.0`，以及既有 `18.5.0-viewed-session` 冻结补丁安装。只在本 worktree `.cache/omp-baseline/` 建 junction 指向已有 `E:/Developer/myhub/my-agent-toolkit/.cache/omp-baseline/` 的两个目录；没有安装、修改或重新应用宿主补丁。patched materializer 走已有 manifest 的哈希核对／复用分支。正式配置、全局安装及其他 worktree 未修改。

实际命令：

```text
bun test tests/harness-dock/viewed-marker.test.ts tests/harness-dock/viewed-session-host.test.ts tests/codebase-tools/marker-lifecycle.test.ts tests/codebase-tools/command-toggle.test.ts tests/codebase-tools/startup-modes-dock.test.ts
```

退出 0，**14 pass／0 fail，177 assertions，5 files，24.50s**，完整输出 `.cache/ticket07-real-omp.log`。与其他代理昂贵运行串行，完成后已释放给 integrate04。

- 真实补丁 outlet：身份、model／effort／context 变更、unsubscribe、session switch 可读；同一 probe 在未补丁 baseline 上确认 outlet 缺失。
- 真实 Marker：两 marker 启用时为 `◈ followMarker`、`◐ noneMarker`，同一 framework widget；真实 child 运行后 Owner 的最终区域不被清空。RPC 不是交互式 subagent focus，未声称覆盖真实焦点切换。
- 真实 codebase-tools：默认 off、启用显示、enabled run 重申、关闭清除；命令反馈及自动／手动入口、恢复场景继续成立。模型流量仅到本地 capture，不是远程模型服务接通证明。

### 09／H1 交接

迁移前后的自动输出字面量相同：S1 Owner 为 `["◈ follow", "◐ none"]`，sub-follow 为 `["◈ follow"]`；无身份时清空；反馈为 `probe info`／`probe warning`／`probe error`，UI severity 保留、headless stderr 为三行且不进入模型上下文。迁移后真实 host 的 Marker／feedback 帧已由上述 S2 检查固定预期验证；本票没有采集迁移前真实 TUI 录像，前态仅来自迁移前 S1 基线及既有 dock 的独立输出预期。

可重复人工操作：使用已经存在的 patched CLI，不执行 materialize/install；按 `host-patches/omp-18.5.0-viewed-session/README.md` 既有人工流程加载两 marker fixtures，执行 `/marker-follow-toggle`、`/marker-none-toggle`，主会话应显示两行；focus 真实 child 只显示 follow，再返回主会话应恢复两行；在主会话关掉 follow 后重新查看 child 应清空。再用既有 `entrypoints/omp/codebase-tools.ts` 执行 `/codebase-tools` 两次，比较信息提示及 Marker 显示／清除，不应新增会话文本。无补丁环境只判断自己的 delivery-seat 行为，不声称支持交互式 Viewed-session focus。

H1 **未验证**：用户仍需在日常 TUI 比较可读性、位置、提示和真实 focus 切换体验；RPC 帧和受控分支不能代替用户确认。实施阶段的 P14 重订阅缺口已在本轮获授权修复，修复及全局结果见上；其他输出／交互语义未有意改变。开发分支已完成本轮冲突处置与全局验收，等待宿主合入后更新 closed；不能把分支全局绿色等同于 H1 或最后独立整体验收通过。
