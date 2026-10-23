# 06: Pi Marker area 与反馈路径迁移

**What to build:** Pi extension 的 Marker area、Extension feedback 和既有 delivery-position 投影继续呈现正确输出、State 与会话身份；映射按实际使用的原生 UI 契约组织。

**Delivers:** P7（Pi 自动化与真实运行覆盖）；P10、P13、P14（Pi UI／投影路径的适用覆盖项）

**Test owner for:** P7 的 Pi 输出／身份／投影／有无 UI 用例；P10、P13、P14 的 Pi UI 路径独立用例。跨路径组合用例及 H1 交接由 09 拥有，H1 结论由用户确认。

**Blocked by:** 01: 固化迁移清单与重构前验证基线。

**Status:** in-progress

## 边界与覆盖

遵循本 feature 的 spec／contract 与 01 分配，经 S1／S2 观察。使用既有 Session 身份和 Owner 契约，不因其内部迁移尚未完成而人为阻塞。只调整 adapter 映射，不改变 extension 业务输出或为 Pi 新增 Viewed-session outlet。

- [x] 按实际消费的原生 UI 契约归置 Marker area 与反馈；不因最终 TUI 执行位置不同而建立错误来源导航，不创建转发层。
- [x] 通过公开 assembly 验证 Marker area 输出、实际会话身份、有效 State 投影、反馈严重级别和有／无 UI 分支，保留既有输出渠道与模型上下文隔离。
- [x] 保持现有 Viewed-session outlet 不可用时的 delivery-position 投影行为，不能凭显示名称推断 Owner 或创造身份。
- [x] 验证本路径适用的多 binding 投影／输出隔离、既有错误传播、释放后订阅及迟到回调停止；另一有效 binding 的 UI 继续运行。不存在的等待或取消机制不新增。
- [x] 迁移相关调用方和类型，保留共享 Marker area 与资源所有权，删除被替代实现及兼容转发，更新直接导航。
- [x] 执行适用真实 Pi harness 场景并保存输出；记录环境／版本、重构前后输出、可重复操作步骤、自动检查结果及已知差异，交给 09 汇总 H1。
- [x] 用户日常 TUI 的体验判断保持 human-led；自动输出检查和真实非交互运行不能冒充 H1 通过，H1 也不能替代底层自动检查。

## 验证与交接

迭代运行受影响测试及 TypeScript 类型检查；完成时运行拥有分区、受影响消费方和适用真实 dock／smoke。用独立字面量和既有消费契约断言输出，不从映射实现重算。记录命令、结果、源状态和验证限制。不要等待 H1 才完成可执行自动工作。UI 路径内的独立用例归本票；跨命令／生命周期／UI 的同一组合用例唯一归 09。

## Implementation and acceptance evidence

实现及本票可执行验收完成，等待独立集成。`Status` 暂留 `in-progress`：仓库规则要求实现、测试且**合入**后才设为 `closed`；本执行未操作 dev 工作区或自行合入。

- 原生 UI 映射集中为 `adapters/pi/native/core/extensions/ui.ts`，来源是 Pi `core/extensions/types.ts` 的 ExtensionUIContext，而非最终 TUI 执行位置。保留反馈、框架 warning 与 Marker transport 的原有行为；删除旧 `domain/feedback.ts`、`domain/marker.ts`，迁移全部当前调用者与辅助测试 import，更新 framework-capabilities 直接导航。UI／Widget／Theme／Component 类型已位于 `native/core/extensions/types.ts`，无需再拆分或转发。
- P7：`tests/framework/pi-marker-feedback.test.ts` 经公开 `piAdapter` assembly 验证固定 widget key `semantic-extensions`、`aboveEditor`、按 extension id 排序、空区 clear、恢复有效 State、同名但不同实际会话、原生身份缺失时不造 Owner、子会话 delivery-position 的 follow/default 投影；覆盖 UI／noUI 三种 severity、通知不写入历史且不生成模型 contribution。原生 parent session 文件的 id 与文件名刻意不同；没有增加 Viewed-session outlet。
- P10：同文件 `shares one ordered area…` 与 `keeps same-extension bindings…` 验证两 extension 共区、相同 extension 的独立 loader bindings 使用各自实际会话 State，反馈与输出互不污染。
- P13：`propagates the native widget and notification failures unchanged` 断言 widget 和 notification 原生失败保持同一 Error 实例。未增加等待、重试、取消或超时机制。
- P14：`stops released and late UI deliveries…` 在真实公开 shutdown 释放后驱动正常注册及保留的迟到原生 callback，观察无新增 widget、反馈或持久化；另一有效 binding 仍能 render、toggle、notify。共享 Marker area 与 framework 资源所有权未改动。
- 原有 `feedback-pi-harness.test.ts` 三个用例继续通过；其直接 transport 辅助断言不是 S1 主证据。

### Actual verification

可重放 argv、时间、exit status 在 [06-pi-ui-artifacts/runs.json](./06-pi-ui-artifacts/runs.json)，完整输出位于同目录；源状态与环境见 [environment.json](./06-pi-ui-artifacts/environment.json)。测试源为父提交 `921de1d861cc78797e758f7ddc01a3413e19fb54` 加本票提交内容；测试期间源和 fixtures 未改。昂贵检查在 integrate05 释放窗口后顺序执行，结束后交回 integrate05 的 targeted diagnostic／07。

| 命令 | 实际结果 | 输出 |
| --- | --- | --- |
| `bun test tests/framework/pi-marker-feedback.test.ts tests/framework/feedback-pi-harness.test.ts` | 11 pass / 0 fail，60 assertions | `01-focused-ui.log` |
| `bun run typecheck` | exit 0；authoring 61 files、4 declarations、0 diagnostics | `02-typecheck.log` |
| `bun test tests/framework` | 676 pass / 0 fail，59 files | `03-framework.log` |
| `bun test tests/codebase-tools tests/model-cost` | 578 pass / 0 fail，63 files | `04-consumers.log` |
| `bun scripts/pi-codebase-tools-smoke.ts --keep` | Pi 1.4.0；78 checks / 6 isolated runs，exit 0 | `05-pi-codebase-manual.log` |
| `bun scripts/pi-codebase-tools-smoke.ts --mode auto --keep` | Pi 1.4.0；62 checks / 4 isolated runs，exit 0 | `06-pi-codebase-auto.log` |
| `bun scripts/pi-model-cost-smoke.ts --keep` | Pi 1.4.0；100 checks / 28 isolated runs，exit 0 | `07-pi-model-cost.log` |

实机三条命令均设置 `PI_NODE=D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe`（Node v22.19.0），使用 Bun 1.4.2、Windows x64、已安装 Pi 1.4.0；child follow 使用仓库锁定的 pi-subagents 0.78.0。未修改正式配置、安装补丁或使用真实账户凭据；模型请求和账户回答来自既有 local capture fixtures。

与 01 基线提交 `68030a9` 的 `08-pi-codebase-node22.log`、`10-pi-codebase-auto.log`、`11-pi-model-cost.log` 比较：按序提取的全部成功检查输出分别为 78/78、62/62、100/100，逐行一致，无新增／删除。见 [baseline-output-comparison.json](./06-pi-ui-artifacts/baseline-output-comparison.json)。运行根路径不同；日志将 stdout/stderr 分别捕获再拼接，因此 kept-root 行的相对显示位置可不同，不是 UI 行为差异。保留根目录见各 smoke 日志，便于检查实际 session journals、capture 与子会话 launch records。

TDD：行为保持型迁移，先为既有行为增加 S1 覆盖并确认通过，再移动实现；没有为制造 red 修改业务语义。首次运行缺少 worktree 的 yaml 依赖，执行 `bun install --frozen-lockfile` 后原反馈基线 3/0。初始新测试暴露两处 fixture 条件问题：子会话 start 不拥有 State transition，改为其 enabled run 观察 publication；独立释放应使用各 loader evaluation 创建的独立 assembly，而不是共享一个 factory 的 implementation lifetime。预期 follow/default 和独立释放结果未改变。TypeScript 首次拒绝测试的 `Array.at`（项目 lib 不支持），改为索引后 typecheck 通过。没有修复或掩盖已有生产行为缺陷。

### H1 handoff for 09 — unverified, human-led

自动结果仅证明 S1 行为与真实 RPC 的 setWidget／notify 接通，**不表示日常 TUI 体验通过**。用户尚未确认 H1。

可重复操作：

1. 保持日常 Pi 的原有 extension／provider 配置；记录 Pi、Node 版本及当前 manual／auto entrypoint。不要同时加载同一 extension 的 manual 和 auto 版本。先对照上述基线日志与本次日志的同名 phase。
2. 在新主会话观察 manual 默认无 Marker，执行 `/codebase-tools`，确认 `◈ codeBaseTools` 在既有区域、启用反馈出现；再执行一次，确认关闭反馈且区域清除。auto 模式新启动应直接显示其原有启用行，没有伪造的启用通知；命令仍能关闭／开启。
3. 在已启用的会话发起普通请求，确认 Marker 与原有显示一致；新建／恢复另一实际会话，确认各自记录的有效 State 与反馈不混用。按原有可用方式查看实际 child 会话并比较原有体验；Pi 没有 framework Viewed-session outlet，不要求新增按名称推断的 focus 投影。
4. 同时保留日常 model-cost 显示，观察其 widget 与 Marker 共存及反馈可读性；按日常接入模式执行 `/budget` 与非法参数，比较原有帮助／拒绝通知。没有 provider 的 RPC 场景已自动验证 `/budget detail` 的既有 no-subagent notice，但这不能替代有 provider 日常模式的体验判断。
5. 将观察、显示问题与当前会话身份／模式交给 09 汇总；用户确认前 H1 保持未验证。

已知验证边界：真实 smoke 使用 RPC，不是交互 TUI；noUI 的完整 severity／无 widget 分支由 S1 控制宿主事实验证。脚本预期最初写于 Pi 1.2.0，实际此次及基线均为 1.4.0，日志明确记载；不提升支持声明。Node24 的已有 Windows/libuv 退出问题不由本次 Node22 成功覆盖。账户 fixture 不证明真实余额／额度，定时 redraw 与 child 时长等脚本明示限制未扩张为通过。共享同一个 piAdapter factory 的 bindings 共用 framework implementation lifetime，不宣称它们具有独立 loader assembly 的释放语义；已向 Main 明确此区别。

集成提示：04 将 session/turn 移到 `native/core/extensions/`、round 组合移到 `mixture/` 后，应保留本票 ui.ts 的直接 import，删除旧 domain transport 路径，不建立兼容转发；本票基于当前可用 Session／Owner 契约完成，没有依赖其路径先迁移。全仓最终集成验证由独立集成代理负责。
