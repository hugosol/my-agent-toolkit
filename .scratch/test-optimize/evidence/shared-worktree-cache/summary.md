# 多 Git worktree 共享依赖与编译缓存：调研结论

仅调研官方文档、带版本源码和发布/PR状态；没有安装工具、改仓库配置或执行构建/性能测试。官方 macOS/Linux 性能数字不当作本机 Windows 收益。

## 最重要的修正

不必先自行实现整棵 node_modules 的 lockfile-keyed 缓存管理器，也不必为共享依赖先迁移 pnpm。**仓库现用 Bun 1.4.4 已经原生提供 global virtual store**，固定版本标签中明确包含配置、按依赖闭包哈希复用、项目局部回退及并发原子发布机制。

来源：
- https://bun.com/docs/pm/global-store
- https://github.com/oven-sh/bun/blob/bun-v1.4.4/docs/pm/global-store.mdx

## 方案总览

|方案|共享层|每worktree保留|建议|
|---|---|---|---|
|Bun globalStore + isolated linker|已物化 external package dependency closure|自己的node_modules链接树；不宜共享的包仍本地|本仓库优先试点|
|pnpm global virtual store|依赖图哈希标识的包目录和CAS|自己的链接/lock metadata/workspace源码|已用pnpm或愿意迁移时可选，当前experimental|
|Cargo默认CARGO_HOME|registry/git下载与源码|Cargo.toml/lock和构建状态|同用户通常已共享，不必自建|
|sccache|可缓存rustc编译调用结果|各自target/build-dir与最终产物|Rust多worktree优先评估，命中非100%|
|共享CARGO_TARGET_DIR|同一套Cargo中间状态和最终产物|没有完整产物隔离|只适合可协调的有限场景，多agent默认不推荐|
|Worktrunk / GTR|创建后编排、复制、预热|由包管理器/编译器决定|不是另一个按锁文件共享依赖的引擎|

## Bun：直接可用的配置方向

拟议配置（未应用）：

```toml
[install]
linker = "isolated"
globalStore = true

[install.cache]
dir = "E:/cache/bun/install-cache"
```

每个 worktree 仍执行 `bun install --frozen-lockfile`，由 Bun 决定复用哪些 global entries；不是手工把整个 node_modules 指向主工作区。也可用进程级环境 `BUN_INSTALL_CACHE_DIR` 和 `BUN_INSTALL_GLOBAL_STORE=1`，然后 `bun install --linker isolated --frozen-lockfile`。

关键机制：缓存在 `<cache>/links/`；hash包括package identity/integrity、传递依赖和peer解析闭包、布局版本。不同安装进程使用私有staging再rename发布。patched/trusted生命周期包及相关闭包、workspace/file/link路径相关闭包、某些@types上下文本地回退。Windows固定版本源码实现symlink/junction，不等于本机已验证通过。

限制：切换linker可能暴露未声明依赖、symlink扫描/realpath兼容性；不能修改共享包。`bun pm cache rm`删除links后会破坏全部链接它的项目，不能当普通无害清缓存。建议短本地路径；同盘利于hardlink物化，但junction并非禁止跨本地卷。

## pnpm：同类原生方案

官方专门提供worktree教程：https://pnpm.io/git-worktrees
机制：https://pnpm.io/global-virtual-store

当前配置 `virtualStoreType: global`（11.23.0起）；旧 `enableGlobalVirtualStore: true`（10.12.1起）仍是等价旧名。各worktree安装自己的pnpm-lock.yaml图，不同图分离、相同图复用；部分复用粒度优于整棵锁文件缓存。

项目安装默认关闭且仍experimental。Node ESM hoist补偿依赖pnpm启动时注入的resolve hook；不能默认本仓库直接Bun宿主就兼容。npm cache主要解决下载；Yarn hardlinks-global共享文件内容但仍有各项目布局，PnP是另一种有兼容成本的loader路线。

## Rust：共享下载/编译结果，而非一个可写target

Cargo官方将sccache列为跨workspace共享编译依赖的方案：https://doc.rust-lang.org/cargo/reference/build-cache.html#shared-cache

推荐：同用户既有CARGO_HOME + 每worktree独立target/build-dir + 一个共享sccache daemon/cache。`RUSTC_WRAPPER=sccache`接入，正式版需要禁用rustc incremental（例如`CARGO_INCREMENTAL=0`）；这会与单worktree的本地增量收益产生取舍，需要真实测量。不是完整cargo build/check/test命令缓存，链接产物等仍有不可缓存条件。

稳定版支持与main要区分：本次API查到最新正式版v0.19.0发布于2026-10-24；Rust对SCCACHE_BASEDIRS的支持PR #2918于2026-11-02才合并。不能拿main文档承诺正式版已经透明消除worktree绝对路径差异。相同Cargo.lock不足以保证命中；cwd、OUT_DIR、features、profile和编译器输入都可能影响。新路径归一化还有嵌入旧checkout路径和daemon配置范围边界，详见rust-research.md。

来源：
- https://github.com/mozilla/sccache/releases/tag/v0.19.0
- https://github.com/mozilla/sccache/pull/2918
- https://github.com/mozilla/sccache/blob/v0.19.0/docs/Rust.md
- https://github.com/mozilla/sccache/blob/v0.19.0/docs/Local.md

一个本地SCCACHE_DIR不要由多个不同server同时管理。不要每个agent自动stop-server。多个Cargo任务仍需资源预算。

共享target/build-dir会受到Cargo构建锁影响并可能排队；相同最终binary路径还会被不同分支更新，cargo clean影响共享内容。Cargo 1.91+ build-dir可集中存放并以workspace-path-hash隔离，但这种集中管理本身不等于内容复用。

## 自动化创建：Worktrunk优先候选

https://worktrunk.dev/hook/ 提供blocking `pre-start`，适合依赖就绪后再启动agent；post-start后台，多个table键并发，有先后依赖应使用ordered pipeline。配置好上面的Bun策略后，可用：

```toml
[pre-start]
deps = "bun install --frozen-lockfile"
```

`wt step copy-ignored` / `.worktreeinclude` 是另一条“复制现成缓存作预热”的路线，而非共享依赖图。ReFS/APFS/btrfs/XFS支持COW，NTFS/ext4全量复制。见 https://worktrunk.dev/step/#wt-step-copy-ignored 。当前仓库的framework/.runtime不能作为可复制缓存；默认复制所有ignored内容也可能带上env/凭据，需严格allowlist。

Windows安装官方支持`git-wt`避免与Windows Terminal的wt冲突：https://worktrunk.dev/#install

备选GTR：https://github.com/coderabbitai/git-worktree-runner ，提供复制与postCreate hooks，Windows需Git Bash/WSL、不支持原生PowerShell。README的~/.cache/gtr是shell初始化缓存，不是node_modules缓存。

## 本仓库落地优先级

1. 保留Bun，先在独立worktree试点globalStore/isolated；验证锁文件不变、真实宿主/类型/native/扫描工具兼容、两个worktree同图复用异图分离。
2. Rust保持独立target，测稳定sccache的命中率与禁用incremental的损失；不承诺跨worktree零编译，不默认追main路径归一化。
3. 若需要创建即准备，使用Worktrunk blocking hook或现有创建流程调用准备命令，不另写通用缓存引擎。
4. 这套worktree级共享不会自动补齐OS临时测试部署的yaml。此前诊断出的缺失依赖仍需显式复制/链接到那个部署，不能用全局缓存替代完整部署契约。
