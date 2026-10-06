# 确定共享源码装载与旧→新单向迁移切换方案

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 03, 06

## Question

如何将本仓库的共享框架和 codebase-tools 装入已选择的 OMP 环境，明确版本与依赖组合，并保证从原实现到替代实现可以不转换数据地单向迁移、且两者不同时启用？

必须决定：

- 遵循 ADR 的 framework/extensions/entrypoints 组织，Agent 运行时只发现 OMP 薄入口；具体装载配置、路径与依赖解析方式。资源 import 与 Agent 运行时 capability discovery 不混同。
- 安装/选择哪一份扩展、如何防止双重注册和旧新同时启用；不要求原仓库引用框架或维护迁移指针。
- 重启的生效边界，模块缓存和活动子代理对切换的影响；使用已取得的运行证据，不假设热重载等价进程重启。代码热重载已由 [02](../lighthouse/02-candidate-support.md) 延后到框架 backlog，本票不承诺 reload，只界定 restart 语义。
- 固定原实现修订、替代仓库修订、依赖 lockfile 与 Agent 运行时组合的方式。
- 同一份实际存储的“旧写→新读写”单向验证步骤及观察点，覆盖开关、init 进度（新实现按 branch 消息身份推导，不再写 `initInjected`）、会话/分支续用；新→旧回退已由 [05](../lighthouse/05-contribution-contract.md) 明确移出范围；不把 JSON 外形、备份恢复或一次性导入当作迁移证明。
- 用户执行哪些安装/配置动作，agent 可以在隔离环境执行哪些动作；不能在规划期间改动正式 Agent 运行时配置或源码。

### 追加约束（来自 [02 决策](../lighthouse/02-candidate-support.md)，backtracer 2026-10-06）

- 固定的 Agent 运行时组合就是 02 的唯一支持组合：本地源码 `@oh-my-pi/pi-coding-agent@9348320`（=18.5.0，Windows x64 + Bun 1.4.2）；是精确版本，不是范围。
- 切换方案只承诺 restart 语义；reload 已由 02 延后（见框架 backlog），不得在装载/切换决策里重新引入热重载假设。

本票产出部署与切换决策，不执行生产切换；最终端到端证明在替代实现完成后取得。

### 追加约束（来自 [03 探针](../lighthouse/03-extension-path-probes.md)，backtracer 2026-10-06）

- 03 实测：候选 `@9348320` 的本地源码 checkout **不能直接跑完整会话**——native addon（`pi_natives`）未构建，失败于装载期；`cli.ts --version` 可用不代表可运行。
- 因此本票必须明确并记录“让 02 冻结的基线可运行”的方式：先构建 natives（`bun --cwd=packages/natives run build`，agent runtime 走 Cargo/N-API，不需 bazel），还是以隔离精确安装 `@oh-my-pi/pi-coding-agent@18.5.0`（03 已证其关键源文件与 checkout 逐字节一致）作为运行/验收 Agent 运行时；并说明与 02 “基线=本地源码 checkout”的关系，二者不可含糊并存。
- 防双注册、restart 语义与修订/lockfile 固定均需在选定上述运行 Agent 运行时后落实。

### 追加约束（来自 [05 贡献契约](../lighthouse/05-contribution-contract.md)，2026-10-06）

- 持久化契约收窄：`codebase-tools:state` 新写只含 `{on}`，不再写 `initInjected`；旧→新向前兼容（新读旧 `{on}` + 按对话推导进度），新→旧回退不再保证。
- 切换方案只需保证旧→新不丢业务数据、两实现不同时启用；不要求同一份存储上旧实现继续更新新实现写下的数据。
- 贡献 wire 角色由 provider 历史序列化决定，部署方案无需为角色做门控；08 记录各路径实测角色。

### 追加约束（来自 [04 State 归属决策](../lighthouse/04-state-ownership.md)，2026-10-06）

- State 装载遵循 04：持久介质 = owner 会话 JSONL 的 `codebase-tools:state`（只 `{on}`）；`/new`、`/resume` 时 Agent 运行时 flush 旧会话、框架退役旧 cell 并从目标 branch seed。
- 活动子代理对切换的影响按 04 已知限制：切换后旧子代理的 owner 解析可能失效或取错；不得据此声称支持同进程多 main。

## Discussion（2026-10-06，grilling + domain-modeling）

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

### 5. 旧写→新读写验证（Q5）
- 干净环境前提：temp `PI_CODING_AGENT_DIR` + explicit-only 根 + 受控会话。
- 步骤：① 从 `@34d7c40` 临时物化旧实现，真实 OMP 18.5.0 跑真实旧会话 → 旧格式存储（`{on,initInjected}` + `codebase-tools:init`）；② 同一份存储不转换，用新 `entrypoints/omp` resume → `on` 恢复、branch 已有 init 走 reminder；新版写出 state 只含 `{on}`；③ 再重启/resume 自洽；④ `/tree` 回溯无 init 分支 → 重新 init、`on` 不变。
- 观察点：session JSONL 条目序列/形状、resume/TUI（marker/notify/init vs reminder）、provider 出站捕获（custom 贡献 user role、尾部追加；openai-codex 留给 08）。
- 不做：JSON 外形/备份/一次性导入当迁移证明；新→旧回退（05 移出范围）。

### 6. 动作分工与 cutover 时机（Q6）
- Agent（隔离可做）：隔离候选安装、物化旧实现、探针/框架能力测试/旧写→新读写自动化验证、写部署与支持记录。
- 用户：explicit-only 干净 TUI 功能验收；验收通过后执行 cutover（删除 + config + 重启）与 cutover 冒烟；提供 openai-codex 凭据（若需）；最终固定升级版本。
- **删除推迟到功能验收通过之后**：验收用 explicit-only 无需删除；失败则默认环境与旧实现完好。

### 7. Agent 运行时版本升级规则（Q7）
- 候选版本经运行期参数指定（推荐 env `OMP_TEST_VERSION=<v>`），harness 隔离前缀精确安装并跑框架能力测试（C1–C15）= 「基本验证」。默认/CI 只跑已固定版本。
- 绿灯只作回归警报、不自动升级支持声明（02 不变量）。升级 = 候选套件通过 → 维护者按 08 矩阵人工 TUI 验收 → 显式**替换**单一支持版本（`ompAdapter({supportedVersions})` + `agent-runtime-support.md` + 固定记录），restart 生效。
- 候选验证不得改动默认全局安装/正式配置/运行中 agent；内建子代理同进程，磁盘换版本不影响运行中会话。

## Decision

首版以本地 checkout `oh-my-pi@9348320` 为修订锚点、隔离精确安装 `@18.5.0` 为运行/验收产物；装载点 = `my-agent-toolkit/entrypoints/omp` 目录，防双注册靠装载来源互斥（开发/验收用 `--no-extensions -e` explicit-only；永久切换 = 验收通过后删除旧 `codebase-tools` + 加新根条目 + 重启）；旧的 `{on,initInjected}` 存储经同一份真实存储的「旧写→新读写」验证向前兼容（新版只写 `{on}`）；支持组合与升级规则记入 `docs/agent-runtime-support.md`——候选版本隔离安装 + 运行期参数跑框架能力测试、绿灯只作回归警报，人工 TUI 验收通过后由维护者显式替换单一支持版本。

## Comments

- 2026-10-06 认领后事实侦察（两枚只读 scout，源文件引用可复核；标注“已复核”的两处由人工二次确认）。
  - **旧扩展激活面**：用户级 `~/.omp/agent/config.yml` 的 `extensions:` 当前是两个**父目录**条目 —— `E:/Developer/myhub/my-omp-toolkit/extensions` 与 `E:/Developer/myhub/oh-my-wayfinder/extensions`（已复核）。OMP 对每个条目做单层扫描、加载各子目录的 `index.ts`；`codebase-tools` 因此被激活。`~/.omp/agent/extensions/` 为空，两仓库都无 `.omp/extensions/`。单扩展停止手段：`disabledExtensions: ["extension-module:codebase-tools"]`（`extensibility/extensions/loader.ts:583-584`），但该键按名称匹配，会同时命中新旧同名实现。
  - **发现与去重**：原生发现扫 `<agentDir>/extensions/`、`<cwd>/.omp/extensions/`（单层：散落 `*.ts/*.js`、`*/index.ts|js`、带 `omp`/`pi.extensions` 的 `*/package.json`），另加 `settings.json#extensions` 与 config.yml `extensions:`（`discovery/builtin.ts:58-73,480-577`）。`-e/--extension` 可重复、接受文件或目录并注入显式 root；`--no-extensions` 只关 ambient/设置来源（`-e` 仍生效）；`--profile`/`OMP_PROFILE` 把 agent dir 切到 `~/.omp/profiles/<name>/agent`，profile 可持久携带自己的扩展根（`cli/flag-tables.ts:79-82,222-231`；`main.ts:1662-1669,1776-1779`）。**加载层不按扩展名去重**：两个不同路径、同名扩展都会加载（capability 层 `key = ext.name`、`toExtensionId = extension-module:<name>` first-wins，注册 last-wins；`capability/extension-module.ts:28-31` 已复核）。→ 防双注册只能靠**装载来源互斥**，不能靠身份探测；且因当前根是含多扩展的父目录，不能简单整根替换，否则波及未迁移扩展或造成双载。
  - **natives 可运行性**：`bun --cwd=packages/natives run build` 在 win32 强制 Cargo/N-API 本地构建（非 Bazel），要求 Rust nightly-2026-08-12（含 windows-msvc target）、Bun ≥1.3.14、MSVC + CMake + Ninja（`scripts/bazel-natives.ts:30-37,348-405`；`packages/natives/scripts/build-bindings.ts:25-55`；`rust-toolchain.toml`）。交互 TUI 硬依赖 addon：`packages/natives/native/index.js:23` 模块级 eager `loadNative()`（已复核），`tui` 静态 import、无 JS 回退（`packages/tui/src/terminal.ts:3,1036-1040`；`keys.ts:21-26`）。预构建 addon 以 npm leaf 包形式存在（`packages/natives/README.md:88-91`）；隔离精确安装 `@18.5.0` 已在 03 走通。扩展模块不会卸载 → 切换是 restart-scoped。
