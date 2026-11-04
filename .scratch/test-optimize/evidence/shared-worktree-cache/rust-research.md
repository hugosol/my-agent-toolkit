# Rust 多 worktree 共享缓存：官方证据与 Windows 方案

调研日期：2026-11-04。仅互联网资料调研；未安装工具、未修改 Cargo 配置、未执行构建/测试或性能实测。下面的 PowerShell/TOML 均为供选择后执行的示例，不是已经应用的配置。所有性能取舍均是机制分析，不是本机测量。

## 结论

- **默认推荐架构：共用同一用户的 `CARGO_HOME` 下载/源码缓存，每个 worktree 保持独立 target/build-dir，可选共用一个 sccache daemon 和它的本地编译缓存。** Cargo 官方明确把 sccache 列为跨 workspace 共享已编译依赖的工具；这不是把 target 目录直接共享。[Cargo build cache](https://doc.rust-lang.org/cargo/reference/build-cache.html#shared-cache)
- **必须揭示一个当前版本边界：最新正式 sccache 为 v0.19.0（2026-10-24），而 Rust 的 `SCCACHE_BASEDIRS` 哈希归一化 PR #2918 到 2026-11-02 才合并，不能把 main README 的 Rust 路径支持说成 v0.19.0 已发布能力。** 正式版仍可用作 Rust 编译缓存，但不能保证跨 worktree 的 workspace/path crate 命中；共享 registry 源码绝对路径的依赖更有复用条件。[发布 API](https://api.github.com/repos/mozilla/sccache/releases/latest)、[v0.19.0 README](https://github.com/mozilla/sccache/blob/v0.19.0/README.md)、[已合并 #2918](https://github.com/mozilla/sccache/pull/2918)
- **当前不推荐为了“全量跨 worktree 命中”直接追 main。** 新归一化只改 cache key，不改产物里的路径；main 文档承认命中产物可保留原 checkout 的 debug/panic/`env!("CARGO_MANIFEST_DIR")` 路径，且防止不安全跨 checkout 命中的 PR #2794 仍 open。需要运行时路径正确性的项目尤其不能把它当透明、安全的去重。[main README](https://github.com/mozilla/sccache#normalizing-paths-with-sccache_basedirs)、[#2794](https://github.com/mozilla/sccache/pull/2794)
- **共享一个 target 是可配置的，但不是内容寻址、分支隔离的通用缓存。** 当前稳定 Cargo 的整 build cache 锁会使同一 build-dir 的并行 Cargo 等待；最终 bin/doc 等路径也不按 worktree 隔离。`-Zfine-grain-locking` 和新 build-dir 布局仍列为实验能力，不应用来包装成现成稳定方案。[Cargo 配置](https://doc.rust-lang.org/cargo/reference/config.html#buildtarget-dir)、[build-cache](https://doc.rust-lang.org/cargo/reference/build-cache.html)、[fine-grain-locking](https://doc.rust-lang.org/cargo/reference/unstable.html#fine-grain-locking)

## 1. 三层缓存不能混称

| 层 | 官方入口 | 可共享什么 | 不解决什么 |
|---|---|---|---|
| 下载/源码 | `CARGO_HOME` | registry index、`.crate` 下载、解压源码、git bare db 和按 commit checkout | 不直接共享 rustc 编译输出，不统一各 worktree 的 manifest/lock/features |
| 本地构建状态和产物 | `CARGO_TARGET_DIR` / `build.target-dir`，以及 Cargo 1.91+ `build.build-dir` | rustc/Cargo 中间产物、fingerprint、incremental、build scripts、最终文件，具体取决于两个目录是否分离 | 不是任意不同 checkout 的内容寻址缓存；不提供按分支的最终输出隔离 |
| 编译调用缓存 | `RUSTC_WRAPPER=sccache` + `SCCACHE_DIR` | 满足缓存条件的 rustc 调用结果 | 不缓存所有链接、build-script 的执行、rustdoc 或完整 Cargo 命令；需要处理 incremental、绝对路径和环境差异 |

来源：[Cargo Home](https://doc.rust-lang.org/cargo/guide/cargo-home.html)、[Cargo build cache](https://doc.rust-lang.org/cargo/reference/build-cache.html)、[sccache Rust 文档 v0.19.0](https://github.com/mozilla/sccache/blob/v0.19.0/docs/Rust.md)。

### CARGO_HOME

- 默认 Windows 是 `%USERPROFILE%\.cargo`。同一用户启动的 worktree 一般已经共用它，不必新建另一套缓存。[环境变量](https://doc.rust-lang.org/cargo/reference/environment-variables.html#environment-variables-cargo-reads)
- 它还包含 `config.toml`、`credentials.toml`、安装 binary/记录，不是纯下载文件夹；随意改成新目录会同时改变这些配置/凭据的发现位置。内部布局明确不稳定；不应自行维护硬链接树或依赖内部结构的去重脚本。[Cargo Home](https://doc.rust-lang.org/cargo/guide/cargo-home.html)
- 默认 Cargo 使用自己的缓存/构建锁；共享下载缓存不等于所有 Cargo 阶段都无等待。对本机同用户共用默认 home 是正常使用方式；不在本报告中承诺多机器/NFS/任意自定义清理程序的并发安全。整 build cache 锁的稳定/实验分界见下文。[fine-grain-locking](https://doc.rust-lang.org/cargo/reference/unstable.html#fine-grain-locking)

### target-dir 与 build-dir

- `CARGO_TARGET_DIR` 与 `CARGO_BUILD_TARGET_DIR` 对应 `build.target-dir`；默认 workspace 根的 `target`，也可 `--target-dir` 覆盖。`CARGO_TARGET_DIR` 相对路径相对于当前工作目录，示例建议用绝对路径避免调用目录变化。[环境变量](https://doc.rust-lang.org/cargo/reference/environment-variables.html)、[配置](https://doc.rust-lang.org/cargo/reference/config.html#buildtarget-dir)
- `build.build-dir` / `CARGO_BUILD_BUILD_DIR` 存中间产物，默认跟 target-dir 相同。最终 bin/doc/timings 等仍在 target-dir，`deps`/`incremental`/build-script 输出在 build-dir；因此只隔离 target-dir、却通过全局配置共享 build-dir，仍没有隔离编译状态。[build-cache](https://doc.rust-lang.org/cargo/reference/build-cache.html)
- `build.build-dir` **Cargo 1.91 稳定**，不是今天还必须 nightly 的选项。更早的 Cargo 不能把它当稳定接口；更广泛兼容方案是不设它，让它随每个独立 target-dir。[官方稳定化记录](https://doc.rust-lang.org/cargo/reference/unstable.html#build-dir)
- 当前 build-dir 支持 `{workspace-root}`、`{cargo-cache-home}`、`{workspace-path-hash}`，后者是 manifest 路径 hash。把中间产物放到统一父目录但附带这个 hash，得到的是“集中管理、每 workspace 隔离”，**不是各 worktree 自动共享同一个编译图**。[配置](https://doc.rust-lang.org/cargo/reference/config.html#buildbuild-dir)

## 2. 明确版本与发布状态

| 能力 | 可证实版本/状态 | 证据 |
|---|---|---|
| `RUSTC_WRAPPER` 接入 sccache | Rust/Cargo 1.18 起；这不表示最新 sccache 自身能用 Rust 1.18 编译 | [v0.19.0 Rust.md](https://github.com/mozilla/sccache/blob/v0.19.0/docs/Rust.md) |
| Cargo `build.rustc-wrapper` 配置 | Cargo 1.40+，按 sccache 官方要求 | [v0.19.0 README Usage](https://github.com/mozilla/sccache/blob/v0.19.0/README.md#usage) |
| 跟踪 `env!` 值 | Rust >=1.46；仍存在 proc macro 外部文件读取 caveat | [v0.19.0 Rust.md](https://github.com/mozilla/sccache/blob/v0.19.0/docs/Rust.md) |
| `build.build-dir` | Cargo 1.91 稳定；`build-dir-new-layout` 和 fine-grain-locking 不是同一个已稳定功能 | [Cargo unstable 已稳定项](https://doc.rust-lang.org/cargo/reference/unstable.html#build-dir) |
| 最新正式 sccache | v0.19.0，published 2026-10-24，非 prerelease；提供 x86_64-pc-windows-msvc ZIP/tar.gz | [release API](https://api.github.com/repos/mozilla/sccache/releases/latest)、[版本发布页](https://github.com/mozilla/sccache/releases/tag/v0.19.0) |
| 从源构建 sccache v0.19.0 | 官方 README 要求 Rust 1.91.0；是工具自身构建要求，不等于所有被缓存项目的 MSRV | [版本 README Build Requirements](https://github.com/mozilla/sccache/blob/v0.19.0/README.md#build-requirements) |
| 通用 `SCCACHE_BASEDIRS` | #2521 在 2026-01-28 合并；v0.19.0 已有其文档，但初始只涉及 C compiler | [#2521](https://github.com/mozilla/sccache/pull/2521)、[#2652 问题说明](https://github.com/mozilla/sccache/issues/2652)、[v0.19 README](https://github.com/mozilla/sccache/blob/v0.19.0/README.md#normalizing-paths-with-sccache_basedirs) |
| Rust 的 basedirs 哈希支持 | #2918 于 2026-11-02 合并，merge commit `cfb169c2e261a4a58eb033aadaee05735a123a61`；**晚于最新正式版，当前只证明 main/该提交后的源码支持，不能写成 0.19 支持** | [PR/API](https://api.github.com/repos/mozilla/sccache/pulls/2918) |
| 每请求覆盖 basedirs，适合动态 worktree | #2814 仍 open / `merged_at=null`；当前 daemon 启动时捕获 basedirs，不能声称每个终端随意设置 root 都会独立生效 | [#2814/API](https://api.github.com/repos/mozilla/sccache/pulls/2814) |
| `CARGO_INCREMENTAL=1` 明确报错、`SCCACHE_ALLOW_INCREMENTAL=1` 放行 | main 文档已写；v0.19.0 的 Rust.md/README 只写不能缓存 incremental，没有该放行说明。因此本报告不把新选项保证为 v0.19.0 接口 | [main Rust.md](https://github.com/mozilla/sccache/blob/main/docs/Rust.md)、[v0.19.0 Rust.md](https://github.com/mozilla/sccache/blob/v0.19.0/docs/Rust.md) |

查阅 `releases/latest` 是本次在线时点结果，不是要求用户以后始终使用浮动 latest。正文例子以 v0.19.0 为正式基线；没有猜测下一次含 Rust basedirs 的发布版本号。

## 3. sccache 的 Rust 缓存边界

正式版官方 Rust 文档明确要求 rustc 的 incremental 禁用，并限制 `--emit`：只支持 `link`、`metadata`、`dep-info` 且必须含 `link`；所以不能把 `cargo check`（只产 metadata 的调用）描述为完整受益的缓存对象。需要 system linker 的 `bin`、`dylib`、`cdylib`、`proc-macro` 不可缓存；缓存 library 依赖仍可能减少构建工作，但最终链接仍执行。读取未追踪文件的 procedural macro 可能缓存不正确。[v0.19.0 Rust.md](https://github.com/mozilla/sccache/blob/v0.19.0/docs/Rust.md)

Cargo 默认 dev profile 对 workspace members/path dependencies 使用 incremental。`CARGO_INCREMENTAL=0` 会强制禁用，`=1` 强制启用；不设则由 profile/default 决定。因此开 sccache 不是无代价地叠加原有本地 incremental：频繁编辑一个 worktree 的 warm rebuild 和多 worktree 复用是不同优化目标，谁快需要随后用真实项目测量，本次未测。[Cargo 环境变量](https://doc.rust-lang.org/cargo/reference/environment-variables.html#environment-variables-cargo-reads)、[sccache caveats](https://github.com/mozilla/sccache/blob/v0.19.0/README.md#rust)

main 文档补充：sccache key/内部快速查询受 compiler、arguments、cwd、环境、externs、static libraries、target spec 和源码内容影响。仅相同 Cargo.lock 不是充分命中条件；toolchain、target、features/profile/rustflags、路径及 build-script 输出都会影响实际调用。新 worktree 上的源码相同也不能据此保证 100% 命中。[main Rust.md](https://github.com/mozilla/sccache/blob/main/docs/Rust.md)、[#2918 说明 OUT_DIR/path crate 失配](https://github.com/mozilla/sccache/pull/2918)

## 4. SCCACHE_BASEDIRS：Windows、daemon 与语义风险

### 已发布文档中的通用规则

Windows 多个根用分号 `;`，非 Windows 用冒号 `:`；必须绝对路径，否则 server 不能启动；最长匹配前缀优先；Windows 大小写不敏感，其它平台大小写敏感。根须列到对应 checkout 本身，单设共同父目录会剩下不同 branch/worktree 子路径。[v0.19.0 README](https://github.com/mozilla/sccache/blob/v0.19.0/README.md#normalizing-paths-with-sccache_basedirs)

例如两个根 `E:\Developer\rust-main`、`E:\Developer\rust-worktrees\feature-a`，若使用具备新 Rust 支持的构建，应以两个完整根为 basedirs；只设 `E:\Developer` 无法把不同剩余路径变成相同值。[同上，最长前缀规则；剩余路径结论为 INFERENCE]

### Rust 新增覆盖与风险

#2918 的归一化覆盖 cwd、arguments、`CARGO_*`（例如 `CARGO_MANIFEST_DIR`）和 env-dep（例如 `OUT_DIR`），并修复 Windows env-dep 反斜杠转义影响匹配的问题。它是**hash key 归一化，不是修改编译器真实输入/嵌入产物字符串**。[#2918](https://github.com/mozilla/sccache/pull/2918)

main README 明确警告复用 crate 可能把另一个目录写入 debug info、panic message、保留的 `env!("CARGO_MANIFEST_DIR")`。`--remap-path-prefix` 可以处理编译器管理的路径，但不能自动改任意 env 字面量或 proc macro 自定义输出。open #2794 正在处理这类不安全命中；它的说明不是已落地保证。[main README](https://github.com/mozilla/sccache#normalizing-paths-with-sccache_basedirs)、[#2794](https://github.com/mozilla/sccache/pull/2794)

当前 basedirs daemon 范围限制仍需尊重。#2814 描述每请求隔离尚未合并，故一个共享 daemon 应在启动前配置完整静态根列表，而不是各 worktree 设置不同列表期待 daemon 自动切换；增删列表需要在没有并行构建时维护重启，不能每个 agent 开工就 stop-server。[#2814](https://github.com/mozilla/sccache/pull/2814)

## 5. 并发与两种架构的取舍

### 独立 target/build-dir + 共享 sccache（推荐默认）

- 各 worktree 的最终产物、fingerprint、build-script 输出独立；可独立 clean/构建，不共享同一 build-dir 全局锁。[Cargo build-cache](https://doc.rust-lang.org/cargo/reference/build-cache.html)、[fine-grain-locking](https://doc.rust-lang.org/cargo/reference/unstable.html#fine-grain-locking)
- 共享一个本机 daemon 可服务多个编译客户端；默认监听 `127.0.0.1:4226`，没有运行中的 server 时客户端自动启动。[v0.19.0 README Usage](https://github.com/mozilla/sccache/blob/v0.19.0/README.md#usage)
- **一个本地 `SCCACHE_DIR` 只允许一个 sccache server。** 不要为每个 worktree 用不同 server port、却把它们指向同一 local disk cache；官方明确多 server 会 race 并导致偶发构建失败。[v0.19.0 Local.md](https://github.com/mozilla/sccache/blob/v0.19.0/docs/Local.md)
- 代价：各 target 仍占用磁盘，命中也要读取/解压/复制到自己的输出布局，禁用 incremental 可能伤害单 worktree 编辑循环；v0.19.0 跨 checkout 本地 crate 的路径限制仍在。[Rust.md](https://github.com/mozilla/sccache/blob/v0.19.0/docs/Rust.md)、[#2918](https://github.com/mozilla/sccache/pull/2918)。磁盘/延迟相对大小为机制推断，未测。
- sccache 有 jobserver 集成；但不能承诺任意多个独立 Cargo 进程的总体 CPU/内存自动达到理想调度。Cargo 的 `--jobs`/`CARGO_BUILD_JOBS` 控制该次 Cargo 的编译进程数，多个 agent 同时重编译仍须限制并行预算。[sccache jobserver](https://github.com/mozilla/sccache/blob/v0.19.0/README.md#interaction-with-gnu-make-jobserver)、[Cargo jobs](https://doc.rust-lang.org/cargo/reference/config.html#buildjobs)

### 直接共用一个 target（有限场景可选，不推荐多 agent 默认）

- 优点：可能复用 Cargo 已有依赖产物，不必依赖额外 daemon；无需为 sccache 强制放弃 incremental。是否有效仍由 Cargo 的 freshness/fingerprint 决定，不能宣称两 worktree 同 lockfile 就免编译。[Cargo build-cache](https://doc.rust-lang.org/cargo/reference/build-cache.html)
- 缺点：共享 build-dir 的稳定实现是整缓存锁，多个 Cargo 构建容易排队，而不是完全并行。[官方实验 fine-grain-locking 说明](https://doc.rust-lang.org/cargo/reference/unstable.html#fine-grain-locking)
- 最终二进制一般按 target/profile/bin 名布局，不按 worktree 名分开；同名 `app.exe` 等输出会由后完成的构建更新。外部进程随后从共享路径启动哪个分支需要自己管理。`cargo clean` 作用于这套共享产物，不能当各分支私有缓存清理。[Cargo build-cache 目录布局](https://doc.rust-lang.org/cargo/reference/build-cache.html)、[cargo clean](https://doc.rust-lang.org/cargo/commands/cargo-clean.html)。分支运行串扰结论为 INFERENCE。
- 折中：Cargo 1.91+ 保留每 worktree 独立 target-dir、只共用 build-dir，隔离最终 binary 但仍共用中间状态/锁；不是通用无争用解法。统一父目录下 `{workspace-path-hash}` 子目录则彻底隔离中间状态，但不再是同一 build-dir 的直接复用。[配置](https://doc.rust-lang.org/cargo/reference/config.html#buildbuild-dir)

## 6. 可复现配置示例（仅示例，没有执行）

### A. 正式基线：v0.19.0 + 独立 target + 单共享 daemon

前提：用户已另行安装并固定 v0.19.0 `sccache.exe` 到 PATH；下面从实际 Rust workspace 根目录执行。保留已有同用户 `CARGO_HOME`，不要为了“缓存”覆盖自定义凭据/配置路径。每个 PowerShell 终端都设置一致的共享缓存，target 则跟当前 worktree 走。

```powershell
# 若已经设置 CARGO_HOME，沿用；否则显式写出 Windows 默认值
if (-not $env:CARGO_HOME) {
    $env:CARGO_HOME = Join-Path $env:USERPROFILE '.cargo'
}

# 从每个 worktree 的 Rust workspace 根启动，绝对路径确保不随后续 cwd 漂移
$workspaceRoot = (Get-Location).Path
$env:CARGO_TARGET_DIR = Join-Path $workspaceRoot 'target'
# Cargo >= 1.91 可显式隔离，防止已有全局 build-dir 意外共享
$env:CARGO_BUILD_BUILD_DIR = $env:CARGO_TARGET_DIR

$env:RUSTC_WRAPPER = (Get-Command sccache.exe -ErrorAction Stop).Source
$env:CARGO_INCREMENTAL = '0'
$env:SCCACHE_DIR = Join-Path $env:LOCALAPPDATA 'Mozilla\sccache'
$env:SCCACHE_CACHE_SIZE = '20G'
# 所有终端沿用同一个默认 server 地址，不按 worktree 改 SCCACHE_SERVER_PORT
# 后续由用户运行常规 cargo build；这里未运行
```

- Cargo <1.91 不使用 `CARGO_BUILD_BUILD_DIR`，保持未设置 build-dir 的原默认布局；其它设置仍适用。
- 此正式版例子故意不写 `SCCACHE_BASEDIRS`，避免暗示它已经解决 Rust 路径复用；主收益候选是绝对源码路径一致的 registry/git 依赖编译，实际命中用之后的真实构建统计判断。
- 缓存大小默认 10 GB，Windows 默认目录 `%LOCALAPPDATA%\Mozilla\sccache`，示例 20G 是可选容量决策而不是最佳值。[Local.md](https://github.com/mozilla/sccache/blob/v0.19.0/docs/Local.md)
- 若要修改正在运行的 daemon 缓存配置，先协调所有构建结束再维护重启；不要每个终端自动执行 `--stop-server`。[daemon 模型](https://github.com/mozilla/sccache/blob/v0.19.0/README.md#usage)

### B. Cargo 1.91+ 集中放置但保持 worktree 隔离

供用户选择后合并到已有配置；不是本报告所作的改动：

```toml
[build]
# 每个 workspace 默认仍保留自己的 target（最终产物）
build-dir = "{cargo-cache-home}/build/{workspace-path-hash}"
```

模板支持来自当前[官方配置文档](https://doc.rust-lang.org/cargo/reference/config.html#buildbuild-dir)。`workspace-path-hash` 故意使不同 worktree 独立，不意味着共享编译结果；需要 sccache 才是另一层共享。

### C. Rust basedirs 仅作为未正式发布能力的候选配置

**不可对 v0.19.0 宣称有效的 Rust 跨路径方案。** 只有在选择包含 #2918 的源码构建/将来明确含该合并的发行版、接受并审查上述路径语义风险后才考虑：

```powershell
# 在唯一 daemon 首次启动之前配置完整根列表；不要只配置共同父目录
$env:SCCACHE_BASEDIRS = 'E:\Developer\rust-main;E:\Developer\rust-worktrees\feature-a'
```

仍维持独立 target/build-dir。不要自动用 `--remap-path-prefix` 当“修好一切”的开关：它会影响诊断/调试定位，也不能修复 arbitrary env 字符串；如要使用，需对项目真实路径语义另行设计。[main README](https://github.com/mozilla/sccache#normalizing-paths-with-sccache_basedirs)、[#2794](https://github.com/mozilla/sccache/pull/2794)

## 7. cargo-chef 是否适合本机场景

**不适合拿来作为 Windows 本机多 worktree 共享缓存的默认工具。** 项目自己的 README 直说 `cargo-chef is not meant to be run locally`，主要用途是在 Docker COPY 真实源码之前生成 recipe/最小骨架并建立依赖层；在现有代码库运行可能覆盖文件。其 `cook` 与后续 `cargo build` 还要求同一工作目录、各 Docker 阶段要求同一 Rust 版本。它解决 Docker layer 缓存组织，不是共享本机多个活跃 checkout 的缓存 daemon。[cargo-chef 官方 README](https://github.com/LukeMathWalker/cargo-chef#how-to-use)、[限制](https://github.com/LukeMathWalker/cargo-chef#limitations-and-caveats)

不把它的宣传加速倍数作为本机实测，也不在现有工作树试跑。

## 8. 证据边界与后续评估对象

本次已经区分正式版、main 和 open PR，没有本机 benchmark，也没有断言 Rust 旁仓已装 sccache 或当前 Cargo 版本足够。选择落地前应由主执行方确认实际 `cargo`/`rustc`/`sccache` 版本、已有 `RUSTC_*WRAPPER`/`RUSTFLAGS`/全局 build-dir 配置及是否有运行时依赖 manifest 路径的代码；这不是本次执行过的检查。

如果只允许稳定现成方案：先共用默认 CARGO_HOME，保持 worktree target 隔离；选择性启用正式 sccache，并把“能复用多少 registry 依赖”和“禁用 incremental 的损失”作为后续测量问题。不要承诺 `SCCACHE_BASEDIRS` 已在最新正式版解决 Rust worktree 全量共享。
