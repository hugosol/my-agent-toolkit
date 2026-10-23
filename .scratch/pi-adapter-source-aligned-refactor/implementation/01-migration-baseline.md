# 01: 固化迁移清单与重构前验证基线

**What to build:** 为两个 harness 的来源对齐重构建立可复核、可执行的迁移分配与行为基线，让后续 ticket 能证明原有消费结果被保留，而不只是目录已移动。

**Delivers:** enabling: unblocks P1–P17

**Blocked by:** None (can start immediately).

**Status:** closed

## 契约与范围

以本 feature 的已批准 spec 和 contract 为权威，复用 S1 公开 assembly／消费 interface、S2 真实 harness、S3 接入完整性检查和 R1 结构审查。迁移清单是分析材料，不是第二份运行时能力注册表。本票不提前宣称任何 promise 完成，不实施新的公共 interface 或通用 provider 抽象。

- [x] 从实际 assembly、调用方及实际适配的上游契约建立完整职责清单，标明 native、Pi 的 pi-subagents 来源、必要 mixture、完整协议边界、共享状态和资源所有权。
- [x] 每个职责唯一分配给 02–07，包括原生类型、加载支持、模型目录／价格／访问事实；共享项也必须有明确 owner，不留给 08 兜底。列明布局敏感检查、生成设施、导航及受影响 extension。
- [x] 为每个实际受影响场景记录 harness、行为入口、输入、独立预期、观察 seam、唯一测试 owner、已有覆盖与缺口。P10／P13／P14 的路径内覆盖归 02–07，真正跨路径的组合用例归 09；同一用例不得重复认领。
- [x] 准备重构前有效的 State 样例及恢复／分支／后续写入预期，保存有效与无效用户配置样例；不得用新实现自写自读代替历史兼容证据。
- [x] 按既有测试分层策略执行适用基线检查与真实 harness 场景，保存重构前输出和可重复操作步骤；记录源状态、依赖、harness／provider／补丁版本、命令、退出状态及已知失败。
- [x] 明确 Pi 真实 provider 与两端真实子会话加载所需环境，区分受控替身证据和真实接通。缺失可选补丁环境作为验证缺口，不安装或修改 harness，也不阻塞其他可执行工作。
- [x] 复核每张迁移票可独立验证且适合单个 fresh context；若证据证明必须增添前置重构或拆分 04，提出具体职责和阻塞理由并请求调整票集，不静默缩减范围或创造兼容层。
- [x] 仅在真实实现前提存在时提出新增 blocking edge；共享文件冲突按集成 owner／执行窗口协调，不冒充逻辑依赖。

## 验证与交接

遵循仓库测试分层及共享工作树协调规则。分析与文档产物验证引用和覆盖完整性；行为基线必须实际运行并记录结果。发现既有语义缺陷单独记录并请求范围决策，不修成新预期、不记作通过。将迁移分配和场景账本写入本票执行记录，后续票引用它，不另建手工能力表。

## 执行记录 — 2026-10-24

本票只建立重构前的证据、职责分配及可重复步骤；**不宣称 P1–P17 已由重构兑现**，不修改运行时代码、宿主、业务预期或其他票据。文中的 owner 是后续唯一验收责任，不是新增能力注册表。未读取其他票正文；02–09 的标识仅来自文件名，职责依据实际源码及批准的 [spec](../spec.md)、[contract](../contract.md)。以下为原实现时点记录；当时保留 `Status: in-progress` 等待独立集成。现已确认首次合入提交可达并完成全局测试，票据关闭；本轮修复及验证范围见末尾独立集成记录。

### 执行方法与证据入口

先从实际 `PI_PORT` / `OMP_PORT`、公开入口、extension 调用和上游契约识别完整职责，再分配 owner、固化样例，最后按测试分层顺序执行基线。没有新功能或修复，因此没有人为制造 red，也没有新增私有测试 seam。S1/S2/S3/R1 均复用契约批准的观察面。

- [实际命令、开始/结束 UTC、退出码、环境差量及原始日志索引](01-baseline-artifacts/runs.json)。Windows 本地日期与日志 UTC 日期可不同；不改写日志时间。
- [外部 bundle、provider public protocol、真实 panel binary 与三份 frozen patch manifest 的精确路径/哈希](01-baseline-artifacts/environment-artifacts.json)，区分 npm pinned artifact 与用户配置选择的 artifact。
- [源状态与 524 个源码/测试/文档/配置文件 SHA-256](01-baseline-artifacts/source-state.json)：起点 `89bd2d72cd00813d4c219dcf6d33545a54d15363`，初始干净；所有行为检查期间运行源码和测试保持不变。只增加本票及其证据。
- [历史样例原文件、字节哈希及截取来源](01-baseline-artifacts/historical-artifacts.json)、[独立 State 预期](01-baseline-artifacts/state-expectations.json)、[有效/无效配置输入](01-baseline-artifacts/config-cases.json)。这些是冻结输入，不是新的运行时规则。
- 原始日志就在 `01-baseline-artifacts/`，不只保留成功摘要。该目录的局部 `.gitignore` 显式保留日志，局部 `.gitattributes` 禁止捕获文件换行转换，确保跨 worktree checkout 的历史字节及 SHA-256 不被 core.autocrlf 改写；不更改全仓规则。长期接口文档、ADR、支持状态本票有意不改：仍是旧实现，其切换随实际迁移发生。

### A. 实际来源与职责分配

下表路径均相对仓库。Pi 上游坐标省略 `packages/coding-agent/src/core/`；OMP 省略 `packages/coding-agent/src/`。坐标是适配契约的归属，不是要求复制上游目录；最终私有模块形状可由 owner 在这些边界内决定。

| ID / 唯一 owner | 当前实现及完整职责 | 来源坐标 / 迁移边界 | 共享状态、资源及消费方 |
| --- | --- | --- | --- |
| N02a / 02 | `adapters/pi/domain/control.ts`：注册命令、参数及 command delivery；`domain/prompt.ts`：before-agent-start、分支 contribution identities、返回隐藏持久消息 | native `extensions/types.ts` 的 registerCommand / BeforeAgentStartResult 与 `extensions/runner.ts`；消息身份、历史读取和追加协议一起审查，不改 native delivered role | 每 binding 订阅由 keepSubscription 持有；State 写入引用 N02b，不另建 State。codebase-tools、connect-bot、model-cost 的命令及 codebase-tools prompt |
| N02b / 02 | `piStateEntryType`、`piStatePayloadsOf`（`domain/session/queries.ts`）与 `domain/session/effects.ts`：`${definition.id}:state` 命名、分支有序读、appendEntry 写 | native `session-manager.ts` 的 custom entries / getBranch；读写归同一完整协议，不让生命周期迁移改变编码 | 一 binding 一 PiStatePersistence；当前值仍由 framework State 持有，不把配置或 provider registry 当 State。codebase-tools、connect-bot 的持久/内存字段 |
| N02c / 02 | `adapters/pi/domain/context.ts`：原生 context usage 收集；`domain/provider.ts`：目录价格、provider address / credential facts | native `extensions/types.ts` 的 context / ModelRegistry；`model-registry.ts` 及其 model-runtime；不是 pi-subagents provider | prices/access 一 assembly 一组，最新 registry 随每次 delivery 更新；价格请求开始时锚定、access 每操作新读；USD/百万 token、全零不当免费价格等现行含义不变。model-cost；context 观察供所有 session consumer |
| N02d / 02 | `adapters/pi/internal/text-imports.ts` 与 codebase-tools `harnesses/pi-assembly.ts` 的先装 hook 再加载 definition；Pi index 的公共 native 类型出口、PiAssembly/AdapterFactory 类型凭据 | native `extensions/loader.ts` / Node registerHooks；移动后重新核算 `../../../extensions/`，不把加载支持放通用 internal | `Symbol.for("my-agent-toolkit.pi.text-imports")` 进程一次、只处理仓库 extensions Markdown、Bun 跳过；不修改 Pi loader。所有 Pi assembly；实际 Markdown 消费方 codebase-tools |
| N03a / 03 | OMP `domain/control.ts`、`domain/prompt.ts`；`domain/session/queries.ts` 中 State payload / contribution identities 与 `domain/session/effects.ts` | native `extensibility/extensions/{types,runner}.ts`、`session/session-manager.ts`；与 Pi 分别保留各自 command/prompt/State 协议 | 一 binding 一 stateEntry，读写同 type；prompt 只追加，不改变历史/原生角色。三 extension，特别 codebase-tools |
| N03b / 03 | OMP `domain/context/{queries,events}.ts` 及 `domain/provider.ts`：latest context、onRecord 顺序、canAcceptInput、context usage、catalog prices、provider access | native extension context、`config/model-registry.ts`、`session/auth-storage.ts`；不归子代理，也不是 mixture | context tracker 每 binding；providerFacts 每 assembly；sinks 先于 onRecord listeners；`N/A` keyless credential 映射为空而非凭据，价格/访问缺失仍缺失。model-cost、connect-bot 及 viewed context 跟随 |
| N03c / 03 | OMP index 的公共 native 类型出口；`adapters/modules.d.ts` 的 `*.md` 和 loader 提供的 `@oh-my-pi/pi-utils` ambient surface | native `extensibility/extensions/loader.ts` / Bun text import；共享声明也有明确 owner，不留 08 找归属 | `modules.d.ts` 不创建新依赖，native escape hatch 不扩大；codebase-tools、connect-bot harness assembly |
| N04a / 04 | Pi `domain/subagent/queries.ts` 中 `PiAnchorReader`、`piSessionFileAnchors`、`piSpawnedRelationsOf`；`domain/session/queries.ts` 的 header / position / startup / Owner 身份 | **native** `session-manager.ts` 的 SessionHeader / parentSession 文件链接；从旧 Subagent 分类拆出，不能随整个文件移入第三方 | assembly 级固定 header cache、positions 的 spawned-session 集合；parent 是直接父，Owner 是最近 top-level，不按名称推断；不可读/环路仍 unavailable。所有生命周期/State/详情消费者 |
| N04b / 04 | Pi `domain/session/events.ts`、`turn.ts` 的 native 事实（provider require/release 编排另归 M04b；context usage 的完整映射仍归 N02c） | native `extensions/types.ts`、`agent-session.ts`：session_start/shutdown/info_changed、input、before/after_provider、message_end；session shutdown close-out 与 session end 的等待/顺序不可拆散 | activeOwner、endedSessions、reported-once diagnostics 每 binding；Turn outcome / session tracking 每观察路径；track 订阅在拒绝 binding 时也释放。codebase-tools State、connect-bot Session/Round、model-cost Turn/Round |
| T04a / 04 | Pi `domain/subagent/events.ts`：ready + correlated reply + ping 的整体协议 | **thirdParty/pi-subagents** `src/extension/rpc.js`；事件总线是 Pi 原生 transport，但 `subagents:rpc:v1:*` 的协议 owner 是第三方 | 一次 300ms 预算、ready/reply 二选一相关性、version/session/refusal 保留；订阅与 timer 结束后释放，不能新增重试。初始化结果及 operator diagnostics |
| T04b / 04 | Pi `domain/subagent/effects.ts`、`integration.ts`、`internal/provider.ts` 与 queries 后半：public export 解析、child requirements、liveness 发布/读数、一次 settle、session release | **thirdParty/pi-subagents** `src/api/required-child-extensions.js` → `src/shared/required-child-extensions.js`、`src/integrations/pi-web-session-liveness.js`；读写协议必须同源内聚 | child requirements 的进程 global Symbol 表按 session/token 聚合、同步 replace/rollback；liveness registry/version/table 同一 owner；integration 每 assembly 一次、session requirement 随本 session 结束释放。不要把注册成功当 child 已加载；影响 codebase-tools/model-cost |
| T04c / 04 | `domain/session/queries.ts` 内 `active_agent` marker 的定位/转义/最近 launch 解释 | **thirdParty/pi-subagents** 在 `src/runs/foreground/execution.js` 等 launch 路径写入的 marker；`getSystemPrompt()` 只是 native 读取出口，marker 不是 native 协议 | agentName 必须来自当前 spawned session 自身 launch；不得将普通 top-level 文档 marker、继承旧 marker 或显示名当 agent definition。model-cost 详情和 session observations |
| M04a / 04 | Pi `domain/session/round.ts`：native execution/outcome/quiescence 与 provider held work 的最终合成；session-facts 将 native identity/startup 与 T04c launch name 组合 | **mixture**：native agent_start/agent_settled/isIdle/hasPendingMessages + T04b `holds/clear/unread`；SessionFacts 同样组合 native facts 与 third-party name。native/thirdParty 不反向依赖 mixture | activity outcome 按 session 直到下次 start；成功 settle 才查 background，cancel/failure 不延长；已结束 session 不读 spent context；unread 不当 clear。最终 canonical deliveries 在此解释完，不退回 port。connect-bot/model-cost |
| M04b / 04 | Pi `domain/session/events.ts` 当前在 native start/transfer/shutdown 内调用 integration.requireIn/releaseSession，和 index 的 attach / refused binding releaseAll 接入 | **mixture** 中解释“这个 native session 的生命周期对应哪一份第三方 requirement”；native 事件事实与 T04b 注册操作各自归原来源，不把跨来源会话解释留到 port | 保留子会话也要求自己的 children、先 required/释放旧 session 再 delivery、shutdown 释放与 close-out/end 的相对顺序；binding 拒绝后清理。完整生命周期一起迁移，不按单事件拆目录或改变 process/binding 所有权 |
| N05a / 05 | OMP `domain/session/{events,queries,turn,round}.ts`：Session transition/rename、startup/Owner、Turn streaming/request/HTTP boundary、Round continuation/quiescence、input | **native** `extensibility/extensions/{types,runner}.ts`、`session/agent-session.ts`、`session/session-manager.ts`；`agent_end.willContinue` 与 Pi agent_settled 不强行统一 | activeOwner 每 binding；rename watch 每订阅；streamed usage/outcome 按 session；Round late-read idle/pending/async snapshot 保持；shared State 读写委托 N03a。connect-bot/model-cost；OMP 无 awaitable disposal outlet 的现状不补齐 |
| N05b / 05 | OMP `domain/subagent/queries.ts`：AgentRegistry direct parent/main ancestor、原生 integrated answer；Session 消费关系 | **native** `registry/agent-registry.ts`、`task/` 的实际 extension loading 与 SDK registry；不是第三方 provider，也不造 thirdParty/mixture 空目录 | registry 归宿主，adapter 不复制；停泊 session / 缺失父 / 环路均 unavailable。OMP child extension 实际加载、Owner follow、主/子会话隔离 |
| N06 / 06 | Pi `domain/{marker,feedback}.ts`：marker publish、notice/feedback 同通道、无 UI stderr；公开 Widget/Theme/Component 相关 native 类型 | **native** `extensions/types.ts` 的 ExtensionUIContext / widget/notify，而非机械放到 interactive-mode | widget key `semantic-extensions`、aboveEditor、空数组 clear；framework 才拥有全局 marker composition。UI types 还被 model-cost 自绘 widget 消费，不能收回公共出口；组件 dispose 原有行为保持 |
| N07 / 07 | OMP `domain/{marker,feedback}.ts`、`domain/session/viewed-session.ts` 和 queries 中 `viewedOwnerOf` | **native** extension UI contract；Viewed outlet 为 `host-patches/omp-18.5.0-viewed-session` 的可选原生变体，不是上游现有保证或第三方 | newest context 由 N03b 提供；每 binding viewed subscription，切换 context 先释放旧 subscription，最后 listener 离开释放；view 不授予写入 authority。三 extension 的 UI/marker，model-cost Viewed projection |

**原生类型归属也按职责切分，而不是重建 types/helper 杂物箱。** 当前两端 `internal/native.ts` 中 SessionEntry/Manager、模型目录及访问类型分别归 02/03；生命周期事件、Round/Turn/Input、关系类型分别归 04/05；Pi EventBus 是 Pi 原生 transport（04 迁移其 native 声明），provider 专属 answer/registration/liveness 类型仍归 04 的第三方协议；UI/Widget/Theme 类型归 06/07。`PiExtensionContext/Api` 和 `OmpSessionContext/Api` 是实际 extension native 契约的整体 facade，分别由 02/03 持有，引用各职责类型而不复制，也不为每个 hook 拆 facade。`PiExtensionFactory` / BindingResult / index 的受支持出口及 Pi 有/无 childEntry 的重载原样保留；02/03 是公共出口整合 owner，其他 owner 把类型归回本职责。

**assembly 与 protocol 不混淆。** `index.ts`、旧 `internal/port.ts` 是两份明确的顶层 assembly 职责：02/03 负责本端原有 process/binding 状态和类型契约不丢失，04/05/06/07 负责各工厂提供完整解释；08 是共享文件最后接线/搬迁/静态工具整合窗口，不是未分配 runtime 职责的兜底。Pi `subagentIntegration` 有 childEntry 才有成员；Pi viewed/sessionObservationAccess unavailable；OMP onDisposal/sessionObservationAccess unavailable，均不因布局更改。单个 module 的新位置不是新增公共 import。

### B. 迁移影响的检查、生成及导航

| 对象 | 已发现的敏感点 / 整合责任 |
| --- | --- |
| `scripts/integrations/generate.ts` | 目前新 adapter 路径硬编码 `internal/port.ts`（约 285/708 行），missing-delivery 提示也含 internal；不能只搬现有 adapter 而让生成器重新制造废弃布局。08 按实际顶层 assembly 模式迁移并调整 `tests/integrations/generate.test.ts` 的路径断言；不得生成占位实现 |
| `scripts/integrations/{supply,assembly}.ts`、`check-adapter-integrations.ts` | supply 查实际 defineAdapterPort/canonical delivery，非固定业务目录；保留具体 AdapterFactoryOutput witness，不能删需求/减遍历上限来过关。08 用六组合 S3 和 `tests/integrations` 验收；02/03 保证公开 witness，04/05 保证 delivery 调用链仍可解析 |
| `tests/framework/import-boundary.test.ts`、`tests/authoring` | 现有 import gate 不等于 native→thirdParty/mixture 方向已验证；08 补来源方向审查/适当约束，保留 native escape hatch。不得以目录断言替代 S1 行为 |
| 私有路径测试 | `pi-adapter-output`、`pi-child-extensions`、`pi-subagent-integration`、`pi-subagent-provider-path`、`feedback-{pi-,}harness` 直接导入旧私有模块；02/04/06/07 随职责更新 imports。它们的低层断言仅作辅助，不当作契约新批准的主 seam；不得为了摆脱旧路径删除公开消费断言 |
| 消费方 | `extensions/codebase-tools/harnesses/pi-assembly.ts` 有真实私有 text-imports 导入（02 必迁）；各 extension 的 harness assemblies 使用公开 native types、provider queries、三套 entrypoint/manual-auto；model-cost 自绘 UI 的 PiWidget* 等类型必须继续从公开 index 可用。无须更改用户配置路径、字段、entrypoint 加载方式 |
| 权威导航 | `docs/adr/0002-semantic-extension-framework.md` 的 domain-first / provider-not-primary 决定；`framework/docs/framework-capabilities.md` 的三根项规则及旧路径表；`framework/README.md`、root README、`capability-interface-architecture.md`、`harness-integration.md`、`integration-check.md` 的 assembly 示例、`harness-support.md` 的源码坐标；`DOCS-MAP.md` 路由若受影响跟随。08 整合跨文件导航，02–07 提供对应真实坐标；历史证据保留时点语义，不把历史路径改成“当时已迁移” |
| 支持/补丁设施 | `framework/docs/harness-baseline.json`、`tests/harness-dock/{baseline,host-patch-artifact,...}.ts`、三套 frozen host-patches 是基线/测试设施，不是 adapter 能力清单；不得为了本票更改支持版本、哈希或补丁。09 最终证据区分 source checkout / installed artifact / frozen patch |

### C. 场景账本（唯一测试 owner）

下面的 ID 是本次验收场景编号，括号 P 对应本契约；现有测试名里其他 feature 的旧 P 编号不自动等于本契约覆盖。`F`=01-framework 日志，`C`=02-consumers，`D`=16-dock-serial，`I`=04-static-integrations；引用文件指 `tests/` 下现存文件。既有私有 helper 测试在“缺口”中标明，不升级为 S1 主验收。

| ID / owner / harness | 行为入口与输入 | 独立预期、观察 seam | 已有覆盖 / 本次证据与后续缺口 |
| --- | --- | --- | --- |
| PI-CMD / 02 / Pi | 公开 assembly，manual codebase-tools `/codebase-tools` 两次；connect-bot directed/off；model-cost `/budget` | 不触发模型；true 后 false 的 State 与各自 command 输出；S1/S2（P4/P6） | C 中 command/control/action 消费断言；08-pi-codebase-node22、10-auto、11-model-cost。connect-bot 真实 Pi 端没有独立本次 S2 panel 全生命周期记录，09 若组合运行只认组合 ID，不重复此单路径 |
| PI-PROMPT / 02 / Pi | 同一 session off→on→连续两请求→off；Node loader 先装 Markdown hook | 首次 init 后 reminder，隐藏追加、旧 history 原样，关闭不删历史；请求 body/JSONL，S1/S2（P6） | `codebase-tools/{init,reminder}-injection`、08 日志；冻结 `pi-request-{before,resumed}.json`。移动 hook 后必须再用 Node 真实加载，不可只用 Bun |
| PI-STATE / 02 / Pi | 冻结 State before，重启、switch 到另一 session 再返回，随后 toggle | restore true、reminder 不重复 init、下一写 false；目标分支而非另一 session；S1/S2（P8/P10） | state-expectations 的 STATE-PI-*、08 日志；保留原始 JSONL，迁移后须读该历史输入，而非只跑新写新读 |
| PI-CONFIG / 02 / Pi | frozen startup/manual/auto 与有效/无效 extension budgets/configBaseDirectory | 原值生效、无效 binding 拒绝且无注册/外部请求；S1/S2（P4/P9/P13） | F config/startup-policy、C config/startup；08/10 的 process-first-default 与 persisted false 优先、11 的 storage config。公开 Pi assembly 的每种非法配置细分由 02 补足，不能只引用通用 config 测试 |
| PI-FACTS / 02 / Pi | 给定 model cost / provider URL、替换 credential；context 已知/缺失 | 精确 provider/model 匹配、价格锚定、当前 access、unknown 不造零；消费结果 S1/S2（P4/P5） | C model-cost pricing/provider 与 11 的本地账户响应；真实账户/真实模型服务不由 capture 证明 |
| PI-LOCAL-FAIL / 02 / Pi | 同路径两 binding；一非法配置/拒绝后重新正确 bind，再释放其中一个 | 另一 binding 命令/State 仍有效；已释放入口无后续效果；S1（P10/P13/P14） | F implementation-lifecycle/process-mode-reuse/same-name；既有跨框架测试不是 Pi 专有完整证据，02 在公开 assembly 验收其实际迁移路径 |
| OMP-CMD-PROMPT / 03 / OMP | manual/auto，toggle、连续请求与 off；同原生 loader | 同端原生 delivered role、追加 history、正确 prompt；S1/S2（P4/P6） | C codebase-tools 各场景通过，但 outbound-role 的 Codex 路径失败，见失败表；不将另一协议成功算失败路径通过 |
| OMP-STATE / 03 / OMP | 冻结 omp-state-before；新进程 resume、不同 identity branch/fork、同 identity tree | restore true；下一 toggle notice disabled、append false；同 identity 不 reseed；S1/S2（P8/P10） | F session.test 的 branch/fork/tree；C startup-recovery-dock；17 生成并实际恢复 frozen sample；09/D 实际 model-cost restart/tree/fork。OMP branch transcript未另冻结，S1 字面场景预期保存在 state-expectations |
| OMP-CONFIG-FACTS / 03 / OMP | startup/config budgets、storage root、model catalog、N/A credential、缺失 registry | 原字段原含义；拒绝无外部效果；catalog/request price 与 access 时间语义不变；S1/S2（P4/P9） | F/C/D 对应配置、provider、pricing；`storage-root.test.ts` 的 `<user-home>/.omp/cost-archive` 独立例。不能因 source 移动更改用户相对路径 |
| OMP-LOCAL-FAIL / 03 / OMP | 两 binding，binding 拒绝→再绑定，分别执行/释放 | 无 State/失败/cleanup 串扰；公开消费 S1（P10/P13/P14） | F implementation-lifecycle/process-mode-reuse/same-name；D binding-lifecycle。若 native consumer 模块重组影响未覆盖分支，03 补本路径，不转给 09 |
| PI-SESSION / 04 / Pi | native starts/replacement/rename，父文件→子→孙、缺失/环路、同名不同 id | 生命周期顺序；directParent 非 Owner；fork 新 main；unavailable 不猜；S1/S2（P5/P10） | F pi-session-facts、pi-round/turn-mapping；07-subagents 的实际 child identity、15-accounting；T04c 的 launch name 测试也在 pi-session-facts |
| PI-TURN / 04 / Pi | before/after provider + finalized assistant、无 usage、cancel/error | Turn request/HTTP/settled 顺序、同 session/round 身份；无 usage 不伪造成功计费；S1/S2（P5/P13） | F pi-turn-mapping；C model-cost；11/12 的真实消息及终止场景 |
| PI-ROUND / 04 / Pi | native settle 前自动 continuation；background holds→clear/unread；cancel/error 后迟到 result，再新 prompt | parent Round 跨 wake 保持一个；unread 不能 idle；cancel/error 不等 provider；late result 不开 Round；S1/S2（P5/P11/P13） | F pi-background-rounds/pi-round-mapping；12 terminal 17、13 background 15 项观察。依赖 provider 的解释必须在 mixture，不让 native 代码 import 第三方 |
| PI-PROVIDER / 04 / Pi | childEntry 有/无；无 bus/provider；ready/reply/version/refused/wrong session；非法显式 package root | disabled 与 none 与 registration/protocol/identity failure 区分；300ms 一预算无重试；诊断不进模型；S1/S2（P4/P9/P11/P13） | F pi-subagent-integration 的公共绑定消费；private provider-path/output 是辅助；07 的 no-provider/refused-entry 真实场景。精确 installed package 与 configured package 不同，见环境表 |
| PI-CHILD / 04 / Pi | codebase-tools + model-cost 必需子 entry，真实 foreground/background | launch evidence 必须列两 extension 且 child 自己交付/记账，拒绝 required entry 不伪装 no-subagent；S1/S2（P10/P12） | 07 32 项，08/10 follow，15 18 项；注册函数成功不是这些观察的替代品 |
| PI-RELEASE / 04 / Pi | 两 extension/session requirements，第二条拒绝/rollback、各自 release、shutdown 后 native callbacks/late results | 原 accepted snapshot 不丢；另一 binding 活着；释放后无新 delivery/写入/挂住进程；S1/S2（P10/P13/P14） | F public pi-subagent-integration 的 session/child/transfer release；private pi-child-extensions 仅辅助。07 实际 child end 后继续记账、主 disposal 后不写；14 close-out 版本检查仍失败不能全算通过 |
| OMP-SESSION / 05 / OMP | startup/switch/branch/tree/shutdown/rename 与嵌套 AgentRegistry | 同端事件顺序；不把 tree 当边界；parent/Owner 分开，parked/missing 不猜；S1/S2（P5/P10） | F session/session-events；D session-ownership-tree 含真实 child/grandchild、unviewed rename；09 同场景通过 |
| OMP-TURN-ROUND / 05 / OMP | streaming usage、before/after provider、willContinue、pending messages / async jobs；cancel/failure | request/HTTP/usage/settle 关联，continuation 不提前结束；cancel/terminal failure 原样传播；S1/S2（P5/P13） | F turn-facts/round/session-activity；D turn-facts/round-facts/activity-facts、consumer-regression cancellation/terminal failure |
| OMP-CHILD-RELEASE / 05 / OMP | 真实 child/grandchild 加载；child dispose 后 main 工作；两 binding 单独释放 | 原 child extension 能力/State Owner follow 保留，main 不被 child cleanup，释放不再交付；S1/S2（P10/P12/P14） | D session-ownership-tree、binding-lifecycle、startup-modes-loading；F owner-* 与 lifecycle。缺少原生可拒绝 child-load 的公开控制点时明确限制，不新造通用 provider seam |
| PI-UI / 06 / Pi | on/off + UI/no-UI + severity + 两 extension 共用 marker + disposal | 固定 marker key/顺序/aboveEditor，空行清除；notify severity 或 stderr，不入 context；另一 binding 不被清空；S1/S2（P7/P10/P14） | F feedback-pi-harness、extension-feedback、marker/module-duplication；08/10 marker/notice，11 model-cost widget。private transport tests 只是补充；P7-H1 尚未人工验收 |
| OMP-UI / 07 / OMP | UI/no-UI feedback、marker、两 binding；Viewed outlet 有/无、切换/invalid、unsubscribe 后更新 | view 只换投影不换 Owner，无 outlet 用 delivery；dispose 后回调停止、另一 binding 继续；S1/S2（P7/P10/P14/P15） | F viewed-marker / feedback-harness；D viewed-session-host/marker/total/test 覆盖 frozen patch 和 unpatched control；自动 RPC 不能替代真实 TUI focus 体验 |
| COMBO-OMP / 09 / OMP | 三 deployed consumer 同进程：分别 on/off、一个 panel register 被拒绝后恢复、cancel/terminal failure，另两个继续 | 命令、State、marker line、生命周期组合无串扰；S1/S2（跨路径 P10/P13/P14） | D consumer-regression（本票保存基线）；单个 control/provider/UI 拒绝或 release 场景仍分别由 03/05/07 验收，不重复认领 |
| COMBO-PI / 09 / Pi | real child integration 与 prompt/UI/State/计账一起，主/子及跨进程恢复 | 组合中 follow、请求贡献、child 加载及本身计账同时成立；S1/S2（跨路径 P10/P12/P13/P14） | 07/08/10/15 是可复用基线输入；04 独占 provider/child/round 协议本身；02 独占 State/prompt，06 独占 UI。09 对三消费者完整 Pi panel 组合仍有缺口，不把 OMP 组合迁移为 Pi 通过 |
| STRUCT / 08 / 两端 | 三 extension × 两 adapter 实际 assembly，childEntry 条件；生成 dry-run/新目标 | 所有 required provided，optional 语义不变；真实来源/依赖/单实现；S3/R1（P1–P3/P16） | I 六组合 complete true，82 integration/authoring tests；迁移后 source position 可变、需求不可缩减。结构完整不等于 provider runtime 可达 |
| HANDOFF / 09 / 两端 | 所有自动工作后将版本、命令、前后输出和失败交用户 | H1 单独待确认，不提升支持状态、不吞已知失败；S2/S3/R1（P7/P17） | 本票提供 pre-refactor 输出与下面步骤；post-refactor 和 H1 均未发生 |

**TDD 当前场景设计约束：** State 的独立预期来自命令语义及已记录 true；合理违规是错误恢复为默认 false，下一 toggle 的 notice 与 appended payload 可区分；Round 的违规是把 holds/unread 当 idle，持有 background child 且观察 parent Round 边界能区分；release 的违规是共享注册全清/订阅残留，必须释放一份后继续驱动另一份及旧入口才能区分。未来新增测试只在 S1/S2/S3 编写，不以 cleanup 调用次数或新实现自写自读作证明。

### D. 冻结 State 与配置的使用

- Pi 的 `pi-state-before.jsonl` 是 **08 稳定 Node 运行**所得原始文件到第一次已完成 assistant 的完整行前缀，保留原 id/parentId/timestamps/内容；原完整文件是 `pi-state-after.jsonl`，manifest 同时保存原哈希及 selection。它不是手写模拟 session；`pi-switch-target.jsonl` 与 `pi-switch-other.jsonl` 也为原字节。父文件路径指向原临时环境，重放 top-level 样例时不需要 provider；重放 ancestry 场景仍应按 fixture 的 parent 链复制整组。
- OMP 的 `omp-state-before.jsonl` 在首次真实进程停止后立即保存，17 随即用另一个真实进程 `--session <原文件>` 恢复、追加 reminder、toggle off，再保存 `omp-state-after.jsonl` 与原 UI frames。命令全文在 runs.json，断言字面量为 `[{"enabled":true},{"enabled":false}]` 与 `codeBaseTools disabled`。它证明**重构前样例有效**；迁移后还须输入冻结 before，不能拿 17 的旧成功替代兼容回归。
- 每端后续写入都沿用 `codebase-tools:state`，不引入迁移标记。branch/fork 与同 identity tree 的独立预期及已有覆盖分别在 state-expectations；不伪称有未捕获的 OMP branch 原始 transcript。
- 五份 `config-*.yaml` 是原字节副本，包含 framework runtimeDir/http/pi.subagents、两消费者配置及 manual/auto startup 文档；解释相对路径时必须使用**原配置位置**，不能按证据目录解释。`config-cases.json` 保留非法结构、0ms、字符串 boolean、坏 YAML 与合法输入。它不含真实 secret，也不修改正式配置。

### E. 本次实际运行结果

所有命令从此 worktree 运行；贵重运行串行，已向 Main 申请独占窗口。详细 argv/退出码以 runs.json 为准；首次安装只执行项目 `bun install --frozen-lockfile`（14 packages，exit 0）。consumer suite 自带的 ensureIsolatedHarness 在本 worktree 首次物化未打补丁 OMP 18.5.0；这不是修改已安装宿主或正式配置，**未执行任何 patch install/apply**。后续补丁测试只将此 worktree 的 ignored cache prefix junction 到已有 frozen artifact，见 [cache-links](01-baseline-artifacts/cache-links.json)，先确认 manifest 存在，再走只读复用分支；未操作集成分支的源码或配置。

| Run / 实际命令 | exit / 实际结果 | 证据级别 |
| --- | --- | --- |
| 01 `bun test tests/framework` | 0；657 pass / 0 fail，57 files，3443 assertions | S1 + 辅助结构/私有测试，非全仓 |
| 02 `bun test tests/model-cost tests/codebase-tools tests/connect-bot` | **1；744 pass / 2 fail**，85 files，4467 assertions | consumer 分区含真实 OMP 场景和真实 panel；失败完整保留 |
| 03 `bun test tests/integrations tests/authoring` | 0；82 pass / 0 fail，8 files，566 assertions | 静态工具及生成设施 |
| 04 `bun scripts/check-adapter-integrations.ts --json` | 0；六组合 complete true，均 0 diagnostics | S3 only；behaviorTestsRun false |
| 05 `bun run typecheck` | 0；tsc + authoring（61 files / 4 declarations / 0 diagnostics） | 类型/authoring，不是行为 |
| 06 `bun scripts/pi-codebase-tools-smoke.ts --keep`，默认 Node 24.18 | **1；34 checks 后退出断言失败，子进程 exit 9 / UV_HANDLE_CLOSING** | 真实 Pi，失败非通过 |
| 07 `bun scripts/pi-subagent-smoke.ts --expect-pi-version 1.4.0 --keep` | 0；32 observations | 真实 Pi + 实际 third-party extension；本地模型 capture |
| 08 `bun scripts/pi-codebase-tools-smoke.ts --keep`，PI_NODE=Node22 | 0；78 checks / 6 isolated runs | 真实 Pi manual、history、State、child follow |
| 09 `bun test` 的四文件：session-ownership-tree、session-recovery、binding-lifecycle、consumer-regression | 0；12 pass / 0 fail，215 assertions | 真实 OMP native 路径；与 D 有重叠，是阶段基线，不累加算独立覆盖 |
| 10 `bun scripts/pi-codebase-tools-smoke.ts --mode auto --keep`，Node22 | 0；62 checks / 4 isolated runs | 真实 Pi auto / persisted priority / child follow |
| 11 `bun scripts/pi-model-cost-smoke.ts --keep`，Node22 | 0；100 checks / 28 isolated runs | 真实 loader/widget/commands、受控账户响应；非真实余额 |
| 12 `bun scripts/pi-terminal-round-smoke.ts --expect-pi-version 1.4.0`，Node22 | 0；17 observations | 真实取消/terminal failure/late result/resume |
| 13 `bun scripts/pi-background-round-smoke.ts`，Node22 | 0；15 observations | 真实后台 child、Round wake/held work |
| 14 `bun scripts/pi-close-out-smoke.ts`，Node22 | **1；10 observations held，1 required fact missing：固定版本期望 1.2.0，实际 1.4.0** | close-out 行为被观察，整命令仍失败；没有给它编造 version override |
| 15 `bun scripts/pi-session-accounting.ts --expect-pi-version 1.4.0`，Node22 | 0；18 observations / 0 required facts missing | 真实跨进程 child own save 与 restart tree |
| 16 `bun test tests/harness-dock`（串行） | 0；130 pass / 0 fail，32 files，1422 assertions | 真实 OMP + frozen optional patch、基线/lock 校验；不是 Pi 或真实模型服务认证 |
| 17 `bun.exe --eval <runs.json 内完整命令>` | 0；真实 OMP before/restore/after 与 notice 字面断言通过 | S2 历史 State 有效性及后续写入原始材料 |
| 18 / 19 文档及 frozen evidence 校验（命令全文在 runs.json） | 18 的校验命令字符串转义错误，exit 1、未开始断言；仅修正校验命令后 19 exit 0：9 个链接、14 份 immutable artifacts、524 源文件未变、18 个 runtime allocation rows、10 配置用例、两端 State pairs 均通过 | 文档引用/覆盖分配与历史字节一致性；非新的行为测试或忽略产品失败 |

I 的关键可选状态也已冻结在 JSON：Pi viewed/sessionObservationAccess unavailable；OMP viewed provided 只是结构声明，onDisposal/sessionObservationAccess unavailable；model-cost Pi closeOut.remaining conditional，OMP unavailable；有 childEntry 的两个 Pi 消费方 loading 为 provided。不得为了布局把这些状态改为强制可用或去掉需求。

### F. 环境、已知失败与验证限制

| 项目 | 本次观察到的精确状态 / 可重复前提 |
| --- | --- |
| OS / 工具 / dependencies | Windows x64、Bun 1.4.2；默认 Node 24.18.0；稳定 Node `D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe`。bun.lock SHA-256 `28ce4c0d7b7d1d45a44e335a6647b0959c333875af42ca87ba63c87bcf4c2168`；repo dependency pi-subagents **0.78.0** |
| Pi harness | 已有 `D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`，实际 **1.4.0**；不是脚本历史默认 1.2.0。源 checkout `E:/Developer/myhub/pi` @`36be9c612e64082a4f0d4d0a94706c38ecbc20a1` 是对照源码，不声称与 installed bundle 字节相同 |
| 第三方 artifact 与配置 | smoke 显式加载本 worktree `node_modules/pi-subagents/index.js` **0.78.0**；**原 framework/config.yaml 却显式指定 `C:/Users/hugos/.pi/agent/npm/node_modules/pi-subagents`，实为 0.80.0**。因此本次证明的是这一精确组合下的真实 extension/child 接通，不声称纯单一 0.78.0 module/config 组合。04 的纯单 artifact 验证应在隔离 deployment copy 将配置指向实际加载的 package；绝不修改用户正式配置或把不一致静默 fallback |
| OMP harness | 隔离 artifact `@oh-my-pi/pi-coding-agent@18.5.0` / Bun；fixed anchor @`9348320cc4a30a7195d36a1f05a6c11bcb701a17`。当前源码 checkout @`611c189fa2f6b8c9b368559ea6b98062b9b54539` 不是运行目标；D 的 baseline 测试校验固定 anchor 与 artifact，不以当前 checkout HEAD 冒充 |
| optional native patches | 已有 frozen `18.5.0-viewed-session`、`18.5.0-codex-response-boundary`、combined prefixes 经 cache junction 只读复用；D 校验 frozen post-patch bytes 并执行相关场景。Viewed patch manifest SHA `66195465cc0c56c7726d9475e376c86a7632f1a062318b5cbe296526cf96602b`；此环境**不缺补丁**，但新机器缺失时保留验证缺口，不补装、不阻塞其他路径 |
| 真实 provider 与 child 前提 | Pi CLI 与 compatible Node、同进程显式 `-e <provider index.js>`、assembly `childEntry` 指向实际存在的 harness entry、public required-child export、可用临时 agent/session/home、local access runtimeDir；provider package 可解析不等于 extension 已加载。OMP 则用原生 task/AgentRegistry 和显式 source entry，D 的真实 child/grandchild 已接通。均未调用真实付费模型服务 |
| 既有失败 A | `tests/codebase-tools/outbound-role.test.ts` Codex `prompt_result h2` 等 120000ms 超时，child stderr DOMException TimeoutError；不是早前文档里的固定五项 TOML 错误。原 stderr/argv 保留在 02-consumers.log，未重跑“确认”、未改 assertion 或降级为通过 |
| 既有失败 B | `tests/connect-bot/history-interop.test.ts:39` 期望真实 herdr-bot stderr 含“安全壳”，实际只启动正常 panel 输出；无 HERDR_BOT_BINARY override，本次 suite 使用现有外部 binary。此 assertion 失败不等于可删；需独立范围/环境决定 |
| 既有失败 C / D | 06 的 Node24 libuv exit9 与 14 的 version assertion；08 改用文档已验证 Node22 属于**不同环境**，不能覆盖/抹除 06。14 无已知 version override，10 个行为观察仍不把整命令算成功 |
| 未执行/未证明 | 没有运行统一 `bun run test`，未宣称全仓绿色；已运行各相关分区。无真实模型服务、真实账户额度、Pi 三消费者 panel 完整组合、用户日常 TUI H1。受控 ready/version/identity/release 测试不证明所有真实 provider 版本；源码 inspection 也不是 runtime。未提升任何 support status |

已将 A/B 原始失败及不更改语义的范围决定请求交给 Main；本票保存基线，不修既有语义/外部故障，不把它们改成新的成功预期。C 使用稳定 runtime 的适用路径继续验证；D 保留版本不匹配。上述非阻塞缺口不妨碍交付迁移清单与有效历史输入。

### G. 重放步骤与 H1 前置材料

1. 在后续 ticket 的独立 worktree 从上述源起点/集成后的源运行。按 `docs/agents/testing.md` 先协调 quiet window；项目 dependencies 使用 frozen lock。先确认已有 exact harness/patched prefix，不安装或修改缺失可选补丁。
2. PowerShell：`$env:PI_NODE='D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe'`；可显式 `$env:PI_CLI='D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'`。按 E 的 Pi 命令逐条运行，支持 expectation 的三个脚本明确传 `--expect-pi-version 1.4.0`；其他脚本不发明此参数。保留每次 exit/stderr，即使大部分观察通过。
3. OMP 按原 baseline materialized prefix 运行 owning dock 场景及 consumer 分区。当前只读 frozen cache 的三个 junction 来源在 cache-links.json；新机器没有对应 artifact 只能记录相关场景未验证，不将 unpatched 成功当 patched 成功。新环境需原 baseline anchor/oracle 对照才能重做字节/lock 检查。
4. 将冻结 State **before** 复制到该 run 的隔离 session 目录，通过现有 S2 driver `--session <copy>` 加载；驱动一个请求再 toggle，检查 state-expectations 中的固定 notice/payload/identity/history 预期。branch 对照使用 frozen target/other 和 S1 已批准 native surface；不覆盖 frozen 文件。runs.json 的 17 完整命令可复现旧源采集流程，但迁移后的兼容验收应改为读取冻结 before，不再先生成自己的输入。
5. H1 的 pre-refactor 输出：08/10 的 marker/notify/history 检查、11 的 widget 内容检查、D 的 viewed marker/total/host observations，以及 `omp-state-frames.json` 中实际 UI frames。用户最终在同版本、同 startup mode、同三 extension 加载集合下先执行 codebase-tools on/off、connect-bot on/off、`/budget detail`；观察 marker 行出现/消失及 info/warning/error 是否重复/串行错位，再在有 Viewed outlet 的 OMP TUI 切换 main/child/另一 main、返回，确认只换投影不换 Owner 或激活；对 Pi 只验实际可用 delivery-position 投影，不要求不存在的 viewed outlet。记录终端宽度、版本/patch、操作与截图/日志、前后差异并交用户确认；本票**没有**代做/签署 H1。

### H. 票集可执行性与集成边界复核

- 02/03 各自围绕 native command/prompt/State/目录访问；04 围绕 Pi native 生命周期、third-party 整协议及必要 mixture；05 是 OMP 自身生命周期与 registry；06/07 是各端原生 UI/可选 viewed。每张都有上述公开消费场景和对应 owning tests，不需要先设计新 interface。
- 04 内容确实最多，但已有 `PiSubagentIntegration` 的 attach/require/settle/background/release 边界、native anchor reader 与明确 mixture 输入，可以按 PI-SESSION → PI-PROVIDER → PI-ROUND 的纵切执行；本次证据没有证明必须拆 04 或增添前置抽象。若执行中某个承诺无法在 S1/S2 观察，报告具体边界冲突再请求调整，不能自行改成 helper 测试或缩掉 child/失败场景。
- `internal/native.ts`、`internal/port.ts`、index 与 `domain/session/queries.ts` 有多个 owner 接触：公共 facade/State 协议 02/03 持有，生命周期/launch 协议 04/05 持有，view/UI 06/07 持有；共享文件由 08 的整合窗口收束各职责实际导出，最后清除旧路径。文件冲突是执行窗口协调，**本次未新增 blocking edge**；仅有真正缺实现输入才能新增逻辑依赖。
- 08 不承担任何遗漏的 runtime responsibility，09 不接管路径内的 P10/P13/P14；09 只负责 COMBO-*、最终全范围实际命令、证据分级与 H1 交接。
- 本票原实现仅提交这份执行记录与其 frozen artifacts，不触碰其他票或工作流报告、不合并 dev、不 reset。后续独立集成应保留失败表及环境差异，按仓库规则合入后再关闭票据。

### I. 独立集成验收 — 2026-10-24

- 当前开发分支已同步首次集成提交 `f5c0fed617097aecae74d5a4ed2560958656ab11`；其父为 `89bd2d7` 与实现提交 `68030a9`，两项 `git merge-base --is-ancestor … HEAD` 均 exit 0。接管时工作区干净，无待解决冲突；未切换分支、操作集成工作区、创建 worktree、reset 或调用 retro。
- 首次 `bun run test`：1614 pass / 1 fail；唯一失败为 `history-interop.test.ts:39` 的“安全壳”前提。未删除断言，也未对真实关机后端发送监控请求。使用 fixture 既有 `HERDR_BOT_BINARY` override 指向现成 `E:/Developer/myhub/herdr-bot/backend/target/debug/examples/safe_shutdown_shell.exe`；源码中的 `RecordingPowerOff` 只记录动作，不调用系统关机。不构建、安装或修改外部宿主。该环境修正不覆盖 F 中历史失败。
- 第二、三轮全局测试均为 1614 pass / 1 fail / 1 error：`subagent-runtime.test.ts` 分别在恢复后保存及单 activity 保存等待中超过原有 5000ms。第二轮期间其他票报告真实 smoke 与本轮重叠；第三轮同类失败仍存在，不能仅归咎于负载。
- 集成修复仅将该测试 `savedDocument` 的同步 `readFileSync` 热轮询改为 `await readFile`，把真实文件读取交还异步 I/O；没有加入固定 sleep、延长 deadline、修改独立预期或生产行为。修复针对 Windows 原子写入与同步轮询的争用假设；根因归属仍是推断，不将一次通过夸大为竞态已穷尽证明。
- 修复后 `bun test tests/model-cost/foundation/session/subagent-runtime.test.ts`：10 pass / 0 fail，66 assertions；`bun run typecheck`：exit 0，authoring 61 files / 4 declarations / 0 diagnostics。
- 最终全局命令（PowerShell）：`$env:HERDR_BOT_BINARY='E:/Developer/myhub/herdr-bot/backend/target/debug/examples/safe_shutdown_shell.exe'; bun run test`。Bun 1.4.2：**1615 pass / 0 fail，9924 assertions，182 files，536.70s，exit 0**。源状态为 `f5c0fed` 加本节所述测试读取修复；验证期间本工作树运行源码及 fixture 未变，随后只更新本票文档及状态。
- 原始完整日志由本轮宿主临时目录 `C:/Users/hugos/AppData/Local/Temp/hyper-auto-coding-wrg8O7/` 保存：`integrate-01-global-tests.log`、`integrate-01-global-tests-safe-panel.log`、`integrate-01-global-tests-safe-panel-final.log`、`integrate-01-global-tests-async-poll.log`。日志经 PowerShell Tee-Object 捕获，终端错误流格式及中文编码显示可能受宿主影响；结果以 Bun 计数及进程退出状态为准。
- 本轮按指派未额外运行复杂脚本、独立实机 smoke 或跨票据整体验收；全局脚本本身包含的 dock 测试不等于后续跨票据门禁已经执行。H1、真实账户与支持状态限制仍按原记录保留。首次合入已完成，本轮修复提交由宿主排队再合入，不直接合并 dev。

