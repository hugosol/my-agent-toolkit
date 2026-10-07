# Run record — connect-bot 迁移验收基线

Status: **handoff-ready** — §1–§3 基线已填并核对，release gate 已跑（§6 RR-01），M 层人工观察清单可直接照做（§7）；M 层结果、截图/日志位、执行者与日期在录制时填入 §6 RR-02。
Recorded: 2026-10-07（基线）
Updated: 2026-10-07（release gate + 人工交接包，ticket 21：§3.1/§3.2/§5/§6 RR-01/§7）
Delivers: P41（[contract.md](contract.md)）；本票补 P43、P45（§6 RR-01、§7）
来源: [spec.md](spec.md) §11 + Testing Decisions（run record 段）；[lighthouse/01-behavior-baseline.md](lighthouse/01-behavior-baseline.md)；[lighthouse/06-acceptance-contract.md](lighthouse/06-acceptance-contract.md) §6–§7

**字段语义权威**：[`docs/agent-runtime-baseline.json`](../../docs/agent-runtime-baseline.json)（数据）+ [`tests/harness/baseline.ts`](../../tests/harness/baseline.ts)（读取、物化隔离安装、自校验）；支持状态口径沿用 [`docs/agent-runtime-support.md`](../../docs/agent-runtime-support.md) 的四态记录（`verified-supported` / `verified-unlisted` / `unverified` / `unsupported`）。本记录**不新建**第二套基线口径，只按迁移需要补两个该 JSON 未承载的字段组：行为基线扩展侧（唯一提交 / 冻结声明）与面板修订。

## 0. 怎么用这份记录

- §1–§5 是基线骨架：本票填当前可核对值；核对不到的写「**待填（何时填）**」并注明来源，不猜值。
- 每一次验收 run 在本文件追加一节（§6 模板），并在 `.scratch/connect-bot-migration/runs/<run-id>/` 放该次证据；本节内填写该次实际使用的各修订、逐步结果表、截图/日志位、执行者与日期。
- 任何一次 run 偏离 §2 的 pinned 支持基线时，**先**按 §2.3 跑候选校验并记录结果，或显式记 `verified-unlisted`；**不得默认等价**。
- 记录只写可核对事实；与权威来源不一致时逐条登记（§5 差异登记）交用户判断，不自动裁决、不静默改写来源值。

### 0.1 来源对照（spec §11 / lighthouse 06 §7 逐项）

| 权威要求 | 本记录位置 | 状态 |
|---|---|---|
| spec §11 行为基线：本机 `my-omp-toolkit` 最新代码（开发期冻结）；扩展只存在于 `d3648a0`、仓库修订 `master@34d7c40`；面板 `omp-bot@d50e35c` | §1.1、§1.2 | 已填（含 D-01 观测） |
| spec §11 支持基线：OMP `@oh-my-pi/pi-coding-agent@18.5.0`（checkout `@9348320`）+ Windows x64 + Bun 1.4.2；运行/验收产物 = 隔离精确安装 | §2.1、§2.2 | 已填 |
| spec §11 硬约束：不改默认全局安装/正式配置/运行中 agent；原仓库冻结（旧断言只落迁移侧） | §1.1 冻结声明、§2.2、§4 | 已填 |
| lighthouse 06 §7：run record 顶部记 `my-omp-toolkit` branch + commit | §1.1 | 已填 |
| lighthouse 06 §7：`omp-bot` commit | §1.2 | 已填 |
| lighthouse 06 §7：OMP 版本 + `bun --version` + lockfile | §2.1（OMP/Bun）、§1.1（oracle lockfile） | 已填 |
| lighthouse 06 §7：`my-agent-toolkit` commit + lockfile | §3.1 | 已填（本票录制值；每条 run 按 §6 模板更新当次实际值） |
| lighthouse 06 §7：`config.yaml` 内容 | §3.2 | 已填（ticket 21：原文 + sha256） |
| lighthouse 06 §7：执行者与日期（每次 run） | §6 模板、RR-00、RR-01 | 已填（RR-00 = 基线票自身记录；RR-01 = release gate） |
| lighthouse 06 §7：非 pinned OMP 版本须先跑 `scripts/verify-omp-candidate.ts` 或显式记 `verified-unlisted` | §2.3 | 已填（本记录固定 pinned `18.5.0`） |
| lighthouse 06 §7：自动化计数基线在迁移后更新为实际计数 | §3.1 末行 | 已填（ticket 21：实际计数见 §3.1 末行与 §6 RR-01） |
| spec Testing Decisions / lighthouse 06 §6：M 层人工观察清单的前置、操作、观察点、预期 | §7（可直接照做的清单本体）、§6 RR-02（逐步结果位） | 已填（ticket 21；清单来源 [lighthouse 06 §6](lighthouse/06-acceptance-contract.md#6-人工观察清单m-层)） |

---

## 1. 行为基线（behavior baseline）— 源仓库与面板

### 1.1 源仓库（扩展原实现）

| 项 | 值 | 来源 | 本机核对（2026-10-07） |
|---|---|---|---|
| `repository` | `my-omp-toolkit` | spec §11；lighthouse 01 Decision；`agent-runtime-baseline.json.oracle.repository` | — |
| `path` | `../my-omp-toolkit`（相对本仓库根解析，语义同 `oracle.path` / `resolveRecordPath`） | `agent-runtime-baseline.json.oracle.path` | 存在 |
| `branch` | `master` | lighthouse 06 §6 前置；README §H3 | `git rev-parse --abbrev-ref HEAD` → `master` |
| `revision`（冻结修订） | `34d7c4061a74a73b478067882cba7956821f3c1d`（`Merge pull request #1 from hugosol/extension-framework`, 2026-10-04） | spec §11；lighthouse 01 §基线锚点、06 §6 前置；README §H3 步骤 1/5 | 该对象存在，是 HEAD 的祖先 |
| `extension`（唯一提交） | `d3648a087f7d6afafb4f31fafa96eacdef1b6634`（`connect-bot extension`, 2026-10-01） | spec §11；lighthouse 01 §基线锚点 | `git log --all --format=%H -- extensions/connect-bot` → **1 条**，即该提交 |
| `extensionTree`（目录树哈希） | `5d6340fba851a2f468e6d4f261dd9c7e554077bb` | 本票核对（用于证明行为基线未移动） | `df2554c` / `34d7c40` / 当前 HEAD 三处同 hash |
| `lockfile` | `bun.lock` `sha256:ddf372c50d0c1080b9c66b28e655b2bfe1c694e932ea4b2ae020c704be927225` | `agent-runtime-baseline.json.oracle.lockfile` | `sha256sum bun.lock` → 相同 |
| `worktree` | 干净（0 处未提交修改，含 `extensions/connect-bot`） | 本票核对；lighthouse 01 前提 | `git status --porcelain` → 0 行 |
| 已安装副本 | 本机默认安装目录无 connect-bot 副本 | lighthouse 01 前提 | `~/.omp/agent/extensions/` 为空 |

**开发期冻结声明（原仓库不改）**：开发期内不修改 `../my-omp-toolkit` 的代码、README、既有 L1/L3 测试与 lighthouse 记录；历史约束被有意修改时（marker/通知移入框架 marker 区与统一反馈口、`offline`→`off`、缺文件由「默认+告警」改为「error + 不加载」）**只在迁移侧/移植后产物同步断言**（lighthouse 06 §8 F2、spec §11 硬约束）。本记录只读该仓库。

扩展目录内容（冻结修订）: `README.md`、`client.ts`、`command.ts`、`config.json`、`config.ts`、`connection.ts`、`index.ts`、`state.ts`。
旧端点值（手工搬运来源，spec §6/§8）: `extensions/connect-bot/config.json` = `{"endpoint":"http://omp-bot.local:8787"}`。

### 1.2 面板（omp-bot）

| 项 | 值 | 来源 | 本机核对（2026-10-07） |
|---|---|---|---|
| `repository` | `omp-bot` | spec §11；lighthouse 01 §基线锚点、06 §6 前置 | — |
| `path` | `../omp-bot` | 本票（同级 checkout；权威来源只给修订，未给路径） | 存在 |
| `revision` | `d50e35c073c0f5eb8ab679ec9bd49c4608831dd8`（`connect-bot agent list`, 2026-10-01） | spec §11；lighthouse 01/06 | `git rev-parse HEAD` → 相同；分支 `master`；工作区干净 |
| `lockfile` | 不适用（面板只以既有的固定 HTTP 契约参与验收；仓库内仅 `frontend/package-lock.json`，不是扩展验收的输入） | 本票判定；协议面见 contract P38 | — |
| `protocol` | 固定事件路径 + `{proxy:false}` + `{sessionId,kind,data}` 信封；404/非 2xx 计为失败；面板不改、不迁移 | contract P38；spec §8 | 不核对面板代码（范围约束：不改面板） |

面板的运行态前置（M 层）：面板进程运行中、其 `listen_addr` 与 `my-agent-toolkit` 扩展 `config.yaml` 的 `endpoint` 一致、浏览器打开（lighthouse 06 §6）。

---

## 2. 支持基线（agent runtime + 平台）

### 2.1 pinned 组合

| 项 | 值 | 来源 | 本机核对（2026-10-07） |
|---|---|---|---|
| `agentRuntime.package` | `@oh-my-pi/pi-coding-agent` | `agent-runtime-baseline.json`；spec §11 | — |
| `agentRuntime.supportedVersion` | `18.5.0`（精确枚举，唯一支持版本） | 同上；`docs/agent-runtime-support.md` `verified-supported` 行 | — |
| `revisionAnchor` | `kind: local-source-checkout`，`path: ../oh-my-pi`，`commit: 9348320cc4a30a7195d36a1f05a6c11bcb701a17`，`tag: v18.5.0` | `agent-runtime-baseline.json.agentRuntime.revisionAnchor` | HEAD == `9348320…`；`git describe --tags` → `v18.5.0`；`packages/coding-agent/package.json` version `18.5.0` |
| `acceptanceArtifact` | `kind: isolated-exact-install`，`dependencySpec: @oh-my-pi/pi-coding-agent@18.5.0`，`prefix: .cache/omp-baseline/18.5.0`，`cliEntry: src/cli.ts` | `agent-runtime-baseline.json.agentRuntime.acceptanceArtifact` | 已安装且 `package.json` version == `18.5.0`；`node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts` 存在；prebuilt natives `pi-natives`、`pi-natives-win32-x64` 存在 |
| `environment.platform` / `arch` | `win32` / `x64` | `agent-runtime-baseline.json.environment`；spec §11 | 本机 win32 x64 |
| `environment.bun` | `1.4.2` | 同上；spec §11 | `bun --version` → `1.4.2` |
| 版本态 | `verified-supported`（仅框架能力 C1–C15；扩展能力不在 upgrade standard 内） | `docs/agent-runtime-support.md` | — |

### 2.2 隔离条件（不可违反）

- 每次运行执行**隔离精确安装**（`.cache/omp-baseline/18.5.0`），并在临时 agent state 下运行；**从不**触碰默认全局安装、正式配置 `~/.omp/agent/config.yml` 或任何运行中的 agent（`agent-runtime-baseline.json.environment.conditions`、`tests/harness/env.ts`、README「Isolation rule」）。
- 本票只读观测（未改动）：正式配置 `~/.omp/agent/config.yml` 的 `extensions:` 列表当前含两个根 —— `E:/Developer/myhub/my-omp-toolkit/extensions`（旧实现发现根）与 `E:/Developer/myhub/my-agent-toolkit/entrypoints/omp`（本框架的发现根）。故 M 层一律使用 explicit-only 根（§4），不做任何正式配置改动。
- 探针与验收产物只落 `.cache/`（gitignored）与系统 temp 下的一次性目录。

### 2.3 非 pinned 版本（候选路径）

- 只有 pinned `18.5.0` 是**支持基线**；其它任何版本（含运行时报出的已安装版本）都不是支持声明，也**不得默认等价**。
- 换版本验收时：先跑 `bun scripts/verify-omp-candidate.ts`（可用 `OMP_TEST_VERSION=<v>` 选择候选，物化到自己的隔离前缀 `.cache/omp-baseline/<v>`，不覆盖固定基线），把该次的结果记录 `.cache/omp-baseline/<v>/candidate-verification.json` 记入该 run 节；或者在该 run 节显式记 `verified-unlisted`（仅安装观测，不承载任何行为证据）。
- 现状（只读观测，不是本迁移验收基线）：本机存在 `18.6.1` 的候选结果记录 `.cache/omp-baseline/18.6.1/candidate-verification.json`（recorded `2026-10-06T20:12:10.880Z`，install exit 0，`bun test tests/framework` 78 pass / 0 fail，`regressionAlarm: green`）。它是回归警报输入，**不是**支持声明；`docs/agent-runtime-support.md` 把 `18.6.1` 与设计期观测到的 `omp/18.4.6` 归入 `verified-unlisted`。

---

## 3. 框架侧（my-agent-toolkit）与扩展配置

### 3.1 框架侧修订与 lockfile

| 项 | 值 | 来源 | 本机核对（2026-10-07） |
|---|---|---|---|
| `sourceCombination.repository` | `my-agent-toolkit`（`path: .`） | `agent-runtime-baseline.json.sourceCombination` | — |
| `revisionAtRecord`（本票录制值） | `57107c513dc893b4e427b590bbed0f19bfb0aba5`（`master`，2026-10-07） | 本票核对（该 JSON 里记录的 `73a76f6cf9091072c85d1fce3df6237b8330d716` 是本仓库更早的一次记录值，见 §5 D-02） | `git rev-parse HEAD` → 相同；分支 `master`；工作区仅有本迁移 tracker 的未跟踪文件 |
| `lockfile` | `bun.lock` `sha256:9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9` | `agent-runtime-baseline.json.sourceCombination.lockfile`（ticket 21 刷新；ticket 01 录制值为 `f78f4d3c…`，之后 configuration 票把 `yaml` 依赖写进 `package.json`/`bun.lock`，见 §5 D-04） | `sha256sum bun.lock` → 相同 |
| 基线机制自校验 | `bun test tests/harness`（含锚点↔产物字节一致、两侧 lockfile、环境条件） | `tests/harness/baseline.ts` / `baseline.test.ts` | 已跑（§6 RR-01：`tests/harness` 全绿）。原自动化计数基线 `framework 78 / extension 24 / harness 9`（`docs/agent-runtime-support.md`，lighthouse 06 §7 引用的同一处）已更新为迁移后实际计数（ticket 21，见 §6 RR-01） |

**实施期规则**：`revisionAtRecord` 只是本票录制时的 HEAD。每条验收 run **必须**在 §6 记录当次实际使用的 `my-agent-toolkit` revision 与其 `bun.lock` sha256（实施会推进 revision）；pinned 的 `18.5.0`、平台与 Bun 版本不随 run 变化。

### 3.2 扩展 `config.yaml` 内容（填写位）

| 项 | 值 |
|---|---|
| 路径约定 | `extensions/<definition.id>/config.yaml`（`config.path` 可覆盖）→ connect-bot: `extensions/connect-bot/config.yaml` |
| 文件内容 | 见下方原文（`sha256:829f88c2886adb725052eb98d9298ccc8cfe7ff799c921eb2726a077e59843a6`）；`endpoint` = `http://127.0.0.1:8787`（面板同主机、loopback；**不再**等于原仓库 `extensions/connect-bot/config.json` 的 `http://omp-bot.local:8787`，见 §5.2 D-07）；无代码级默认值/回退 |
| definition 声明 | `fields: { endpoint: "non-empty-string" }`（P21） |
| 现状核对（2026-10-07，本票） | `extensions/connect-bot/config.yaml` 与 `entrypoints/omp/connect-bot.ts`（`sha256:ae7dfdec16d68964b6f8ee0a17dd52f3ff9cc45c1346bfc67f0880edc5a5b10c`）均存在；`extensions/connect-bot/` 与 `entrypoints/omp/` 各含 codebase-tools + connect-bot |
| 来源 | contract P19–P21；spec §6、§8；lighthouse 05/06 (h) |

```yaml
# The omp-bot panel this extension registers sessions with.
#
# The file is the machine's single source for the endpoint: the framework reads and validates
# it before the extension registers anything, and no default or fallback lives in code, so a
# missing or illegal file refuses the extension instead of letting it run on an invented value.
#
# Same host, so loopback: the panel listens on 0.0.0.0:8787 and a loopback address answers in
# milliseconds. The panel's mDNS name (omp-bot.local) is for browsers and LAN devices; resolving
# it can take longer than the register's 1s budget on first use, which reads as a failed arm.
# Point this at another host only when the panel really runs there.
endpoint: "http://127.0.0.1:8787"
```

---

## 4. 如何重建隔离验收环境（他人按记录可复现）

前提：Windows x64 + Bun `1.4.2`；两个只读 checkout 就位（`../my-omp-toolkit`@`34d7c40…` 冻结、`../omp-bot`@`d50e35c…` 运行中）；本仓库 `my-agent-toolkit` 处于记录的 revision。全程**不**改默认全局安装、正式配置或运行中 agent。

```bash
# 0) 版本前置（必须与 §2.1 一致）
bun --version                                   # 期望 1.4.2

# 1) 本仓库依赖（只影响本仓库工作区，不动全局安装）
bun install

# 2) 物化隔离精确安装（幂等；落 .cache/omp-baseline/18.5.0，从不触碰默认全局安装）
bun test tests/harness                          # 或：bun scripts/verify-omp-candidate.ts --install-only

# 3) 基线自校验（锚点↔产物字节一致、两侧 lockfile、环境条件断言）
bun test tests/harness/baseline.test.ts

# 4) M 层人工观察：explicit-only 装载 + 一次性 agent state + 隔离精确安装的 CLI
PI_CODING_AGENT_DIR=<throwaway-dir> bun \
  .cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts \
  --no-extensions -e E:/Developer/myhub/my-agent-toolkit/entrypoints/omp \
  --model <provider>/<model>
```

- **explicit-only 装载**：`--no-extensions -e <repo>/entrypoints/omp`（load-source mutual exclusion 的开发/验收一侧，见 `docs/agent-runtime-support.md#load-source-mutual-exclusion`）。默认配置发现根里的旧实现在此模式下不被发现；验收不得依赖默认配置。
- **隔离 agent state**：`PI_CODING_AGENT_DIR` 指向一次性目录；harness 另外剥除所有解析偏移变量（`OMP_PROFILE`、`PI_PROFILE`、`OMPCODE`、`PI_CONFIG_FILES`、`XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_STATE_HOME`/`XDG_CACHE_HOME`、`PI_CODING_AGENT_DIR`、`OMP_AUTH_BROKER_*`）——见 `tests/harness/env.ts`。隔离 agent state 初始为空，需要时先用它登录要跑的模型（凭据只落该一次性目录）。
- **每次运行的隔离目录**：`agent-state` / `sessions` / `work` / `captures` 全部在 OS temp 的一次性 run root 下（`tests/harness/run-root.ts`）；可用 `listRunArtifacts` 列出落盘物以证明没有写到默认环境或仓库。
- **自动化前置**（M 层入场条件，已满足）：全量 `bun run test`（framework + codebase-tools + connect-bot + harness）全绿 + loader/admission（`tests/framework/deployment.test.ts`）绿 + `bun run typecheck` 通过 = release gate，见 §6 RR-01。
- **connect-bot 入场前置**：`entrypoints/omp/connect-bot.ts` 与 `extensions/connect-bot/config.yaml` 已落地（§3.2），上述第 4 步可直接执行 connect-bot 的 M 层步骤；可直接照做的步骤清单（前置/操作/观察点/预期）在 §7，清单来源 [lighthouse 06 §6](lighthouse/06-acceptance-contract.md#6-人工观察清单m-层)。

---

## 5. 证据位、差异登记与未验证项

### 5.1 证据位约定

- 证据根：`.scratch/connect-bot-migration/runs/<run-id>/`
  - `screenshots/<step>-<n>.png` —— M 层面板/TUI 截图位（步骤字母用 lighthouse 06 §6 的 A–M）
  - `logs/<step>-<name>.txt` —— stderr / RPC frame 尾 / 命令回执
  - `logs/<step>-<name>.json` —— 出站请求捕获、session JSONL 摘要、`candidate-verification.json` 副本
  - `run.json`（可选）—— 该次 run 的机器可读头部（与 §6 头部同字段）
- 截图/日志不写进本文件正文；本文件只留路径与结论。

### 5.2 差异登记（逐条交用户判断，不做自动裁决）

| ID | 差异 | 核对事实 | 处置 |
|---|---|---|---|
| D-01 | 行为基线修订与 `my-omp-toolkit` 当前 HEAD 不一致 | 权威来源（spec §11、lighthouse 01/06 §6）记录 `master@34d7c40`；本机 2026-10-07 HEAD = `3171df3c0724da5f909ea3a9187959a6b322c909`（`migrate codebase-tools to new framework`, 2026-10-07），且 `34d7c40` 是其祖先。`extensions/connect-bot` 目录树在 `df2554c`、`34d7c40`、`3171df3` 三处同为 `5d6340f…`，工作区无未提交修改 | 本记录按权威来源填 `master@34d7c40` 为冻结修订；同时记录观测到的 HEAD。是否需要把锚点推进到 `3171df3`（或改以目录树哈希为准）待用户裁定；在裁定前，扩展行为基线以目录树哈希 `5d6340f…` 为可核对判据。**ticket 21 补充**：该 HEAD 领先使 `tests/harness/baseline.test.ts` 的 oracle 修订断言变红（记录修订 vs checkout HEAD），处置见 D-03；**记录值与冻结仓库均未改写**，最终裁定仍属维护者（H3/24 号票） |
| D-02 | `docs/agent-runtime-baseline.json.sourceCombination.revisionAtRecord` = `73a76f6cf9091072c85d1fce3df6237b8330d716` ≠ 本机 HEAD `57107c5…` | 该 JSON 的 `recorded` 为 2026-10-07（`73a76f6` 是此前一次"update docs"提交）；ticket 01 未改该文件 | 属该文件自身的记录时点差；刷新策略见 README §H4 / 支持记录（维护者动作）。ticket 21 只刷新了同节的 `lockfile.sha256`（D-04，测试自身的 `REFRESH_HINT` 所要求）；`revisionAtRecord` 保持不变——它记的是某次提交，而交付状态是本迁移的未提交工作区，提交时由维护者一并刷新 |
| D-03 | `tests/harness/baseline.test.ts` 的 oracle 修订断言（`checkout.commit === record.oracle.revision`）与冻结仓库的现实冲突 | oracle checkout `../my-omp-toolkit` 的 HEAD = `3171df3…`（见 D-01），而 `record.oracle.revision` = `34d7c40…`（权威值，冻结基线，且是 HEAD 的祖先）；该仓库自己的后续提交 `3171df3` 正是把被迁移的 codebase-tools 材料从那里移走的提交。修订对象与两侧 lockfile 均未动 | 断言改为问「记录修订是否仍在 checkout 历史里」（`checkoutCarries`，`git merge-base --is-ancestor`），**记录值与冻结仓库都不改写**：记录钉的是材料来源修订，环境只能保证该修订可达。新增断言 `the oracle checkout carries the recorded revision`；最终是否推进锚点仍交维护者（D-01） |
| D-04 | `docs/agent-runtime-baseline.json.sourceCombination.lockfile.sha256` 记录的 `f78f4d3c…` ≠ 工作区 `bun.lock` 的 `9e9f4833…` | configuration 票把 `yaml@^2.9.1` 写进 `package.json`/`bun.lock`（`package.json` diff: +dependencies; `bun.lock`: +5 行），记录未随之刷新 → `baseline record > records the lockfiles…` 与 `controlled session > …` 两条红 | ticket 21 按该测试自己的 `REFRESH_HINT`（"a deliberate dependency change"）刷新记录值；**无断言被放宽或删除**：两条测试恢复为真检查工作区 lockfile 与记录一致 |
| D-05 | `tests/codebase-tools/marker-lifecycle.test.ts` 的 marker 区帧数断言与「同一进程里绑定了几个声明 marker 的扩展」耦合 | connect-bot 落进同一发现根后，会话边界会为每个声明 marker 的扩展刷新一次同一区域，于是边界帧数从 1 变 2（`marker area over one command toggle` 与 `a restored activation value` 两条红）。渲染内容未变（区域是框架自有的一个 widget，内容是其 State 的纯投影） | ticket 21 把断言改为表达**渲染内容 + 该扩展自身发布的精确增量**：边界断言 `≥1` 帧且每帧都是该会话的空渲染，扩展自己的 toggle/启用轮/off 仍逐次 `+1` 帧并断言内容（`on/off` 的行、清除、恢复后的行）；**记录内容与判据不变，改为不再钉内部帧计数**（该计数既非契约承诺，也随绑定扩展数变化）。同时给 `areaFrames` 加了帧来源说明 |
| D-06 | `.scratch/codebase-tools-omp-v1/**` 资产被删除，13 处引用失效（v1 迁移留下的 link rot） | `git grep codebase-tools-omp-v1` = 15 处（12 个 markdown 链接 + 1 处行内路径 + 2 处非链接提及，见 §5.4） | 只按 19 号票的保守方案改 `docs/agent-runtime-support.md:33` 的计数基线链接指向迁移侧证据（本记录 RR-01）；其余 12 处**不重指不存在的资产**，登记在 §5.4 与 §8 待人工确认项 |
| D-07 | 首次 `/connect-bot` 接入失败（用户 2026-10-07 M 层现场报告） | 冻结基线与迁移实现的 register 预算都是 ≤1s；`omp-bot.local` 是 mDNS 名，首次解析在本机可长达 ~3s 甚至超时（实测：fresh Bun 进程首次 `fetch` 2945ms、其后同进程/新进程 218ms；稍后 `curl` 报 `Resolving timed out after 2008ms`），超过 1s 即 disarm 并报「无法连接」；面板本身正常（`127.0.0.1`/已解析的 `.local` 下 register 返回 200 `{"outcome":"registered","onlineCount":N}`，0.17ms–0.17s），`omp-bot.toml` 的 `listen_addr = "0.0.0.0:8787"`。该现象在冻结基线同样存在，**非迁移回归** | 用户裁定（2026-10-07）改用 loopback：`extensions/connect-bot/config.yaml` 的默认 `endpoint` 由 `http://omp-bot.local:8787` 改为 `http://127.0.0.1:8787`；register 的 1s 预算与其它协议不变。spec §6 / lighthouse 05 的旧默认值属冻结语料不改写；README §H3b、§3.2、§7 P3 已同步；`tests/connect-bot/{arm,heartbeat,off,state-machine}.test.ts` 的 `ENDPOINT` 常量随文件更新 |

### 5.3 未验证项（截至 ticket 21）

| 项 | 状态 | 说明 |
|---|---|---|
| `bun test tests/harness`（基线机制自校验） | 已验证 | ticket 21 跑过：9 pass / 0 fail（§6 RR-01）；并含 D-03 的 oracle 修订断言调整 |
| `extensions/connect-bot/config.yaml` 与 `entrypoints/omp/connect-bot.ts` 是否存在且内容正确 | 已验证（存在 + 内容） | §3.2（原文 + sha256）；两者的**真实运行效果**属 M 层（A–M），未开始 |
| M 层真实 OMP × omp-bot 集成（lighthouse 06 §6 A–M） | 未开始（人工） | P46（22 号票）；清单与证据位已备（§7），每步结果按 §6 RR-02 追加 |
| 永久切换/回退（H2） | 未开始（人工） | P47（23 号票）；步骤与回退修订在 [README §H3](../../README.md#h3--permanent-cutover-and-cutover-smoke) |
| 维护者最终判断（H3：接受/回退/范围） | 未开始（人工） | P48（24 号票）；输入 = 全部自动证据 + H1/H2 结果 + §5.2 的 D-01…D-07 |
| 13 处 v1 link rot（`.scratch/codebase-tools-omp-v1/**`） | 登记，未修（只修 1 处） | §5.4；保守方案只改 `docs/agent-runtime-support.md:33`，其余不重指不存在的资产 |
| 各票回报的偏离项（register body 不再发 `pid`/`sessionFile`；心跳 `reason` 用语义名） | 登记（代码可核对） | §8 待人工确认项 |

### 5.4 非证据清单核对（P45）与 v1 link rot 清单（D-06）

**P45 核对结论（ticket 21，抽查全部新套件 `tests/framework`、`tests/connect-bot`、`tests/codebase-tools`、`tests/harness`）**：未发现 mock 自证、pty 脚本、顺带默认值断言、重复测试框架既有能力；源码文本断言只剩「机械边界扫描」一类，逐条如下（均属允许的例外，界限 = 断言的是**哪段代码允许接触哪种原生面/哪一侧拥有某个事实**这一结构性事实，且其中每一条都有同文件或邻文件的**行为侧**用例；被扫描代码是产品源码，不是测试的期望值来源）：

| 文件 | 扫描的事实 | 行为侧对照 |
|---|---|---|
| `tests/framework/import-boundary.test.ts` | `framework/adapters/**`、`extensions/*/runtimes/**` 之外不出现原生类型/原生 hook（词法，机械） | `tests/framework/deployment.test.ts`（真 loader 装载与 bind） |
| `tests/connect-bot/native-timer-boundary.test.ts` | 共享源不命名原生定时器；`runtimes/omp.ts` 才用 `ctx.setInterval`/`ctx.clearTimer` | `tests/connect-bot/heartbeat.test.ts`（managed timer 驱动心跳） |
| `tests/connect-bot/native-session-boundary.test.ts` | 扩展自己不给原生 session 事件（`session_switch`/`session_shutdown`/…）注册 hook | `tests/connect-bot/session-switch.test.ts`（切会话经语义 `session_end` 生效） |
| `tests/connect-bot/no-panel-expiry.test.ts` | 扩展侧无 30s 逻辑/无 `last_seen` 字段（面板才拥有过期） | `tests/connect-bot/heartbeat.test.ts`（10s 心跳是唯一自有周期） |
| `tests/connect-bot/feedback.test.ts`（"no status code decides a sentence"） | `selectFeedback` 源码里不出现运状态码词汇（词法，机械） | 同文件的全表文案断言 + `tests/connect-bot/off.test.ts`（`200`/`404` 走到同一行） |

**v1 link rot 清单（`git grep -n codebase-tools-omp-v1`，均指向已删除的 `.scratch/codebase-tools-omp-v1/**`）**：

| # | 位置 | 形态 | ticket 21 处置 |
|---|---|---|---|
| 1 | `docs/agent-runtime-support.md:33` | markdown 链接（counts 证据 `assets/12/`） | **改指**迁移侧证据（本记录 §6 RR-01），并按票更新计数 |
| 2 | `README.md:98` | markdown 链接（green-run 日志） | 不重指（待人工决定重指/删除） |
| 3 | `README.md:100` | markdown 链接（`assets/12/README.md` §5） | 同上 |
| 4 | `README.md:116` | markdown 链接（`assets/11/captures/codex/`） | 同上 |
| 5 | `docs/agent-runtime-support.md:96` | markdown 链接（`assets/11/captures/deepseek/`） | 同上 |
| 6 | `docs/semantic-extension-framework-backlog.md:5` | markdown 链接（v1 `map.md`） | 同上 |
| 7–12 | `docs/semantic-extension-framework-backlog.md:9,13,17,19,21,23` | markdown 链接（v1 lighthouse `02/04/05/06`） | 同上 |
| 13 | `docs/agent-runtime-support.md:100` | 行内路径（`assets/11/probes/role-capture.ts`） | 同上 |
| — | `docs/agent-runtime-baseline.json:23` | 非链接：byte-identity 的 `source` 字符串提及 v1 decision 03 | 只登记（该字符串是结论出处描述） |
| — | `tests/harness/index.ts:9` | 非链接：注释里的 v1 probe 路径 | 只登记 |

### 5.5 有意修改的历史约束核对（P43）

lighthouse 06 §8 的三类有意修改**只在迁移侧/移植后产物同步断言**（原仓库 `../my-omp-toolkit` 冻结，只读核对）：

| 有意修改 | 迁移侧同步断言（证据） | 原仓库状态（2026-10-07 只读） |
|---|---|---|
| 连接标识/通知移入框架 marker 区与统一反馈口 | `tests/connect-bot/arm.test.ts`（框架区域 key `semantic-extensions` / `aboveEditor` / 文本 `◈ connectBot`，通知走 `info\|error` 通道）、`tests/connect-bot/feedback.test.ts`（A–J 文案）、`tests/framework/marker.test.ts` + `declared-value-write.test.ts`（区域框架所有、按 id 排序、无 UI no-op） | 未改：旧实现仍自写 footer/自有通知（`d3648a0:extensions/connect-bot/index.ts`） |
| `offline` → `off` | `tests/connect-bot/off.test.ts`（`offline` 现在是未识别参数，报用法错且不改状态）、`tests/connect-bot/feedback.test.ts`（用法提示只写 `off`）、`tests/connect-bot/guards.test.ts` | 未改：旧实现把 `offline` 当合法词 |
| config 缺文件从「默认 + 告警」改为「error + 不加载」 | `tests/framework/config.test.ts`（缺文件/不可读/坏 YAML/顶层非对象/键缺失/类型不符 → `BindingFailure{kind:"configuration", violation:{kind:"config"}}` + `reportDiagnostic` + 不加载、无代码级默认值）、`tests/framework/deployment.test.ts`（真 loader 下 decoy `endpoint: 8787` 不生效，绑定按扩展仓库根的约定文件） | 未改：旧实现有 `config.json` + 代码默认值 |

停靠核对：`git -C ../my-omp-toolkit status --porcelain` 为空；`git -C ../my-omp-toolkit rev-parse HEAD` = `3171df3…`（观测值，非本迁移改动，见 D-01）；`extensions/connect-bot` 目录树在 `34d7c40` 与 HEAD 同为 `5d6340f…`；oracle `bun.lock` = `ddf372c5…`（与记录一致）。本仓库内**无红断言残留**：gate 全绿（RR-01），三类有意修改在迁移侧各有对应断言。本票唯一的断言形态调整是 D-05（marker 区帧数耦合 → 渲染内容 + 该扩展自身发布的增量，判据未变）与 D-03（oracle 修订「等于 HEAD」→「仍在 checkout 历史」，记录值未变）。

---

## 6. Run 节（每次验收 run 追加一节）

模板（复制后逐项填写；不引用的行删除）：

```markdown
### RR-<号>：<目的，例：M 层人工观察 A–M / release gate / 永久切换冒烟>

- 对应票: <票号 / promise>
- 执行者: <姓名或 agent id>
- 日期: <YYYY-MM-DD>
- 源基线: my-omp-toolkit master@34d7c4061a74a73b478067882cba7956821f3c1d（冻结）+ extension tree 5d6340fba851a2f468e6d4f261dd9c7e554077bb
- 面板基线: omp-bot@d50e35c073c0f5eb8ab679ec9bd49c4608831dd8
- 支持基线: @oh-my-pi/pi-coding-agent@18.5.0（隔离安装 .cache/omp-baseline/18.5.0）+ <platform/arch> + Bun 1.4.2
  - 若偏离 pinned：candidate 校验结果 <路径 / verified-unlisted>
- 框架侧 revision: <my-agent-toolkit commit> + bun.lock sha256 <…>
- 扩展配置: extensions/connect-bot/config.yaml <sha256 或"本节附原文">
- 装载方式: --no-extensions -e <repo>/entrypoints/omp + PI_CODING_AGENT_DIR=<throwaway>
- 证据根: .scratch/connect-bot-migration/runs/<run-id>/
- 结论: <通过 / 通过但有登记项 / 未通过>

| 步骤 | 操作 | 观察点 | 预期 | 结果 | 证据 |
|---|---|---|---|---|---|
| <ID> | <命令/动作> | <观察什么> | <来自票/清单的预期> | <通过/不通过/观察> | <runs/<run-id>/…> |
```

M 层步骤的 ID、操作、观察点与预期见 §7（清单来源 [lighthouse 06 §6](lighthouse/06-acceptance-contract.md#6-人工观察清单m-层)）；结果留「通过 / 不通过 / 观察」，未通过项与差异同样登记到 §5.2。

### RR-00：基线冻结核对（本票，2026-10-07）

- 对应票: 01（P41）
- 执行者: agent（ticket 01）
- 日期: 2026-10-07
- 源基线: `my-omp-toolkit` `master@34d7c40…`（冻结）+ extension tree `5d6340f…`
- 面板基线: `omp-bot@d50e35c…`
- 支持基线: `@oh-my-pi/pi-coding-agent@18.5.0`（隔离安装 `.cache/omp-baseline/18.5.0`）+ win32/x64 + Bun 1.4.2
- 框架侧 revision: `57107c5…` + `bun.lock` `sha256:f78f4d3c…`
- 装载方式: 不适用（本 run 只读核对，未启动任何会话）
- 证据根: 无独立证据文件（下表证据均为只读命令输出，逐条见 §1–§3 的「本机核对」列）

| 步骤 | 操作 | 观察点 | 预期 | 结果 | 证据 |
|---|---|---|---|---|---|
| BV-1 | `git rev-parse --abbrev-ref HEAD` / `git rev-parse HEAD`（`../my-omp-toolkit`） | 冻结分支与修订 | `master`；`34d7c40…` | **观察**：`master`；HEAD = `3171df3c…`（领先 1 提交）→ 登记 D-01 | §1.1、§5.2 |
| BV-2 | `git log --all --format=%H -- extensions/connect-bot` | connect-bot 只存在于一个提交 | 恰 1 条 = `d3648a0…` | 通过（1 条） | §1.1 |
| BV-3 | `git rev-parse {df2554c,34d7c40,3171df3}:extensions/connect-bot` | 扩展目录在三个修订上逐字节相同 | 三者同 hash | 通过（同为 `5d6340f…`） | §1.1 |
| BV-4 | `git status --porcelain`（含 `extensions/connect-bot`） | 开发期冻结：无未提交修改 | 0 行 | 通过（0 行；含该目录 0 行） | §1.1 |
| BV-5 | `git -C ../omp-bot rev-parse HEAD` + 工作区状态 | 面板修订未被改动 | `d50e35c…`，干净 | 通过 | §1.2 |
| BV-6 | `bun --version` | Bun 版本 | `1.4.2` | 通过 | §2.1 |
| BV-7 | `git -C ../oh-my-pi rev-parse HEAD` + `git describe --tags` | revision anchor | `9348320…` = `v18.5.0` | 通过 | §2.1 |
| BV-8 | 读 `.cache/omp-baseline/18.5.0/node_modules/@oh-my-pi/pi-coding-agent/{package.json,src/cli.ts}`；列 `@oh-my-pi/pi-natives*` | 隔离精确安装与 cliEntry | version `18.5.0`；`src/cli.ts` 与 prebuilt natives 存在 | 通过 | §2.1 |
| BV-9 | `sha256sum bun.lock`（本仓库、`../my-omp-toolkit`） | lockfile 与基线记录一致 | 与 `agent-runtime-baseline.json` 相同 | 通过（两侧均相同） | §1.1、§3.1 |
| BV-10 | 只读读 `~/.omp/agent/config.yml` 的 `extensions:` | 默认正式配置未被改动 | 只读观测 | **观察**：列表含旧根与 `entrypoints/omp` 两个发现根；本票未修改 → 环境事实，M 层改用 explicit-only 根 | §2.2、§4 |
| BV-11 | `ls ~/.omp/agent/extensions` | 本机无已安装的 connect-bot 副本 | 空 | 通过（空） | §1.1 |

- 结论: **通过（含 1 项登记差异 D-01、1 项只读观测 BV-10）**

### RR-01：release gate（ticket 21，2026-10-07）

- 对应票: 21（P43、P45）
- 执行者: agent（ticket 21）
- 日期: 2026-10-07
- 源基线: `my-omp-toolkit` `master@34d7c40…`（冻结）+ extension tree `5d6340f…`；本机 oracle checkout HEAD = `3171df3…`（观测值，记录值未改写，见 D-01/D-03）
- 面板基线: `omp-bot@d50e35c…`（本 run 不启动面板；面板不参与自动 gate）
- 支持基线: `@oh-my-pi/pi-coding-agent@18.5.0`（隔离安装 `.cache/omp-baseline/18.5.0`；其 `package.json` version = `18.5.0`）+ win32/x64 + Bun `1.4.2`（`bun --version`）
- 框架侧 revision: `57107c513dc893b4e427b590bbed0f19bfb0aba5`（`master`；交付状态 = 该提交 + 本迁移尚未提交的工作区）+ `bun.lock` `sha256:9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9`
- 扩展配置: `extensions/connect-bot/config.yaml` `sha256:447546d1…`（§3.2 原文）
- 装载方式: 不适用（本 run 是套件 gate，未手工启动会话）；套件内部各自驱动隔离装载（`ControlledSession` 以 `--no-extensions -e …` + 临时 agent state）
- 证据根: `.scratch/connect-bot-migration/runs/rr-01-release-gate/logs/`（`G-1-to-G-6-gate-and-counts.txt` = 本次 gate 与分套件计数原文；`G-first-run-before-fixes.txt` = 处置前首跑原文）

| 步骤 | 操作 | 观察点 | 预期 | 结果 | 证据 |
|---|---|---|---|---|---|
| G-1 | `bun run typecheck` | 类型检查 | 0 错 | 通过（exit 0） | `runs/rr-01-release-gate/logs/G-1-to-G-6-gate-and-counts.txt` |
| G-2 | `bun run test`（全量） | framework + codebase-tools + connect-bot + harness | 全绿 | 通过：**367 pass / 0 fail**（42 files，50.96s） | 同上 |
| G-3 | `bun test tests/framework` | 框架套件 | 全绿 | 通过：231 pass / 0 fail（21 files） | 同上 |
| G-4 | `bun test tests/connect-bot` | 扩展套件（E 层） | 全绿 | 通过：103 pass / 0 fail（12 files） | 同上 |
| G-5 | `bun test tests/codebase-tools` | 既有扩展回归（真隔离安装会话） | 全绿 | 通过：24 pass / 0 fail（7 files，40.33s） | 同上 |
| G-6 | `bun test tests/harness` | 基线机制自校验（锚点↔产物字节一致、两侧 lockfile、环境条件、oracle 修订可达） | 全绿 | 通过：9 pass / 0 fail（2 files） | 同上 |
| G-7 | `git -C ../my-omp-toolkit status --porcelain`；`rev-parse HEAD`；`rev-parse {34d7c40,HEAD}:extensions/connect-bot` | 原仓库冻结 | 工作区空；扩展目录树未变 | 通过（空；同为 `5d6340f…`；HEAD = `3171df3…` 为观测值） | §5.5 |
| G-8 | 证据集核对（P45） | 抽查全部新套件 | 无 mock 自证 / 源码文本断言 / pty / 顺带默认值 / 重复框架能力 | 通过（例外只有机械边界扫描，界限见 §5.4） | §5.4 |
| G-9 | 有意修改的历史约束核对（P43） | 三类有意修改只在迁移侧同步 | 原仓库未改、无红断言残留、无弱化 | 通过 | §5.5 |

同一交付状态的首跑为 **362 pass / 5 fail**（`runs/rr-01-release-gate/logs/G-first-run-before-fixes.txt`）：2 条 marker 区帧数耦合（D-05）、2 条记录过期的 lockfile（D-04）、1 条 oracle 修订断言（D-03）。五条均**非行为回归**（渲染内容与需求行为未变，是记录过期与断言耦合），逐条登记并处理后全绿。

- 结论: **通过**（3 条与 gate 相关的登记差异 D-03/D-04/D-05 已处置；D-01/D-02/D-06 为既有/人工项）

### RR-02：M 层人工观察 A–M（待执行，22 号票）

- 对应票: 22（P46）；清单与前置见 §7
- 执行者: **留位**（姓名/机器）
- 日期: **留位**（YYYY-MM-DD）
- 源基线: `my-omp-toolkit` `master@34d7c40…`（冻结）+ extension tree `5d6340f…`
- 面板基线: `omp-bot@d50e35c…`
- 支持基线: `@oh-my-pi/pi-coding-agent@18.5.0`（隔离安装 `.cache/omp-baseline/18.5.0`）+ win32/x64 + Bun 1.4.2
  - 若偏离 pinned：candidate 校验结果 `<路径 / verified-unlisted>`
- 框架侧 revision: **留位**（`<my-agent-toolkit commit>` + `bun.lock` sha256；验收当时值）
- 扩展配置: `extensions/connect-bot/config.yaml` `sha256:447546d1…`（§3.2 原文）
- 装载方式: `--no-extensions -e <repo>/entrypoints/omp` + `PI_CODING_AGENT_DIR=<throwaway>`
- 证据根: `.scratch/connect-bot-migration/runs/<run-id>/`（`screenshots/A-1.png` … `logs/M-*.txt`，命名见 §5.1）
- 结论: **留位**（通过 / 通过但有登记项 / 未通过）

逐步结果（操作、观察点与预期见 §7.2；结果填「通过 / 不通过 / 观察」，未通过项登记到 §5.2）：

| 步骤 | 结果 | 证据 |
|---|---|---|
| A 面板就绪 | 留位 | `screenshots/A-1.png` |
| B 接入成功 | 留位 | `screenshots/B-1.png`、`logs/B-notification.txt` |
| C 幂等重注册 | 留位 | `screenshots/C-1.png` |
| D 轮次结束与状态往返 | 留位 | `screenshots/D-1.png`、`D-2.png` |
| E 兜底终态（abort / 无 assistant） | 留位 | `screenshots/E-1.png` |
| F 主动离线 | 留位 | `screenshots/F-1.png` |
| G 杀进程 30–35s 过期 | 留位 | `screenshots/G-1.png`、`G-2.png` |
| H 面板失联自动 disarm | 留位 | `logs/H-*.txt`、`screenshots/H-1.png` |
| I 守卫（no-UI / 未知参数） | 留位 | `logs/I-*.txt` |
| J 多会话隔离 | 留位 | `screenshots/J-1.png` |
| K 与 codebase-tools 共存 | 留位 | `screenshots/K-1.png` |
| L 新旧装载互斥 | 留位 | `logs/L-*.txt` |
| M 配置切换 | 留位 | `screenshots/M-*.png`、`logs/M-*.txt` |

---

## 7. M 层人工观察清单（可直接照做；来源：[lighthouse 06 §6](lighthouse/06-acceptance-contract.md#6-人工观察清单m-层)）

本层是**人工观察**：真实 OMP × 真实 omp-bot 面板、浏览器与杀进程/停面板的现场时序，不作自动化门，也不做 pty 脚本（lighthouse 06 §5、spec Testing Decisions）。结果填 §6 RR-02。

### 7.1 前置（全部满足才可开始）

| # | 前置 | 核对方式 |
|---|---|---|
| P1 | 源基线冻结：`../my-omp-toolkit` = `master@34d7c40…`（扩展唯一提交 `d3648a0`），只读 | §1.1；`git -C ../my-omp-toolkit status --porcelain` 为空 |
| P2 | 自动化前置（release gate）已过：`bun run test` 全绿 + `bun run typecheck` 通过 | §6 RR-01 |
| P3 | 面板 `../omp-bot@d50e35c…` 运行中；其 `listen_addr`（`0.0.0.0:8787`）覆盖 `extensions/connect-bot/config.yaml` 的 `endpoint`（`http://127.0.0.1:8787`，loopback）；浏览器已打开 | §1.2、§3.2、§5.2 D-07 |
| P4 | 隔离精确安装 `.cache/omp-baseline/18.5.0`；Bun `1.4.2`；win32/x64 | §2.1；`bun test tests/harness`（幂等物化） |
| P5 | 一次性 agent state：`PI_CODING_AGENT_DIR=<throwaway>`（如 `.cache/tui-accept/agent-state`）；需要时先在该目录登录要跑的模型 | §4 |
| P6 | 装载：`--no-extensions -e <repo>/entrypoints/omp`（旧实现在此模式下不被发现） | §4 第 4 步的命令 |
| P7 | 证据根 `.scratch/connect-bot-migration/runs/<run-id>/{screenshots,logs}/` | §5.1 |
| P8 | 每次 run 记录头（框架 revision + `bun.lock` / `config.yaml` sha256 / 执行者 / 日期） | §6 RR-02 头部 |

### 7.2 步骤 A–M（操作 → 观察点 → 预期）

| 步骤 | 操作 | 观察点 | 预期 | 结果 | 证据 |
|---|---|---|---|---|---|
| A | 不启动 OMP；浏览器打开面板 | 标题、tab、空态 | 标题 `omp-bot`；tab `控制面板`、`会话列表`；空态无卡片 | 留位 | `screenshots/A-1.png` |
| B | 在 OMP 会话执行 `/connect-bot` | marker 区、UI 通知、面板卡片 | marker 出现 `◈ connectBot`；通知 `已接入 omp-bot 面板（当前 N 个在线会话）`（N 与卡片数一致）；卡片 ≤1s 出现且字段正确（新会话状态 `空闲`） | 留位 | `screenshots/B-1.png`、`logs/B-notification.txt` |
| C | 再次执行 `/connect-bot` | 在线数、卡片数、闪烁 | N 不变；仍一张卡片；不闪烁；不新增行 | 留位 | `screenshots/C-1.png` |
| D | 发一条真的会让 agent 干活的提示 | 卡片状态、tab 圆点、结束提示 | 先 `工作中`；轮次结束转 `等待用户输入`；卡片置顶高亮；tab 圆点；提示 `1 个刚结束轮次` + 「知道了」；点「知道了」清计数、圆点保留；静置 ≥35s 不迁移、不重复提示 | 留位 | `screenshots/D-1.png`、`D-2.png` |
| E | 在 `工作中` 中断（Esc/abort），使本轮无 assistant 结果 | 兜底终态 | 仍进入 `等待用户输入`，不卡 `工作中` | 留位 | `screenshots/E-1.png` |
| F | `/connect-bot off` | 通知、marker、面板行 | 通知 `已断开 omp-bot 面板`；marker 消失；面板行立即消失 | 留位 | `screenshots/F-1.png` |
| G | 结束 OMP 进程（Ctrl-C / 结束进程） | 面板行 | 行保留；30–35s 后转 `已离线` 并下沉 | 留位 | `screenshots/G-1.png`、`G-2.png` |
| H | 停掉 omp-bot 面板进程，在已接入会话静置 ≈35s；随后面板仍停时执行 `/connect-bot off` | 两次通知、marker、是否自动重连 | 首次失败通知 `与 omp-bot 面板连接中断；若持续失败将自动断开`；≈30s 后 `与 omp-bot 连接中断，已断开；重新执行 /connect-bot 可重连`、marker 消失、不自动恢复；面板已停时 `off` → `omp-bot 面板未响应` | 留位 | `logs/H-*.txt`、`screenshots/H-1.png` |
| I | 以 `--no-ui` 启动 OMP 并执行 `/connect-bot`；另执行 `/connect-bot foo` | stderr、出站请求、状态 | no-UI：stderr 一行 `当前模式无 UI，不支持接入面板` 且不发请求；未知参数：报错 `未知参数「foo」；用法：/connect-bot（接入 omp-bot 面板）或 /connect-bot off（断开）。` 且状态不变 | 留位 | `logs/I-*.txt` |
| J | 开第二个 OMP 实例（各自 `PI_CODING_AGENT_DIR`）并接入；在该会话里触发一次子代理 | 两行独立性 | 两行各自独立；子代理事件不产生新行、不改父行状态 | 留位 | `screenshots/J-1.png` |
| K | 在同一会话执行 `/codebase-tools`（两次：开、关） | 同区两 marker、两命令、文案 | 两 marker 在同一区按扩展 id 排序（`◈ codeBaseTools` 在 `◈ connectBot` 之前）；两命令互不干扰；codebase-tools 文案仍 `codeBaseTools enabled` / `codeBaseTools disabled` | 留位 | `screenshots/K-1.png` |
| L | 观察 explicit-only 装载下旧实现是否被发现；再按回退路径（去新根、留旧根、重启）装载一次 | 新旧互斥 | 旧实现未被发现（无重复 marker/命令）；回退路径可用 | 留位 | `logs/L-*.txt` |
| M | `/connect-bot off` → 停旧实现 → endpoint 从旧 `config.json` 手工搬入 `config.yaml` → 整进程重启 → 重新 `/connect-bot` | 切换与回退对称 | 重新接入成功、新 marker/卡片正确；旧行 30–35s 过期；回退对称（恢复旧根、移除新根、重启后旧行为可用） | 留位 | `screenshots/M-*.png`、`logs/M-*.txt` |

两条与迁移期有意变更相关的预期，照做时按**现状**（不是旧实现）判读：

- **命令词形**：断开是 `/connect-bot off`；`/connect-bot offline` 现在是未识别参数（报用法错），不是合法形式（P37、§5.5）。
- **marker 与文案载体**：`◈ connectBot` 由框架 marker 区发布（不是扩展自写 footer），所有面向操作者的文案走框架统一 `info|error` 通道（有 UI 走通知、无 UI 落 stderr）。

---

## 8. 尚待人工确认项（交接清单）

| # | 尚待人工确认项 | 由谁/何时 | 已备证据 |
|---|---|---|---|
| 1 | 真实 OMP × omp-bot 集成（lighthouse 06 §6 A–M：接入/重注册/状态/心跳/失联/切会话/恢复 + 多会话隔离 + codebase-tools 共存 + 新旧互斥 + 配置切换） | 用户执行（22 号票 / P46） | §7 可直接照做的清单 + §6 RR-02 结果位；自动化前置已过（RR-01）；M 层结果**未验证**直到用户回报 |
| 2 | 永久切换/回退（移除旧发现入口 + 加入新根 + 整进程重启；回退对称） | 用户执行（23 号票 / P47） | [README §H3](../../README.md#h3--permanent-cutover-and-cutover-smoke)（H3a codebase-tools / H3b connect-bot）+ §3.2 endpoint 搬运来源 + 旧行 30–35s 过期说明 |
| 3 | 维护者最终判断（H3：接受/回退/范围） | 维护者（24 号票 / P48） | 全部自动证据（§6 RR-01）+ §5.2 差异 D-01…D-07 + §5.4/§5.5 + H1/H2 结果 |
| 4 | D-01/D-03：行为基线锚点是否推进到 `3171df3`（或改以目录树哈希为准） | 维护者裁定 | 记录值与冻结仓库均未改写；`checkoutCarries` 断言已就位；扩展目录树 `5d6340f…` 在 `df2554c`/`34d7c40`/HEAD 三处相同；oracle lockfile `ddf372c5…` 与记录一致 |
| 5 | D-02：`agent-runtime-baseline.json.sourceCombination.revisionAtRecord` 的刷新 | 维护者（提交时一并刷新） | 本次只刷新 `lockfile.sha256`（D-04，测试 `REFRESH_HINT` 所要求） |
| 6 | 13 处 v1 link rot（`.scratch/codebase-tools-omp-v1/**`）的最终处置（重指/删除） | 维护者 | §5.4 清单：1 处已改指迁移侧证据，12 处**不重指不存在的资产**、只登记 |
| 7 | 各票回报的偏离项 | 维护者核对 | register body 现在是 `{cwd, sessionName?, model?}`，不再发 `sessionFile` 与 `pid`（旧实现：`d3648a0:extensions/connect-bot/index.ts` `registerData`，含 `cwd/sessionName?/sessionFile?/model?` + `data.pid = process.pid`）；心跳/状态 `reason` 用语义名 `register\|round_start\|round_end`（`extensions/connect-bot/state-machine.ts`），旧实现用原生事件名（`agent_start\|agent_end\|session_stop`；同旧文件 `pushState` 调用处） |
| 8 | 三类有意修改是否只落在迁移侧（P43） | ticket 21 已核对，交维护者复核 | §5.5（每条都指向迁移侧断言；原仓库工作区为空、目录树哈希未变） |
| 9 | D-07：默认 `endpoint` 改为 `http://127.0.0.1:8787`（用户 2026-10-07 裁定） | 用户：**整进程重启** agent 后复测首次 `/connect-bot`（配置每进程只读一次） | §5.2 D-07（根因与实测）；`extensions/connect-bot/config.yaml`（sha256 `829f88c2…`）；M 层步骤 B 应一次成功，不再需要手动重试 |
