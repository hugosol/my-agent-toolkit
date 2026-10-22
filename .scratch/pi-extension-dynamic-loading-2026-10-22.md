# Pi Extension 动态加载机制研究报告

- 研究对象：`@earendil-works/pi-coding-agent`
- 版本：`1.3.0`
- 代码版本：`main@698a2d2`
- 调研日期：2026-10-22
- 调研范围：启动参数、Extension 来源解析、项目信任、模块加载、运行时注册、按目录排除能力

## 1. 结论摘要

Pi 支持在启动时通过参数动态加载 Extension。核心参数是：

```bash
pi --extension ./hello.ts
# 或
pi -e ./hello.ts
```

关键结论：

1. `-e` / `--extension` 可以重复使用，用于在本次进程启动时加载本地文件、目录、Pi package 或内置 Extension。
2. 通过 `-e` 加载的内容是临时资源，只对当前进程有效，不会写入 `settings.json`。
3. 本地 TypeScript Extension 通过 `jiti` 直接导入，不需要单独编译。
4. `-ne` / `--no-extensions` 会关闭自动发现、配置文件和内置 Extension，但不会阻止显式传入的 `-e`。
5. 当前没有按单个目录排除 Extension 的启动参数，例如不存在 `--exclude-extension <path>`。
6. 如果只想启用少数 Extension，可以用 `-ne` 加多个 `-e`；如果要长期排除某个目录，应使用 settings 的资源过滤规则，而不是依赖 `-e`。

## 2. 启动加载链路

### 2.1 参数解析

`packages/coding-agent/src/cli/args.ts:186` 负责解析：

```ts
} else if ((arg === "--extension" || arg === "-e") && i + 1 < args.length) {
    result.extensions = result.extensions ?? [];
    result.extensions.push(args[++i]);
} else if (arg === "--no-extensions" || arg === "-ne") {
    result.noExtensions = true;
}
```

这说明：

- `-e` 是累加语义。
- `-ne` 是一个全局开关，用于关闭 Extension 自动加载。
- 没有针对单个 Extension 路径的排除参数。

### 2.2 CLI 路径转为内部资源

在 `packages/coding-agent/src/main.ts:556` 中，本地路径会先相对于当前工作目录解析：

```ts
function resolveCliPaths(cwd: string, paths: string[] | undefined): string[] | undefined {
    return paths?.map((value) => (isLocalPath(value) ? resolvePath(value, cwd) : value));
}
```

随后 `main.ts:729` 将结果传给会话运行时：

```ts
const resolvedExtensionPaths = resolveCliPaths(cwd, parsed.extensions);
```

并在创建资源加载器时注入：

```ts
resourceLoaderOptions: {
    additionalExtensionPaths: resolvedExtensionPaths,
    // ...
    noExtensions: parsed.noExtensions,
}
```

因此 CLI Extension 路径通过 `additionalExtensionPaths` 进入 `ResourceLoader`，而不是写入持久配置。

### 2.3 ResourceLoader 的加载流程

`packages/coding-agent/src/core/resource-loader.ts:505-585` 的核心流程可以概括为：

```text
解析启动参数
  -> resolveCliPaths(cwd)
  -> ResourceLoader.additionalExtensionPaths
  -> 如果涉及项目信任，先执行 project_trust bootstrap 加载
  -> packageManager.resolve() 解析自动发现、settings、package 和内置 Extension
  -> resolveExtensionSources(additionalExtensionPaths, { temporary: true })
  -> 合并 CLI 路径和启用路径
  -> loadExtensionPaths()
  -> jiti import 模块
  -> 调用 Extension factory
  -> 收集注册结果
```

资源加载器中有一个 bootstrap 阶段：

- `loadProjectTrustExtensions()` 会临时将项目设为不可信。
- 该阶段仍会加载用户级、全局级和临时 CLI Extension。
- 项目本地 Extension 和项目 package 要等信任决定完成后再加载。

相关代码注释（`resource-loader.ts:505-507`）明确说明了这个设计：在项目信任确认前，项目本地扩展和项目 package 不应加载。

### 2.4 最终路径合并

`resource-loader.ts:577-578` 中的关键表达式是：

```ts
const extensionPaths = (
    this.noExtensions ? cliEnabledExtensions : this.mergePaths(cliEnabledExtensions, enabledExtensions)
)
```

含义：

- 正常模式：CLI 显式路径 + 自动发现/配置/package/内置路径。
- `--no-extensions`：只保留 CLI 显式路径。
- `mergePaths()` 会对 canonical path 去重，避免同一 Extension 因多个来源重复加载。

CLI 路径在 `mergePaths()` 中作为 primary 列表传入，因此最终加载列表以 CLI 路径为优先部分；真正加载顺序仍会受到预加载和 `loadFinalExtensionSet()` 的复用逻辑影响。

## 3. Extension 的来源类型

### 3.1 `-e` 支持哪些来源

`resolveExtensionSources()` 将来源分成内置 Extension 和普通 package source：

- 内置：`builtin:<name>`
- 普通来源：本地路径、`npm:`、git 来源、URL

示例：

```bash
# 本地单个文件
pi -e ./hello.ts

# 本地目录
pi -e ./extensions/review

# npm package
pi -e npm:@example/pi-tools

# git package
pi -e git:github.com/example/pi-tools@v1

# 内置 Extension
pi -e builtin:mcp
```

文档 `packages/coding-agent/docs/packages.md:23` 也明确说明，`-e` 可以用于“试运行一个 package”，而不用先添加到 settings。

### 3.2 目录如何解析

本地目录不是简单地一律递归扫描，而是遵循 package discovery 规则。`package-manager.ts:569-596` 的解析顺序包括：

1. `package.json` 中存在 `pi.extensions` 字段：加载声明的入口。
2. 目录中存在 `index.ts`。
3. 目录中存在 `index.js`。
4. 作为 package 继续发现常规资源目录。

自动发现扩展目录时，`collectAutoExtensionEntries()` 只扫描一层，并支持：

- 直接 `.ts` / `.js` 文件。
- 子目录中的 `index.ts` / `index.js`。
- 子目录 `package.json` 中的 `pi.extensions`。
- `.gitignore`、`.ignore`、`.fdignore` 中的忽略规则。

因此，深层嵌套的 Extension 需要显式声明入口，不能依赖任意深度递归。

### 3.3 `-e` 和 `settings.json` 的区别

| 方式 | 作用范围 | 是否持久化 | 典型用途 |
|---|---|---|---|
| `pi -e <path>` | 当前进程 | 否 | 临时试用、脚本化启动、CI |
| `settings.json` 的 `extensions` | 用户或项目配置 | 是 | 长期启用的 Extension |
| `settings.json` 的 `packages` | 用户或项目配置 | 是 | 安装和分发 Pi package |
| 自动发现目录 | 当前用户/项目 | 文件系统状态 | 放置本地扩展 |
| `builtin:<name>` | 当前进程或 settings | 取决于方式 | Pi 内置能力 |

`-e` 传入的 npm/git 资源会以 `temporary` scope 解析；未安装时可能临时安装，但不会自动变成 settings 中的持久 package。

## 4. 项目信任与加载边界

Extension 是运行在 Pi 进程内的可执行 TypeScript/JavaScript 代码，和 Pi 拥有相同的操作系统权限。它可以读取 prompt、工具调用、文件、凭据和会话历史。

启动阶段的信任边界如下：

1. 用户级和全局级资源可以先加载。
2. 临时 CLI Extension 可以先加载。
3. 项目本地 `.pi/extensions`、项目 settings 和项目 package 需要项目信任。
4. 信任确认后，ResourceLoader 重新解析 settings，并加载项目级资源。
5. 预信任阶段已经加载的 Extension 会在最终阶段按路径复用，避免重复实例化。

这也是为什么显式 CLI Extension 能参与 `project_trust` 事件，而项目内 Extension 不能提前参与。文档 `extensions.md:50` 对此有明确说明。

安全含义：

- `pi -e ./some-extension.ts` 等价于在当前进程执行受信任代码。
- 不应加载来源不明的 Extension。
- 项目 Extension 的信任提示不是为了限制工具权限，而是为了防止未审阅的项目资源在启动时执行。

## 5. 模块加载与运行时注册

### 5.1 jiti 导入

`packages/coding-agent/src/core/extensions/loader.ts:567-582` 使用 `jiti` 导入模块：

```ts
const jiti = createJitiImpl(import.meta.url, {
    moduleCache: false,
    ...resolutionOptions,
});
const module = await jiti.import(extensionPath, { default: true });
const factory = module as ExtensionFactory;
```

要点：

- 支持 TypeScript，不需要额外构建步骤。
- `moduleCache: false` 使 Extension 可以在 reload 时重新执行模块。
- Extension 必须默认导出一个 factory 函数；无效导出会产生加载错误。

### 5.2 factory 执行

`loadExtension()` 在导入模块后调用 `initializeExtension()`。Extension factory 接收 `ExtensionAPI`，可以注册：

- 工具
- `/` 命令
- 快捷键
- 事件处理器
- 模型 provider
- MCP server
- 消息渲染器
- 其他 Extension 能力

factory 可以是同步或异步函数；Pi 会等待异步 factory 完成后才继续启动流程。

### 5.3 单个 Extension 失败不会中断其他 Extension

`loadExtension()` 会捕获导入或 factory 执行错误，并把错误放入 `LoadExtensionsResult.errors`。加载器继续处理后续路径。因此：

- 一个损坏的 Extension 不会阻止 Pi 启动。
- 错误会出现在启动诊断中。
- 需要检查 `resourceLoader.getExtensions().errors` 或相应的 UI 诊断。

### 5.4 reload 与运行时替换

`/reload` 会清理 Extension 缓存并重新解析资源，随后创建新的 Extension runtime。Extension 内部如果调用 `await ctx.reload()`，在 await 之后不能继续使用旧 runtime 的状态，因为旧 runtime 已经被替换。

这与启动时动态加载是两个不同层面：

- 启动时：根据 CLI/settings 决定加载哪些 Extension。
- 运行时：`/reload` 重新加载当前来源集合，并刷新 Extension runtime。

## 6. 按目录排除 Extension 的能力

### 6.1 没有单项排除启动参数

当前 CLI 只有：

- `-e` / `--extension`：增加来源。
- `-ne` / `--no-extensions`：关闭所有非显式来源。

不存在：

```bash
pi --exclude-extension ./extensions/legacy
```

`--exclude-tools` 只过滤工具名，不会阻止 Extension 模块加载，也不会阻止其命令、事件处理器或其他注册行为生效。

也不要使用：

```bash
pi -e '!./extensions/legacy'
```

`-e` 是“增加来源”的接口；`!` 不会被解析为排除规则。Package 的 `pi` manifest 和 settings 资源数组才支持 `!pattern` / `-path` 过滤。

### 6.2 一次性启动时只加载指定 Extension

如果目标是本次启动排除某个自动发现的 Extension，最直接的方法是用 `-ne` 关闭自动来源，再枚举要加载的路径：

```bash
pi -ne \
  -e ~/.pi/agent/extensions/keep-a \
  -e ./.pi/extensions/keep-b
```

效果：

- 不加载 `~/.pi/agent/extensions/legacy`。
- 不加载项目 `.pi/extensions` 中未显式列出的内容。
- 不加载 settings 中配置的 Extension。
- 不加载内置 Extension，除非也用 `-e builtin:<name>` 显式加入。

### 6.3 持久排除一个目录

在用户级 `~/.pi/agent/settings.json` 或项目级 `.pi/settings.json` 中使用资源过滤：

```json
{
  "extensions": ["!extensions/legacy/**"]
}
```

说明：

- 用户 settings 的相对路径基于 agent 目录，项目 settings 的相对路径基于项目的 `.pi` 目录。
- 目录排除应使用 glob：`!extensions/legacy/**`。
- `-path` 是精确路径排除，更适合单个文件，例如 `-extensions/legacy/index.ts`。
- 配置数组还支持 `+path` 精确强制包含。
- 这些规则只影响资源发现和启停，不会执行或沙箱化 Extension。

也可以使用 `pi config` 的 UI 对已发现的 Extension 做持久启停。

### 6.4 通过 extensions 目录的忽略文件排除

自动发现器会读取 Extension 根目录下的 `.gitignore`、`.ignore`、`.fdignore`。因此可以在这类文件中忽略一个子目录。这同样是持久配置，不是启动参数：

```gitignore
legacy/
```

该方式依赖目录发现逻辑，不会影响显式传入的 `-e` 路径。

### 6.5 Package 内部过滤

如果目标 Extension 属于某个 Pi package，可以在 settings 的 `packages` 对象形式中使用 package filter：

```json
{
  "packages": [
    {
      "source": "npm:@example/pi-tools",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"]
    }
  ]
}
```

这类过滤只缩小该 package manifest 已声明资源的范围，不会暴露 package 未声明的文件，也不能替代顶层目录的全局排除。

## 7. 推荐用法

### 7.1 临时加载本地开发中的 Extension

```bash
pi -e ./extensions/my-extension.ts
```

适合开发阶段反复修改、反复启动的场景。TypeScript 由 jiti 直接处理。

### 7.2 临时加载 npm package

```bash
pi -e npm:@example/pi-tools@1.0.0
```

不会写入 settings，适合 CI、一次性任务或包试用。

### 7.3 最小化启动集合

```bash
pi -ne \
  -e ./extensions/required-a \
  -e npm:@example/required-b
```

适合需要严格控制启动时可执行代码的场景。

### 7.4 长期排除某个 Extension 目录

在对应 settings 中使用：

```json
{
  "extensions": ["!extensions/legacy/**"]
}
```

如果只是临时排查，不要为了排除一个目录而修改持久 settings；优先使用 `-ne` 加显式 `-e`。

## 8. 证据索引

### 8.1 文档

- `packages/coding-agent/docs/cli.md:194-197`：`-e` / `--no-extensions` 的用户接口说明。
- `packages/coding-agent/docs/extensions.md:34-50`：Extension 创建、加载、目录入口、reload 和项目信任说明。
- `packages/coding-agent/docs/packages.md:23-40`：使用 `-e` 临时加载 package，以及本地、npm、git、URL 来源。
- `packages/coding-agent/docs/settings.md:148-163`：资源路径、`!pattern`、`+path`、`-path` 过滤和内置 Extension 配置。
- `packages/coding-agent/docs/packages.md:102-119`：package manifest 过滤语法。

### 8.2 代码

- `packages/coding-agent/src/cli/args.ts:186-190`：解析 `-e` 和 `-ne`。
- `packages/coding-agent/src/main.ts:556-558`：本地 CLI 路径相对于 cwd 解析。
- `packages/coding-agent/src/main.ts:729`：将 CLI Extension 路径转为运行时资源。
- `packages/coding-agent/src/main.ts:782-789`：注入 `additionalExtensionPaths` 和 `noExtensions`。
- `packages/coding-agent/src/core/resource-loader.ts:505-585`：项目信任 bootstrap、资源解析、CLI 与启用路径合并。
- `packages/coding-agent/src/core/resource-loader.ts:680-700`：最终 Extension 集合的构建和缓存加载。
- `packages/coding-agent/src/core/resource-loader.ts:724-787`：预信任结果复用、最终顺序、错误汇总和冲突诊断。
- `packages/coding-agent/src/core/package-manager.ts:997-1010`：`resolveExtensionSources()` 对 CLI 来源的处理。
- `packages/coding-agent/src/core/package-manager.ts:1366-1394`：本地文件/目录来源的解析。
- `packages/coding-agent/src/core/package-manager.ts:569-596`：目录入口解析规则。
- `packages/coding-agent/src/core/package-manager.ts:599-645`：自动发现 Extension 目录的一层扫描和 ignore 规则。
- `packages/coding-agent/src/core/package-manager.ts:724-740`：`!`、`+`、`-` 资源覆盖规则。
- `packages/coding-agent/src/core/package-manager.ts:2420-2492`：自动发现资源如何应用用户/项目过滤。
- `packages/coding-agent/src/core/extensions/loader.ts:567-582`：jiti 导入模块。
- `packages/coding-agent/src/core/extensions/loader.ts:634-665`：Extension factory 初始化和错误捕获。
- `packages/coding-agent/src/core/extensions/loader.ts:676-716`：批量加载路径并收集结果。

## 9. 最终判断

Pi 的启动时动态加载能力是明确且可用的，`-e` / `--extension` 是官方入口。它适合临时加载本地文件、目录、npm/git package 和内置 Extension，并且与持久 settings 分离。

但当前没有“排除某一个 Extension 目录”的启动参数。实际可用的策略是：

1. 需要一次性严格控制：`-ne` 加多个 `-e`。
2. 需要长期排除：在 settings 的 `extensions` 数组中使用 `!extensions/<name>/**`。
3. 需要 package 内部过滤：在 `packages` 对象中使用 `!pattern` / `-path`。
4. 需要临时排查某个目录：优先修改启动参数组合，不要依赖不存在的单项排除开关。

