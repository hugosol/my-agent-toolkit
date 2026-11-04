# Node.js 多 worktree 共享缓存：一手证据

调研时间：2026-11-04。仅互联网文档／带版本标签源码阅读；未改项目配置、未安装依赖、未运行构建或测试。以下配置和命令均为**未执行示例**。本仓库 Bun 1.4.4 为任务给定上下文，未另跑版本命令。本文不将官方宣传性能数字当成本机实测。

## 结论先行

1. **有原生方案，而且不必先从 Bun 迁到 pnpm。Bun 1.4.4 已提供 `install.globalStore = true`，搭配 `linker = "isolated"`，能按解析后完整依赖闭包共享目录，各 worktree 保留独立链接树。** 已核对 [bun-v1.4.4 标签文档](https://github.com/oven-sh/bun/blob/bun-v1.4.4/docs/pm/global-store.mdx)，不是只看到最新网页就推定旧版本支持。默认关闭、仅 isolated 生效；文档未将其标成 experimental，不能因此推导为所有工具都兼容。
2. **pnpm global virtual store 同样精确命中需求**：相同包版本＋相同依赖图（含 peer 上下文）共享全局目录，不同图分别存储；每个 worktree 有自己的 `node_modules` 链接／本地元数据。当前推荐配置是 `virtualStoreType: global`；仍为 experimental，项目安装默认关闭。[工作树官方教程](https://pnpm.io/git-worktrees)、[机制与限制](https://pnpm.io/global-virtual-store)。
3. **共享下载缓存 ≠ 共享依赖图布局 ≠ 编译任务缓存**。Bun 普通 global cache、pnpm 普通 CAS、npm cache 都可避免重复下载；hardlink 还可共享文件内容，但默认每个 checkout 仍需重建安装目录结构。Bun／pnpm global virtual store 进一步共享已组装的依赖图目录；它们不自动缓存仓库自己的 `tsc`、打包器或测试任务输出。[Bun cache](https://bun.com/docs/pm/global-cache)、[Bun global store](https://bun.com/docs/pm/global-store)、[pnpm global store](https://pnpm.io/global-virtual-store)、[npm cache](https://docs.npmjs.com/cli/v11/commands/npm-cache)。

## 一、pnpm：版本、配置名与工作树隔离

### 版本不可混用

- `enableGlobalVirtualStore` **v10.12.1 加入**，v10 文档明确 experimental、默认 false、CI 中强制关闭。[pnpm 10 设置](https://pnpm.io/10.x/settings#enableglobalvirtualstore)。
- **v11.23.0 引入 `virtualStoreType`**，它是原设置的规范拼写：`global` 等价旧 `true`、`project` 等价旧 `false`；旧名仍可用，同时设置时新名优先。可通过 `PNPM_CONFIG_VIRTUAL_STORE_TYPE` 设置。[11.23 官方发布说明](https://pnpm.io/blog/releases/11.23#virtualstoretype)。
- 当前文档：项目默认 `project`，global 仍 experimental／opt-in；`nodeLinker: isolated`、`pnp` 可配两种 store；`hoisted` 根本不写 virtual store，因此这个选项对 hoisted 无效。[配置参考](https://pnpm.io/settings/node-modules#virtualstoretype)、[实验状态](https://pnpm.io/global-virtual-store#limitations)。
- 不要把 v10 的 CI 强制关闭规则机械套给最新版本；当前页面与 v10 页面不是同一版本契约。本文建议本地 worktree，不据此给 CI 提速承诺。

### 真正共享的是什么

- 普通 pnpm：CAS 文件内容共享，各项目 `node_modules/.pnpm` 仍要生成自己的 hardlink／copy 目录。
- global：默认 `<store-path>/links/` 中保存按依赖图 hash 标识的包目录，各项目 symlink 到它。同包同图复用，不同传递依赖／peer 图分离；**不是以一个整个 lockfile 为唯一键缓存一整棵 `node_modules`**，可以跨不完全相同项目部分复用。
- 项目的 `node_modules/.pnpm` 仍有 current lockfile 和 hidden hoisted dependencies，不能笼统说所有 worktree 中只有 symlink、没有任何本地文件。`node_modules/.bin`、workspace links 等也仍需安装生成。[精确布局](https://pnpm.io/global-virtual-store#default-behavior-vs-global-virtual-store)。
- 不要只给多个 worktree 设置同一个普通 `virtualStoreDir`：**未开启 global 模式的 virtual store 不允许跨项目共享**（同一 workspace 根内部共享是另一回事）。当前可用 `globalVirtualStoreDir` 显式设置 global 位置，优先级高于 `virtualStoreDir`。[设置参考](https://pnpm.io/settings/node-modules#virtualstoredir)。
- v12.9.0 修复了自定义共享 `virtualStoreDir` 时，本地 current lockfile／hidden hoisting 仍应留各项目的问题。因此示例优先只设置 `storeDir`，让 global store 使用默认 `<store>/links`；若自定义目录，应先固定含修复的版本。[12.9.0 发布说明](https://pnpm.io/blog/releases/12.9.0#installing-packages)。

### Windows、工作空间、原生包与宿主边界

- pnpm 官方有 Windows store 路径和路径长度设置（virtual store 目录名长度 Windows 默认 60，其他平台 120）；不属于 Unix-only 功能。[路径设置](https://pnpm.io/settings/node-modules#virtualstoredirmaxlength)、[store 设置](https://pnpm.io/settings/store#storedir)。
- hardlink 只在同文件系统／卷内成立，跨卷导入会 copy；建议 CAS、global store 和 worktrees 都放本机 E: 卷的短路径。**这是一项效率建议，不应误写成 symlink／junction 本身绝不能跨卷。** Windows junction 可以指向另一块本地卷目录；不能指向网络映射卷。[pnpm 同盘规则](https://pnpm.io/settings/store#storedir)、[Microsoft NTFS 链接规则](https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions)。
- workspace 源码依赖仍应指向该 worktree 的源码，不应把两个分支的可写源码目录共享。`workspace:` 保证只解析本地 workspace；普通 workspace links、可选 injected hardlinks 及其同步行为是额外语义，不是 external registry global store 可以取代的。[workspace 官方说明](https://pnpm.io/workspaces#workspace-protocol-workspace)、[injection 配置](https://pnpm.io/workspaces#injectworkspacepackages)。
- pnpm 可缓存依赖包 install hooks 的产物（`sideEffectsCache`），但脚本写包目录外部、依赖本机库／环境等副作用并不能一概安全缓存。**v12.14.0** 加入 `sideEffectsCache.exclude`，用于 key 无法涵盖其构建输入的包；这些包及依赖它们的包在 global 模式下取项目独立副本。不要把 global graph hash 当成任意 native 构建环境的完整 fingerprint。[构建缓存与 exclude](https://pnpm.io/settings/build#sideeffectscacheexclude)。
- 当前 ESM hoist 补偿依赖 pnpm 给它启动的进程注入 `NODE_PATH` 和 `NODE_OPTIONS --import` resolve hook；直接执行 `node` 没有这个环境，`extendNodePath: false` 也关闭机制。v10 曾要求另加插件；自动 hook 是 11.23 发布变化。[11.23 ESM 说明](https://pnpm.io/blog/releases/11.23#undeclared-imports-resolve-under-esm-with-the-global-virtual-store)。
- **当前仓库实际使用 Bun 宿主，不能据此默认 Bun 能兼容 pnpm 给 Node 的 hook 或 phantom-dependency 布局**；若迁 pnpm，需要验证真实的 `bun ...` 启动路径、包扫描工具、symlink realpath 和 native addons。这是未执行验证项，不是已确认故障。

### 并发契约

当前 pnpm 官方明确允许**同机、本地文件系统**普通 install 并发填同一 store，并有共享进程锁；Windows 锁在用户 `AppData/Local`。同一 store 的进程必须共享锁目录。`--frozen-lockfile` 仍可写 store；它不等于 `--frozen-store`。后者使用 immutable SQLite 读，要求安装期间没有其他进程修改 store，不能作为并发写入优化开关。[锁与 frozenStore](https://pnpm.io/settings/store#frozenstore)。不同 worktree 保留独立安装目录，官方教程允许不同版本图并存；共享 writable store 只适用于互信用户／代理，非安全沙箱。[worktree 教程](https://pnpm.io/git-worktrees)、[信任边界](https://pnpm.io/global-virtual-store#limitations)。

## 二、Bun：本仓库已有版本的原生选项

### 普通 global cache 不等于 global virtual store

- 普通缓存默认 `~/.bun/install/cache`，可用 `BUN_INSTALL_CACHE_DIR` 或 `[install.cache].dir` 改位置；缓存按包名／版本存放。[官方 cache 文档](https://bun.com/docs/pm/global-cache)。
- 默认物化 backend：Linux／Windows **hardlink**，macOS **clonefile（COW）**；失败可退 copyfile。Windows hardlink 是同一文件，不是 COW，直接原地改文件会影响其他 hardlink；macOS clonefile 写时才分叉。不要把两个平台的隔离性质混说。[Bun backend 文档](https://bun.com/docs/pm/global-cache#saving-disk-space)、[Microsoft hardlink 语义](https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions)。
- isolated 本地模式：依赖图位于每个项目自己的 `node_modules/.bun`，顶层 symlink 到它；同 peer 上下文在**项目内**去重，仍不是全机共享已装配目录。[isolated installs](https://bun.com/docs/pm/isolated-installs)。

### Bun 1.4.4 globalStore 逐项核实

依据：[**bun-v1.4.4 固定标签 global-store 文档**](https://github.com/oven-sh/bun/blob/bun-v1.4.4/docs/pm/global-store.mdx)（网页对应 [global-store](https://bun.com/docs/pm/global-store)）；[1.4.4 官方发布说明](https://bun.com/blog/bun-v1.4.4)也明确列出 globalStore no-op 链接重建、TypeScript `@types` 和环境变量 false 解析修复。

- 配置 `[install] linker = "isolated"; globalStore = true`；默认关闭，hoisted 不用。环境开关 `BUN_INSTALL_GLOBAL_STORE=1`。
- 全局目录 `<cache>/links/<storepath>-<16 hex entry hash>/node_modules/`；每 worktree 的 `.bun/<storepath>` 链接过去，再由顶层链接到包。
- hash 覆盖 own store path、tarball integrity、**完整 resolved dependency closure**（所有链接的传递依赖和 peer）；循环按 strongly-connected component 统一计算；布局版本也进 hash。因此版本相同但依赖图不同不会错误合并。
- **不是全部包都能共享**。patch 包、被信任会执行 lifecycle 的包、这些 trusted 包的直接／间接依赖、包含 workspace/file/link 路径依赖的包及受其影响的依赖闭包、本项目 `@types/*` 所提供类型的 peer 上下文都会回退本地目录。它们仍有下载缓存，但安装布局不能假定跨 worktree 合并。后续 patch／trust 改变会拆离 global，原共享项不被改写。
- trusted native scripts 的局部回退是正确隔离策略，不是故障；此功能不保证 native build 本身跨项目只做一次。Bun 对 scripts 有 allowlist，省略 `trustedDependencies` 时也存在内建信任列表，显式列表会替换默认列表；不能为了提高共享率直接禁掉项目必需脚本。[生命周期规则](https://bun.com/docs/pm/lifecycle)。源码也明确 `Trusted entries are never global-store eligible; never run in the shared dir`：[1.4.4 Installer.rs](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/install/isolated_install/Installer.rs#L1302-L1306)。
- Windows 实现不是仅推测：`link_project_to_global_store` 的 Windows 分支调用 `symlink_or_junction`，绝对目标可回退 junction：[固定标签 Installer.rs L2688-L2708](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/install/isolated_install/Installer.rs#L2688-L2708)；常规依赖 links 也有 Windows fallback：[Symlinker.rs L44-L64](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/install/isolated_install/Symlinker.rs#L44-L64)。**有实现证据，不等于已在本机跑通**。
- Windows 路径长度影响 lifecycle script 的 cwd；isolated docs 特别说明 Bun 本身能处理 >260 字符，不代表脚本 cwd 也能处理；建议短缓存与 checkout 路径。[isolated 路径说明](https://bun.com/docs/pm/isolated-installs#directory-structure)。

### 并发与不可变性边界

- 多 `bun install` 竞争同一 global entry：各自先写 `<entry>.tmp-<random>`，完整写好 package files、dependency symlinks、bin links，再 rename 发布；输家删除自己的 staging。crash 留下的 temp 不会当成成品复用。[官方 Concurrency](https://bun.com/docs/pm/global-store#concurrency)、[1.4.4 发布代码](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/install/isolated_install/Installer.rs#L2510-L2547)。
- 该承诺是不同安装目录竞争**相同共享条目**，不是允许多个进程同时改同一 worktree 的 lockfile／node_modules，更不是允许任意工具写共享包。
- global 包 realpath 在 cache，不能向上找到项目 hoist fallback；phantom dependencies 应补成真实依赖或关闭 globalStore，`publicHoistPattern` 不能让 global 包重新向上看见项目目录。扫描 node_modules 但不跟链接的工具也可能受影响。[Bun tradeoffs](https://bun.com/docs/pm/global-store#tradeoffs)。
- `bun pm cache rm` 会删除 `<cache>/links`，所有指向它的项目随后失效，需逐个重装；不能当成只清下载缓存的无害操作。并发 install 的 staging 保证也不意味着并发清理 store 安全。不要手改 shared node_modules，不要在其他 worktree 活跃时清共享根。[cache 删除警告](https://bun.com/docs/pm/global-store#disk-usage)。
- 同卷约束针对 hardlink **物化层**，不是 global 链接本身；把 cache 也放 E: 能保留本地回退包的 hardlink 优势。C: cache → E: worktree 的本地回退包可能变成复制，不能承诺全部零复制。[backend](https://bun.com/docs/pm/global-cache#saving-disk-space)、[Windows 卷约束](https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions)。

### Runtime auto-install 是另一条路径

当导入文件及祖先找不到 `node_modules`，Bun 会改用自身 resolution，将 import 包自动装进同一个 global cache，甚至不生成 node_modules。它不是让 Node、IDE 和各种工具都获得共享 `node_modules` 的通用替代：官方列出无 IntelliSense、无 patch-package、无 git dependencies、一进程只支持一个 project 等限制。`workspace:`／`file:`／`link:` 按本地目录加载。[Bun auto-install 官方文档](https://bun.com/docs/runtime/auto-install)。因此不建议为达到 worktree 共享目标就删本仓库 node_modules、改用 runtime auto-install。

## 三、npm／Yarn 必要对照

| 方案 | 下载／内容共享 | 各 worktree 安装图 | 是否等价本题 global graph store |
|---|---|---|---|
| npm cache | `_cacache` 存 HTTP／包相关 CAS 数据，写入和读出都校验完整性 | 通常各自实际 node_modules | **否**，cache 不是可直接运行的持久依赖布局；npm 明确不保证缓存内容永久可得 |
| Yarn modern + node-modules + `nmMode: hardlinks-global` | global CAS 的 hardlink 文件内容共享 | 仍生成各自 node_modules 目录／链接布局 | **不等价**共享已组装 dependency-closure 目录 |
| Yarn modern PnP + global cache | 默认 `enableGlobalCache: true` 共享 zip archives | 各项目生成自身 loader／解析映射；native 等需解包另论 | **是替代路线，但没有 node_modules**，兼容要求不同 |
| Yarn `nodeLinker: pnpm` | symlink＋hardlink CAS | 默认项目 `node_modules/.store`；不能仅凭名称推定 pnpm global virtual store 语义 | **未找到同等全机依赖闭包目录承诺，不作等价推荐** |

一手来源：[npm cache 设计](https://docs.npmjs.com/cli/v11/commands/npm-cache#details)、[Yarn cacheFolder 并发安全说明](https://yarnpkg.com/configuration/yarnrc#cacheFolder)、[Yarn enableGlobalCache](https://yarnpkg.com/configuration/yarnrc#enableGlobalCache)、[Yarn nmMode](https://yarnpkg.com/configuration/yarnrc#nmMode)、[Yarn nodeLinker](https://yarnpkg.com/configuration/yarnrc#nodeLinker)、[Yarn pnpmStoreFolder](https://yarnpkg.com/configuration/yarnrc#pnpmStoreFolder)。Yarn cache 文档明确称不同项目、多个 Yarn 实例同时用 cache 相对安全；不要把这一点扩大成同一 node_modules 可多人同时更新。Windows Yarn 默认 junction，symlink 需相应权限：[winLinkType](https://yarnpkg.com/configuration/yarnrc#winLinkType)。

## 四、可复现配置建议（全部未执行）

### 首选：保留 Bun 1.4.4 的试点

各 worktree 需要使用同一版本与缓存路径，但**不要共享实际 node_modules 根目录**。在待评估分支的 `bunfig.toml` 组合（保留已有其他配置）：

```toml
[install]
linker = "isolated"
globalStore = true

[install.cache]
dir = "E:/cache/bun/install-cache"
```

或者不改 bunfig，仅在两个分别打开的 PowerShell 窗口中设置：

```powershell
$env:BUN_INSTALL_CACHE_DIR = 'E:/cache/bun/install-cache'
$env:BUN_INSTALL_GLOBAL_STORE = '1'
# 窗口 A 的当前目录为 worktree A；窗口 B 为 worktree B
bun install --linker isolated --frozen-lockfile
```

示例前提：Bun 1.4.4、现有有效 `bun.lock`、本地可写 cache、互信的项目／用户；缺少 warm entry 时仍需网络和必要 lifecycle 脚本。切换 linker 会重装现有布局，不是在本调研中已经实施的零风险修改。[配置依据](https://bun.com/docs/pm/global-store#enabling)、[cache 路径](https://bun.com/docs/pm/global-cache)、[linker 切换说明](https://bun.com/docs/pm/isolated-installs#compatibility-issues)。

### 备选：明确迁 pnpm 时

适用于已使用／已迁到 pnpm 的项目；**不是让现有 Bun 项目直接混用 lockfile**。固定支持新拼写的版本（11.23.0 起；若使用当前更多配置，应固定其各自最低版本）。每个 checkout 的 `pnpm-workspace.yaml` 例：

```yaml
packages:
  - 'packages/*'  # 仅示意，须换成真实 workspace patterns
nodeLinker: isolated
virtualStoreType: global
storeDir: E:/cache/pnpm/store
```

```powershell
# 两个窗口，分别位于 worktree A/B；使用已存在且与 manifest 一致的 pnpm-lock.yaml
pnpm install --frozen-lockfile
```

若停留 v10.12.1–11.22.x，用 `enableGlobalVirtualStore: true` **替换** `virtualStoreType`，并遵守该版 CI／ESM 限制。不要同时写两种开关来制造含糊优先级。不必先创建 bare repo；官方 worktree 教程的 bare 布局是示例，而共享机制依赖的是 store 和链接，不是 .git 采用哪一种布局。[官方配置与教程](https://pnpm.io/git-worktrees#setting-it-up)、[11.23 新名](https://pnpm.io/blog/releases/11.23#virtualstoretype)。

### 试点评估验收项（未执行，非调研声称已验证）

- 两个 worktree 同锁版本图是否 realpath 到同一 external registry entry；改 peer／传递依赖版本后是否分离；本地 workspace 包是否仍指向各自分支。
- 分别从真实 Bun 启动命令、编辑器、native addon、TypeScript `@types`、打包器／测试工具加载；确认 phantom deps 与扫描 symlink 的兼容性。
- 在不同 worktree 并发普通 install，先冷后热；将下载、目录物化、native scripts 和项目编译分开计时。不采用官方 macOS benchmark 作为 Windows NTFS 的预期收益。
- 包含 trusted/native/workspace 依赖越多，可共享目录比例可能越低；这是按文档回退机制作出的 [INFERENCE]，需要本项目依赖图实测，不能承诺“每个新增 worktree 都接近零成本”。
