# 08: 完成来源组织、公开 assembly 与接入完整性收口

**What to build:** 维护者能从两个 harness 的实际 assembly 追踪映射的真实来源，消费方继续使用原公开类型和绑定方式；接入检查从真实供给得到原有结论，仓库只保留一套有效实现和一致导航。

**Delivers:** P1、P2、P3、P4、P16

**Blocked by:** 02: Pi 原生 State、命令、prompt 与模型供给路径迁移；03: OMP 原生 State、命令、prompt 与模型供给路径迁移；04: Pi Session 生命周期、第三方接入与跨来源组合迁移；05: OMP Session 生命周期与原生子会话接入迁移；06: Pi Marker area 与反馈路径迁移；07: OMP Marker area、反馈与可选 Viewed-session 路径迁移。

**Status:** in-progress

## 边界与覆盖

以本 feature 的 spec／contract 为权威，经 R1、S1 和 S3 验收。02–07 必须各自完成职责迁移、调用方、直接导航和删除旧路径；本票不是遗漏实现的收纳箱。若清单职责未交付，明确退回其 owner，而不是静默承接或忽略。

- [x] 对照实际上游契约和完整职责审查来源追踪及导航，区分 Pi 原生事实、pi-subagents 协议、必要 mixture 和 OMP 原生机制／可选补丁；目录名本身不构成证据。
- [x] 审查实际依赖：native 不依赖 pi-subagents 特定协议；thirdParty 可使用必要 Pi 原生契约；mixture 消费两方显式事实／操作，来源不反向依赖 mixture。复用并按批准规则更新既有导入约束检查，不冻结所有私有路径为行为测试。
- [x] 确认公共 assembly 与顶层私有 port assembly 职责独立，笼统 internal 分组已移除，原生类型和加载支持有真实归属；port 不解释跨来源语义，消费方不获知来源细节。
- [x] 确认只有一套有效实现，无旧引用、兼容转发、无职责镜像或空来源分组；完整协议没有因单事件或上游文件结构被机械拆散。
- [x] 经公开 extension 定义和 assembly 验证两个 harness 原有成功／拒绝场景以及条件能力类型凭据，公开接口、HarnessPort 和绑定使用方式不变。
- [x] 对所有受影响消费方运行两端接入完整性检查，从实际 PI_PORT／OMP_PORT 和真实需求得到可解析供给；必需项无新增缺口，可选不可用／条件状态含义不变。
- [x] 保留静态分析支持的显式 assembly 和 canonical delivery construction，不删减需求或加入手工能力清单掩盖缺口；允许内部源码定位变化，不要求报告逐字节相同。
- [x] 更新既有 ADR-0002 的来源组织决定及权威架构／导航，替代过时 domain-first 规则但保留无关语义和依赖规则；不新增业务术语，也不将计划描述为已认证支持。

## 验证与交接

运行公开 assembly 契约覆盖、条件类型检查、导入约束、拥有分区及受影响消费方；TypeScript 变更必须类型检查。实际执行两端静态检查命令并审查报告，另运行适用真实 harness 加载／assembly smoke，不能把静态 provided 当作运行成功。检查更新文档的链接与示例。向 09 交付命令、退出状态、源／环境、完整结构审查结果及未解决失败；最终全量回归由 09 在稳定窗口执行。

## Comments

### 2026-10-24 — 实现与本票验收完成，等待独立集成

本 worktree 基于 `6693ac79382320d97259614ba4da513225da8c70`；以下验证覆盖本票提交的源码。按仓库状态规则，合入前仍保留 `in-progress`，由独立集成方合入后关闭；没有未完成的本票实现。

**R1 / P1–P3 结构审查：** 从两端 `index.ts`、实际 `PI_PORT` / `OMP_PORT` 追踪全部绑定。Pi 的 session-manager ancestry、position/startup、State branch 读写是 native；extension 生命周期、Turn、命令、prompt、context、UI 与结构 API 类型跟随 `core/extensions`；价格/访问来自 native model registry。pi-subagents 的 required-child-extension 公共导出、RPC v1 announcement/request/reply、launch name 与 liveness registry 在 `thirdParty/pi-subagents` 保持完整职责和原 lifetime。mixture 的三项职责分别配对 session 转移与 child requirement、native identity/startup 与 provider launch name、native settle/quiescence 与 provider-held work。OMP 使用自身 extension/session/config/agent-registry 契约与集成 child loading，不是 Pi provider 的镜像；Viewed-session 源码明确是可选原生补丁，未补丁 upstream types 不含该出口。

对照的外部源码为 Pi checkout `36be9c612e64082a4f0d4d0a94706c38ecbc20a1`、OMP checkout `611c189fa2f6b8c9b368559ea6b98062b9b54539`，以及安装的 pi-subagents 0.78.0 发布契约（`src/api/required-child-extensions.js`、`src/extension/rpc.d.ts`、`src/integrations/pi-web-session-liveness.js`）；源码来源不是运行版本认证。完整 State 读写与多事件生命周期未机械拆散。实际依赖中 native 无第三方/mixture 导入，thirdParty 只使用必要 native transport/type，mixture 读取两方显式事实/操作，port 不解释协议。04 集成 owner 确认 native 对顶层 `PiPortContext` 的 type-only 依赖是注入框架事实/操作的 binding wiring，native 未读取 provider integration，未引入新 seam 或类型抽象。

只有一套有效实现；生产源码、测试、脚本及权威文档无旧 `adapters/{pi,omp}/{internal,domain}` 引用，无转发兼容层、职责镜像或空来源目录。静态分析 fixture 的任意 `internal/port.ts` 路径不是生产实现，不为目录重组改动。公开类型与 `HarnessPort` 未改动。发现的唯一消费方私有路径依赖是 codebase-tools 的 Node 文本 loader；本票将安装放回 Pi 公共 assembly，移除消费方的私有来源 import，保持 loader 实现归属 native。ADR-0002、README、能力索引、接口架构、接入指南与既有 assembly 构造说明已同步；未新增 glossary 术语或支持声明。

**TDD / P2、P4：** 既有 `tests/framework/import-boundary.test.ts` 增加来源方向及消费方公共 assembly 约束，不冻结私有文件清单。消费方约束先红（明确命中真实私有 loader import，退出 1），公共入口切换后绿。来源方向本已满足，先验证；临时注入 native→thirdParty 和 thirdParty→mixture 导入时断言准确失败（退出 1），恢复后 16 测试、461 断言通过。无保留的注入代码或脚本。

**实际命令与结果：**

- `bun install --frozen-lockfile`：退出 0，安装锁定依赖，未改 lockfile。
- `bun test tests/framework/import-boundary.test.ts`：退出 0，16 pass / 0 fail。
- `bun run typecheck`：退出 0，TypeScript 与 authoring gate 通过（61 files / 4 declarations / 0 diagnostics）。包含 `pi-adapter-output.test.ts` 中显式 childEntry、未提供、显式 undefined、动态 union 的类型凭据及拒绝赋值。
- `bun test tests/framework tests/integrations tests/authoring tests/codebase-tools tests/connect-bot tests/model-cost`：退出 0，1527 pass / 0 fail，152 files，8727 断言，243.67 秒。公开 assembly 成功/拒绝覆盖包括 `pi-native-consumers.test.ts`、`pi-subagent-integration.test.ts`、`startup-requirements.test.ts`；条件 assembly 分析在 `tests/integrations/assembly.test.ts`，消费方全集在上述三个 extension 分区。完整输出：`artifact://353`。
- `bun run check:integrations --adapter pi --json` 与 `bun run check:integrations --adapter omp --json`：各退出 0；各端 codebase-tools、connect-bot、model-cost 三个真实组合均 complete、0 diagnostics，分别 11 / 19 / 29 个 required 全为 provided。报告保留于 `.cache/ticket08-integrations-pi.json` 和 `.cache/ticket08-integrations-omp.json`，完整命令输出亦为 `artifact://354`。Pi viewedSession/跨进程观察仍 unavailable，model-cost 的 closeOut.remaining 仍 conditional；OMP viewedSession 的结构供给为 provided，不代表宿主补丁存在，OMP disposal/closeOut.remaining 与跨进程观察仍 unavailable。需求、实际 port construction 与 canonical delivery 未删减，也未添加手工供给表。
- `bun test tests/harness-dock/startup-modes-loading.test.ts`：退出 0，真实 OMP 18.5.0 隔离安装，5 pass / 0 fail，58 断言；验证实际加载、两消费方组合、模式/配置选择及拒绝隔离。`OMP_TEST_VERSION` 未设置；无补丁安装/修改。
- `PI_NODE=D:/Users/hugos/AppData/Local/nvm/v22.19.0/node.exe bun scripts/pi-codebase-tools-smoke.ts --pi D:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`（Windows 实际经 `cmd.exe /d /c "set PI_NODE=...&& bun ..."`）：退出 0，Pi 1.4.0 / Node 22.19.0，manual mode，6 个隔离运行的 78 项 consumer-visible 检查全部通过。包括从公共 assembly 加载 Markdown、toggle/prompt/marker、历史恢复、switch，以及真实 detached child 加载同一 entry 并跟随 Owner。脚本真实加载 repo-pinned pi-subagents 0.78.0 extension；框架当前显式配置的 required-child-extension 公共 export 来自 `C:/Users/hugos/.pi/agent/npm/node_modules/pi-subagents` 0.80.0，二者区别保留，不修改用户配置或声称其他版本已验证。
- 更新区域的 68 个本地文档链接及 anchor 检查通过；目录示例对照实际来源树。全局旧组织规则/旧生产路径搜索无命中。

环境：Windows x64 10.0.26200、Bun 1.4.2；真实 smoke 使用本地 credential-free capture/panel，不读取真实模型/面板凭据。以上结构供给、受控行为与真实接通证据分别记录，不等同于版本支持认证。**未验证：** 本票不执行 09 的最终全量回归；H1 日常 TUI 人工体验尚未确认；本票 OMP 加载 smoke 不覆盖真实补丁 Viewed-session 交互。无未解决自动验收失败。
