# 07: 确定共享源码装载与实现切换方案: Lighthouse

> Question and discussion: [07: 确定共享源码装载与实现切换方案](../decision/07-deployment-cutover.md)

## Question

如何将本仓库的共享框架和 codebase-tools 装入已选择的 OMP 环境，明确版本与依赖组合，并保证从原实现到替代实现可以不转换数据地单向迁移、且两者不同时启用？

必须决定：

- 遵循 ADR 的 framework/extensions/entrypoints 组织，Agent 运行时只发现 OMP 薄入口；具体装载配置、路径与依赖解析方式。资源 import 与 Agent 运行时 capability discovery 不混同。
- 安装/选择哪一份扩展、如何防止双重注册和旧新同时启用；不要求原仓库引用框架或维护迁移指针。
- 重启的生效边界，模块缓存和活动子代理对切换的影响；使用已取得的运行证据，不假设热重载等价进程重启。代码热重载已由 [02](02-candidate-support.md) 延后到框架 backlog，本票不承诺 reload，只界定 restart 语义。
- 固定原实现修订、替代仓库修订、依赖 lockfile 与 Agent 运行时组合的方式。
- 同一份实际存储的“旧写→新读写”单向验证步骤及观察点，覆盖开关、init 进度（新实现按 branch 消息身份推导，不再写 `initInjected`）、会话/分支续用；新→旧回退已由 [05](05-contribution-contract.md) 明确移出范围；不把 JSON 外形、备份恢复或一次性导入当作迁移证明。
- 用户执行哪些安装/配置动作，agent 可以在隔离环境执行哪些动作；不能在规划期间改动正式 Agent 运行时配置或源码。

### 追加约束（来自 [02 决策](02-candidate-support.md)，backtracer 2026-10-06）

- 固定的 Agent 运行时组合就是 02 的唯一支持组合：本地源码 `@oh-my-pi/pi-coding-agent@9348320`（=18.5.0，Windows x64 + Bun 1.4.2）；是精确版本，不是范围。
- 切换方案只承诺 restart 语义；reload 已由 02 延后（见框架 backlog），不得在装载/切换决策里重新引入热重载假设。

本票产出部署与切换决策，不执行生产切换；最终端到端证明在替代实现完成后取得。

### 追加约束（来自 [03 探针](03-extension-path-probes.md)，backtracer 2026-10-06）

- 03 实测：候选 `@9348320` 的本地源码 checkout **不能直接跑完整会话**——native addon（`pi_natives`）未构建，失败于装载期；`cli.ts --version` 可用不代表可运行。
- 因此本票必须明确并记录“让 02 冻结的基线可运行”的方式：先构建 natives（`bun --cwd=packages/natives run build`，agent runtime 走 Cargo/N-API，不需 bazel），还是以隔离精确安装 `@oh-my-pi/pi-coding-agent@18.5.0`（03 已证其关键源文件与 checkout 逐字节一致）作为运行/验收 Agent 运行时；并说明与 02 “基线=本地源码 checkout”的关系，二者不可含糊并存。
- 防双注册、restart 语义与修订/lockfile 固定均需在选定上述运行 Agent 运行时后落实。

### 追加约束（来自 [05 贡献契约](05-contribution-contract.md)，2026-10-06）

- 持久化契约（2026-10-07 traverse 覆盖）：新版只读写 `{enabled}`，不写 `initInjected`、不读旧 `{on}`；旧→新兼容整体放弃，旧会话回落 off。原文的「新写只含 `{on}` / 旧→新向前兼容」作废。
- 切换方案只需保证两实现不同时启用；持久化数据不迁移、不保证兼容（2026-10-07 traverse 放弃）。
- 贡献 wire 角色由 provider 历史序列化决定，部署方案无需为角色做门控；08 记录各路径实测角色。

### 追加约束（来自 [04 State 归属决策](04-state-ownership.md)，2026-10-06）

- State 装载遵循 04：持久介质 = owner 会话 JSONL 的 `codebase-tools:state`（只 `{enabled}`）；`/new`、`/resume` 时 Agent 运行时 flush 旧会话、框架退役旧 cell 并从目标 branch seed。
- 活动子代理对切换的影响按 04 已知限制：切换后旧子代理的 owner 解析可能失效或取错；不得据此声称支持同进程多 main。

## Discussion

### 1. 验收运行产物（Q1）
- 修订锚点 = 本地 checkout `oh-my-pi@9348320`（=18.5.0，源码对照与支持声明）；运行/验收产物 = 隔离精确安装 `@oh-my-pi/pi-coding-agent@18.5.0`（03 已证可运行、关键 6 文件逐字节一致）。开发期假设二者代码一致。
- 理由：checkout 跑不了完整会话（natives 未构建，`packages/natives/native/*.node` 缺失）；交互 TUI 硬依赖 native addon（`packages/natives/native/index.js:23` eager `loadNative()`，无 JS 回退）；构建 natives 需 Rust nightly-2026-08-12 + MSVC/CMake/Ninja（`scripts/bazel-natives.ts:30-37,348-405`）。natives 构建仅作可选开发调试，不作验收前提。
- 被否决：checkout 与 install 含糊并列为「基线」；把构建 natives 作为验收前提。

### 2. restart 生效边界（Q2）
- 只允许整进程停止→重启生效；不在运行中替换扩展根、不依赖模块缓存（02 已定无 hot reload）。
- 旧、新实现绝不同时出现在同一进程的扩展发现集；由装载来源互斥保证，不做运行期身份探测（加载层不按名去重：`capability/extension-module.ts:28-31`，两个不同路径同名扩展都会加载）。
- 活动子代理按 04 已知限制：不声明支持；owner 不可解析降级 off。证据：内建子代理同进程（`task/executor.ts:4227`），磁盘换版本不影响运行中会话/子代理，重启才生效（`cli/update-cli.ts:2049`）。

### 3. 固定方式（Q3）
- 支持组合（18.5.0 + Windows x64 + Bun 1.4.2）记入 `docs/agent-runtime-support.md` 支持表；替代实现侧在实施交接固定「my-agent-toolkit 修订 + 根 `bun.lock`」；oracle 沿用 01 的 `my-omp-toolkit@34d7c40`。单一权威文档（ADR-0002）。

### 4. 装载与防双注册（Q4）
- 装载点 = 目录 `E:/Developer/myhub/my-agent-toolkit/entrypoints/omp`（每扩展一个薄入口，非聚合文件；ADR-0002）。
- 防双注册 = 装载来源互斥。加载层不按名去重、`disabledExtensions` 按 `extension-module:<name>` 会同时命中新旧 → 不用身份探测。
- 开发/验收期：explicit-only 隔离运行 `omp --no-extensions -e E:/Developer/myhub/my-agent-toolkit/entrypoints/omp`（+ 干净会话/temp agent state），不碰默认 config。
- 永久 cutover（验收通过后，用户执行）：删除 `my-omp-toolkit/extensions/codebase-tools` + config.yml 加 `entrypoints/omp` 目录条目 + 重启；父 root 仅剩 4 个未迁移扩展 → 每扩展互斥。
- 回退 = git 修订 `@34d7c40`；回退不保证新数据兼容（05）。
- 被否决：整根替换（波及 4 个未迁移扩展）；专用 profile（agent dir 的 auth/model 重建成本）；`disabledExtensions`/名称探测。

### 5. 持久化兼容：已放弃（Q5，2026-10-07 traverse 覆盖）

用户显式放弃持久化兼容（旧→新与新→旧都不保证）。原文的「旧写→新读写」四步验证、旧 `{on,initInjected}` 物化与观察点全部作废，保留为历史记录。新版只读写 `{enabled}`、不读旧 `{on}`，旧会话 resume 回落 off；验证收窄为新实现自洽：新写 `{enabled}` → 重启/resume 读回 `{enabled}`。见 [05 Addendum](05-contribution-contract.md)。

### 6. 动作分工与 cutover 时机（Q6）
- Agent（隔离可做）：隔离候选安装、探针/框架能力测试/新实现自洽恢复验证、写部署与支持记录。
- 用户：explicit-only 干净 TUI 功能验收；验收通过后执行 cutover（删除 + config + 重启）与 cutover 冒烟；提供 openai-codex 凭据（若需）；最终固定升级版本。
- **删除推迟到功能验收通过之后**：验收用 explicit-only 无需删除；失败则默认环境与旧实现完好。

### 7. Agent 运行时版本升级规则（Q7）
- 候选版本经运行期参数指定（推荐 env `OMP_TEST_VERSION=<v>`），harness 隔离前缀精确安装并跑框架能力测试（C1–C15）= 「基本验证」。默认/CI 只跑已固定版本。
- 绿灯只作回归警报、不自动升级支持声明（02 不变量）。升级 = 候选套件通过 → 维护者按 08 矩阵人工 TUI 验收 → 显式**替换**单一支持版本（`ompAdapter({supportedVersions})` + `agent-runtime-support.md` + 固定记录），restart 生效。
- 候选验证不得改动默认全局安装/正式配置/运行中 agent；内建子代理同进程，磁盘换版本不影响运行中会话。

---

## Decision

首版以本地 checkout `oh-my-pi@9348320` 为修订锚点、隔离精确安装 `@18.5.0` 为运行/验收产物；装载点 = `my-agent-toolkit/entrypoints/omp` 目录，防双注册靠装载来源互斥（开发/验收用 `--no-extensions -e` explicit-only；永久切换 = 验收通过后删除旧 `codebase-tools` + 加新根条目 + 重启）；不做持久化兼容：新版只读写 `{enabled}`、不读旧 `{on}`，旧会话回落 off（2026-10-07 traverse 覆盖原「旧写→新读写」）；支持组合与升级规则记入 `docs/agent-runtime-support.md`——候选版本隔离安装 + 运行期参数跑框架能力测试、绿灯只作回归警报，人工 TUI 验收通过后由维护者显式替换单一支持版本。

## User stories

1. 作为框架维护者，我想要固定的修订锚点（checkout @9348320）与可运行的验收产物（隔离精确安装 @18.5.0），以便验收证据同源、且不被 natives 构建工具链阻塞。
2. 作为用户，我想要开发/验收期用 explicit-only 干净运行新扩展，以便不触碰默认配置与旧实现即可测试新版。
3. 作为用户，我想要验收通过后再做永久 cutover（删除旧 codebase-tools + 加新根目录条目 + 重启），以便验收失败时默认环境完好、无需回滚操作。
4. 作为框架维护者，我想要防双注册靠装载来源互斥而非扩展名探测，以便同名新旧实现绝不双载。
5. 作为用户，我想要旧→新向前兼容经同一份真实存储验证（旧实现物化后旧写、新实现新读写），以便迁移不丢业务数据。
6. 作为框架维护者，我想要支持组合与版本升级规则记录在 `docs/agent-runtime-support.md`，以便升级有单一权威来源。
7. 作为框架维护者，我想要候选版本经运行期参数在隔离前缀安装并跑框架能力测试，以便不影响日常运行的 omp 与它 spawn 的子代理。
8. 作为框架维护者，我想要绿灯只作回归警报、人工 TUI 验收通过后才显式替换支持版本，以便未验证版本不会自动获得支持声明。
9. 作为用户，我想要只有整进程重启才生效、运行中会话与子代理不受磁盘版本变更影响，以便开发期间切换/验证不打断正在进行的 agent。

## Preconditions

- 01 已冻结 oracle `my-omp-toolkit@34d7c40` 与 C1–C15；02 已冻结唯一精确组合（checkout @9348320 = 18.5.0 + Windows x64 + Bun 1.4.2）与隔离规则；03 已证薄入口 + 外置源码 + 裸依赖解析、隔离安装可运行、关键 6 文件逐字节一致；04 已定 owner/State/单 main；05 已定 `{enabled}`-only 且放弃持久化兼容（2026-10-07 traverse）；06 已定 `defineExtension`+`ompAdapter`、`entrypoints/omp` 只 re-export。
- 本地 `oh-my-pi` checkout 停在 @9348320；`my-omp-toolkit@34d7c40` 可从 git 物化。
- 开发期假设 checkout 与 18.5.0 发布代码一致。
- 用户承担 cutover 与交互 TUI 验收。

## Postconditions

- 运行/验收产物 = 隔离精确安装 `@18.5.0`；修订锚点 = checkout @9348320。
- 装载点 = `E:/Developer/myhub/my-agent-toolkit/entrypoints/omp`（目录，每扩展一个薄入口）。
- 防双注册 = 装载来源互斥；开发/验收 explicit-only；永久切换 = 验收通过后删除旧目录 + 加 config 目录条目 + 重启。
- 持久化兼容（两向）已放弃：不验证旧写→新读写；新版只读写 `{enabled}`、旧 `{on}` 不读。
- 支持组合与升级规则（隔离安装 + `OMP_TEST_VERSION` + 框架能力套件 + 人工验收 + 显式替换单一版本）记入 `docs/agent-runtime-support.md`。
- 用户/agent 动作分工固定；删除推迟到功能验收通过后。

## Invariants

- 不修改 agent 源码、不补丁/monkey-patch；只用 extension 接口与 06 限定的 `pi.pi` escape hatch。
- 不修改默认全局安装、正式配置或运行中 agent；候选验证一律隔离（02 隔离规则）。
- 单一权威文档：Agent 运行时观察/支持组合归 `docs/agent-runtime-support.md`（ADR-0002）。
- 绿灯不自动批准版本；支持声明是维护者显式决定。
- 防双注册不依赖扩展名去重 / `disabledExtensions`（加载层无名称去重）。
- 只承诺 restart，不依赖 hot reload（02 延后；扩展模块 `?mtime=` 重载不作为切换机制）。
- 历史保护与 `{enabled}`-only 持久化沿用 04/05；不读旧 `{on}`。
- 内建子代理同进程；磁盘换版本不影响运行中会话，重启才生效。
