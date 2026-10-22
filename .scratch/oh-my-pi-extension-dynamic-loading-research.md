# oh-my-pi Extension 动态加载研究报告

- 研究日期：2026-10-22
- 研究代码库：`E:\Developer\myhub\oh-my-pi`
- 主要研究对象：`packages/coding-agent` 的 TypeScript/JavaScript extension
- 报告目的：说明 oh-my-pi 如何在启动时通过参数加载 extension，以及如何控制、排除和验证这些 extension

> 本文中的“extension”指 OMP coding-agent 的 TS/JS 扩展模块，不是浏览器扩展。Hook 也走同一套模块加载和生命周期体系。

---

## 1. 结论摘要

1. **支持启动时通过参数动态加载 extension。**
   - `-e <path>` / `--extension <path>` 可重复使用。
   - `--hook <path>` 也作为 extension 模块路径进入同一加载管线。
   - 既可以传入入口文件，也可以传入扩展包目录。

2. **这是“启动时加载”，不是运行中热插拔。**
   - OMP 在启动阶段解析参数、发现路径、导入模块并执行 extension factory。
   - 已经加载的模块不会被卸载或重新求值；启动时未导入的新模块需要重启后才会生效。

3. **没有按“目录路径”排除 extension 的专用 CLI 参数。**
   - 不存在类似 `--exclude-extension-dir <dir>` 的开关。
   - 需要排除某个目录时，可以使用“白名单”：
     - `--no-extensions` 关闭自动发现，再用 `-e` 显式加载需要保留的目录/文件。
     - `--trusted-extension <绝对文件路径>` 做精确文件 allowlist。
   - 或者通过 `--config` 配置覆盖 `disabledExtensions`，按 extension id 禁用某个模块。
   - `extensions:` 配置项本身是“追加配置路径”，不是“只允许这些路径”的 allowlist，不能用来排除自动发现的目录。

4. **加载顺序是确定的：**
   - 模块导入并发进行；
   - factory 绑定按路径顺序串行执行；
   - 单个普通扩展导入/执行失败会记录错误，其他扩展继续加载；
   - `--trusted-extension` allowlist 的失败会中止启动。

---

## 2. 启动参数

### 2.1 Extension 相关参数

| 参数 | 作用 | 是否可重复 |
| --- | --- | --- |
| `-e, --extension <path>` | 加载扩展文件或扩展包目录 | 是 |
| `--hook <path>` | 加载 hook/extension 文件，进入同一模块加载管线 | 是 |
| `--no-extensions` | 关闭自动扩展发现；显式 `-e`/`--hook` 仍可加载 | 否 |
| `--trusted-extension <abs-file>` | 仅加载指定的绝对模块文件，关闭 ambient discovery 和 package-root 子发现 | 是 |
| `--plugin-dir <dir>` | 添加本地 plugin 根目录，由 plugin manifest 提供 extension | 是 |
| `--config <file>` | 加载额外 config.yml 风格覆盖文件，可用于设置 `disabledExtensions` | 是 |

`--trusted-extension` 不能与 `-e`、`--extension` 或 `--hook` 同时使用。它只接受存在的绝对文件路径，不接受目录。

### 2.2 基本用法

```bash
# 加载单个 extension
omp -e ./my-extension.ts

# 加载多个 extension
omp --extension ./ext/a.ts --extension ./ext/team-pack

# 只加载显式指定的 extension，忽略所有自动发现
omp --no-extensions \
  -e ~/.omp/agent/extensions/keep-a \
  -e ./extensions/keep-b

# 精确 allowlist：只加载指定的模块文件
omp --trusted-extension /abs/path/a.ts \
  --trusted-extension /abs/path/b.ts
```

### 2.3 Extension 入口形式

扩展模块需要导出一个 factory 函数。标准形式是 default export：

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("extension loaded", "info");
  });

  pi.registerTool({
    // ...
  });
}
```

加载器实际接受两种情况：

- 模块本身是函数；
- 模块的 `default` export 是函数。

相关逻辑：`getExtensionFactory()`，见 `packages/coding-agent/src/extensibility/extensions/loader.ts`。

---

## 3. 端到端加载流程

### 3.1 启动链路

```text
argv
  │
  ▼
parseArgs()
  │  解析 -e/--extension、--hook、--no-extensions、
  │  --trusted-extension、--config 等
  ▼
buildSessionOptions()
  │  additionalExtensionPaths = CLI extension paths
  │  disableExtensionDiscovery = --no-extensions
  │  trusted paths 经过 realpath + 文件类型校验
  ▼
discoverSessionExtensionPaths()
  │  合并显式路径、settings extensions、ambient 来源
  ▼
discoverExtensionPaths()
  │  发现并解析实际模块入口，去重
  ▼
loadExtensions()
  │  Promise.all 并发 import 模块
  ▼
bindPreparedExtensions()
  │  按顺序创建 Extension + ConcreteExtensionAPI
  │  串行执行 factory
  ▼
ExtensionRunner
  │  绑定 session/mode/runtime
  ▼
extension handlers / tools / commands 生效
```

### 3.2 关键阶段说明

#### 阶段 1：解析 CLI 参数

`packages/coding-agent/src/cli/flag-tables.ts` 中定义了：

- `--extension` 和 `-e` 的 setter；
- `--hook` 的 setter；
- `--trusted-extension` 的 setter；
- `--plugin-dir` 的 setter。

CLI 解析完成后，extension 路径进入 `parsed.extensions`；hook 进入 `parsed.hooks`。

#### 阶段 2：构建 session options

`packages/coding-agent/src/main.ts` 的 `buildSessionOptions()` 做两件事：

```ts
const cliExtensionPaths = [...(parsed.extensions ?? []), ...(parsed.hooks ?? [])];
if (cliExtensionPaths.length > 0) {
  options.additionalExtensionPaths = cliExtensionPaths;
}

if (parsed.noExtensions) {
  options.disableExtensionDiscovery = true;
}
```

`--trusted-extension` 走另一条分支：

- 用 `fsSync.realpathSync.native()` 规范化路径；
- 检查必须是存在的文件，不能是目录；
- 设置 `disableExtensionDiscovery = true`；
- 把这些路径作为 `additionalExtensionPaths`。

#### 阶段 3：发现 extension 路径

`discoverSessionExtensionPaths()` 负责合并：

- 显式 CLI 路径；
- settings 中的 `extensions`；
- ambient extension 来源；
- 以及显式 extension 包的 sibling capability roots。

随后调用 `discoverExtensionPaths()`。

#### 阶段 4：导入模块

`loadExtensions()` 的实现是：

```ts
const preparedExtensions = await Promise.all(
  paths.map(extPath => importExtensionModule(extPath, cwd)),
);
return bindPreparedExtensions(preparedExtensions, cwd, eventBus);
```

因此：

- 所有模块的 import 是并发的；
- import 失败会记录到 per-path error；
- 只要某个模块 import 失败，不会阻止其他模块 import。

`importExtensionModule()` 会：

- 解析相对路径；
- 通过 OMP 的 legacy Pi 模块兼容层导入；
- 读取 factory；
- 返回 `PreparedExtension`，保留解析后的路径和错误信息。

#### 阶段 5：绑定 factory

`bindPreparedExtensions()` 使用普通的 `for...of` 串行执行：

```ts
for (const prepared of preparedExtensions) {
  const { extension, error } = await bindExtension(...);
  if (error) {
    errors.push({ path: prepared.path, error });
    continue;
  }
  if (extension) extensions.push(extension);
}
```

每个 factory 会得到一个新的 `ConcreteExtensionAPI`，绑定当前 session 的 cwd、eventBus 和 runtime。

factory 内部可以注册：

- event handlers；
- tools；
- slash commands；
- keyboard shortcuts；
- flags；
- message renderers；
- provider；
- 文件写入/删除 fallback。

#### 阶段 6：Runner 初始化

扩展模块完成绑定后，`ExtensionRunner` 才会拿到 session/mode/runtime 并初始化。此时：

- 事件处理器可以开始接收 session/agent/tool 生命周期事件；
- extension 注册的 tools 会被包装，以支持 `tool_call` / `tool_result` 拦截；
- `sendMessage()`、`setActiveTools()` 等 session action 才真正可用。

在 factory 执行期间调用 `sendMessage()` 等 action 方法会抛出 `ExtensionRuntimeNotInitializedError`。扩展应先在 factory 中完成注册，再在事件回调、命令或工具执行阶段使用 session action。

---

## 4. 路径解析规则

### 4.1 显式文件

`--extension`/`-e` 传入文件路径时：

- 加载器直接将其作为模块入口；
- 显式命名文件可以使用 `.ts`、`.js`，也可以使用 `.mjs`、`.cjs`；
- 显式文件路径会绕过 `disabledExtensions` 的名称过滤。

### 4.2 目录

显式传入目录时，`resolveExtensionDirectory()` 按以下优先级解析：

1. 目录自身的 `package.json` / manifest 中声明的 extension 入口；
2. 目录下的直接 `index.ts` 或 `index.js`；
3. 一层目录扫描，查找 `.ts` / `.js` 入口。

目录扫描默认只自动识别 `.ts` 和 `.js`；manifest 中显式声明的入口可以使用 `.mjs` / `.cjs`。

### 4.3 Extension 包目录的 sibling 发现

当 `--extension`/`-e` 指向一个 extension package directory 时，OMP 还会把该包的 sibling capability 目录接入发现流程，例如：

- `skills/`
- `hooks/`
- `tools/`
- `commands/`
- `rules/`
- `prompts/`
- `.mcp.json`

这也是 `--extension` 传目录和传裸文件的重要区别。

`--trusted-extension` 不会启用这些 sibling 发现，只加载指定的模块文件。

### 4.4 去重与顺序

`discoverExtensionPaths()` 使用解析后的绝对路径做去重：

```ts
const resolved = path.resolve(extPath);
if (!seen.has(resolved)) {
  seen.add(resolved);
  allPaths.push(extPath);
}
```

发现顺序大致为：

1. native ambient extension modules；
2. ambient hooks；
3. installed plugins 提供的 extension entries；
4. 显式配置路径（CLI 和 settings）。

最终 factory 绑定顺序遵循发现后的路径顺序，因此路径顺序会影响注册顺序。

---

## 5. 自动发现来源

当前 native extension 自动发现主要包括：

| 来源 | 路径/说明 |
| --- | --- |
| 项目级 native extension | `<cwd>/.omp/extensions` |
| 用户级 native extension | `<agentDir>/extensions`，默认对应 `~/.omp/agent/extensions` |
| native hooks | `<cwd>/.omp/hooks/pre|post` 和 `<agentDir>/hooks/pre|post` |
| 已安装 plugins | 启用插件的 `omp.extensions` / `pi.extensions` manifest 入口 |
| settings 配置路径 | `extensions:` 配置项 |
| CLI 显式路径 | `-e` / `--extension` / `--hook` |

注意：

- native 自动发现当前以 `.omp` 为主；
- 旧 `.pi` 主要在 package manifest 和项目覆盖查找中兼容；
- `--no-extensions` 只关闭 extension 及 extension-package sibling root 的自动发现，不是关闭 skills、MCP、tools、prompts、rules 等所有 capability 的全局开关。

---

## 6. 如何“排除”某个 extension 目录

### 6.1 结论

**没有按目录路径排除的专用启动参数。**

如果需要排除某个目录，可选方案如下。

### 方案 A：`--no-extensions` + 显式白名单

```bash
omp --no-extensions \
  -e ~/.omp/agent/extensions/keep-a \
  -e ./extensions/keep-b
```

效果：

- 所有 ambient extension 自动发现都被关闭；
- 只有 `-e` 指定的路径被加载；
- 其他 extension 目录自然被排除。

限制：

- 这是“全量白名单”，不是“只排除一个目录、其余仍自动发现”。

### 方案 B：用 `disabledExtensions` 按 extension id 禁用

如果希望保留其他目录的自动发现，只禁用某个模块，可以使用配置覆盖：

```yaml
# exclude-extension.yml
disabledExtensions:
  - extension-module:my-old-extension
```

```bash
omp --config ./exclude-extension.yml
```

名称推导规则来自 `getExtensionNameFromPath()`：

- `.../extensions/my-old-extension/index.ts` → `extension-module:my-old-extension`
- `.../extensions/foo.ts` → `extension-module:foo`

如果目录内有多个入口文件，需要分别列出每个入口的 extension id，不支持 glob，也不支持按目录路径整体匹配。

边界：

- `disabledExtensions` 会对 ambient extension modules、installed-plugin entries，以及 configured directory 展开项生效；
- 显式传入的单个文件路径会绕过该名称过滤；
- `--trusted-extension` 本身就是 allowlist，不需要再依赖 `disabledExtensions`。

### 方案 C：`--trusted-extension` 精确文件 allowlist

```bash
omp --trusted-extension /abs/path/keep-a.ts \
  --trusted-extension /abs/path/keep-b.ts
```

效果：

- 关闭 ambient extension discovery；
- 关闭 extension package directory 的 sibling 子发现；
- 只加载指定的绝对模块文件；
- 路径必须存在，必须是文件，symlink 会先解析；
- 不能和 `-e`/`--extension`/`--hook` 组合；
- allowlist 中的模块加载失败会中止启动，而不是静默忽略。

适用场景：需要严格控制扩展代码集合、降低“意外自动发现”的范围时。

### 6.2 不应依赖的做法

以下配置/参数不能直接用来“排除目录”：

- `extensions:`：它是追加配置路径，不是 allowlist；
- `--plugin-dir`：它是增加 plugin 根目录，不提供 subtractive 语义；
- `disabledExtensions`：它按 extension id 过滤，不按目录路径过滤；
- `--no-extensions`：它是全局关闭 ambient discovery，不能只排除单个目录。

---

## 7. 热加载与生命周期边界

### 7.1 启动时动态加载

“动态”在这里指：

- 不把 extension 硬编码进 OMP；
- 通过启动参数或配置在进程启动时决定加载哪些模块；
- 模块在启动阶段被 import 并执行 factory。

它**不**表示进程运行中可以随时添加新的 extension 模块。

### 7.2 已有配置的热更新

对于 settings 管理的 extension 来源，OMP 支持一定程度的 live source 控制：

- 修改 `extensions` 或 `disabledExtensions` 后，已加载的、settings-governed 的 handlers、commands、tools、renderers、shortcuts、flags、file fallbacks 可以暂停或恢复；
- 内置工具被扩展覆盖时，暂停扩展可以恢复 native tool；
- 但模块不会被 unload 或 re-evaluate；
- 启动时没有 import 的新模块，仍需要重启才能加载。

显式-only session（`--no-extensions` / `disableExtensionDiscovery`）不会应用这类 settings 变化。

### 7.3 子 session

子 session 可以复用父 session 已 import 的 factory，但会绑定新的 `ExtensionAPI`：

- 每个 session 有自己的 cwd、eventBus、runtime 和注册集合；
- 模块级变量仍在同一进程内共享；
- 这避免了重复求值模块图，但不会把 module-level 状态隔离成 per-session 状态。

---

## 8. 安全与信任模型

- extension 是进程内 TS/JS 代码，拥有与 OMP 进程相近的宿主权限。
- `--trusted-extension` 是“精确模块 allowlist”，不是沙箱，也不是关闭其他 capability 的全局开关。
- `--no-extensions` 关闭 ambient extension discovery，但 skills、MCP、tools、prompts、rules 等其他发现子系统仍有自己的开关。
- 对不可信 extension，不应只依赖文件名或目录位置判断安全性；需要审查代码，或使用 `--trusted-extension` 明确列出允许的文件。

---

## 9. 实测验证

### 9.1 环境

- 本机安装的 OMP：`omp v18.12.4`
- 仓库源码：`E:\Developer\myhub\oh-my-pi`
- 仓库内直接运行 `bun packages/coding-agent/src/cli.ts --help` 受本机缺少 `pi_natives` native addon 影响，端到端 smoke 使用已安装的 `omp` CLI；源码行为通过源码、文档和现有测试交叉核对。

### 9.2 验证 1：`-e` 启动参数确实加载 extension

创建临时 extension，并用它注册一个自定义 provider：

```bash
omp models startup-arg-probe \
  --extension C:/.../omp-cli-extension-probe.ts \
  --no-extensions --json
```

输出包含：

```json
{
  "provider": "startup-arg-probe",
  "id": "probe-model",
  "selector": "startup-arg-probe/probe-model"
}
```

结论：`--extension` 路径在启动时被加载，且 `--no-extensions` 不会阻止显式 `-e`。

### 9.3 验证 2：按目录名排除扩展

测试目录：

```text
.omp/extensions/included/index.ts
.omp/extensions/excluded/index.ts
```

两个扩展分别注册 `probe-included` 和 `probe-excluded` provider。

1. 默认执行：

```bash
omp models --json
```

结果：

```text
probe-excluded/excluded-model
probe-included/included-model
```

2. 使用配置覆盖：

```yaml
# config.yml
disabledExtensions:
  - extension-module:excluded
```

```bash
omp models --json --config ./config.yml
```

结果：

```text
probe-included/included-model
```

3. 使用白名单模式：

```bash
omp models --json --no-extensions \
  --extension ./.omp/extensions/included/index.ts
```

结果：

```text
probe-included/included-model
```

结论：

- `disabledExtensions` 可以通过目录 `index.ts` 推导出的 extension id 排除该扩展；
- `--no-extensions` + `-e` 可以作为显式 allowlist；
- 没有直接的“排除某个目录路径”参数。

测试完成后临时目录已清理。

---

## 10. 推荐使用方式

| 目标 | 推荐方式 |
| --- | --- |
| 临时加载一个扩展做实验 | `omp -e ./ext.ts` |
| 一次加载多个扩展 | 重复 `--extension` |
| 只加载受控扩展集合 | `omp --no-extensions -e ...` |
| 严格 allowlist 模块文件 | `omp --trusted-extension /abs/a.ts` |
| 保留自动发现但禁用一个扩展 | `--config` + `disabledExtensions` |
| 加载本地 plugin 包 | `--plugin-dir <dir>`，由 plugin manifest 声明 extension |
| 排查扩展是否加载 | 先检查 `-e` 路径和 `--no-extensions`，再检查 `disabledExtensions` id |

推荐的排查顺序：

1. 确认路径存在且是文件或可解析目录；
2. 确认模块导出的是函数（或 default export 是函数）；
3. 确认是否被 `--no-extensions` 或 `disabledExtensions` 过滤；
4. 查看启动日志中的 extension load error；
5. 确认加载阶段没有调用尚未初始化的 session action。

---

## 11. 关键源码与文档索引

### 文档

- `docs/cli-reference.md`：Launch flags，extension/hook/trusted-extension/no-extensions 参数说明
- `docs/extensions.md`：扩展 API、factory、注册能力、生命周期
- `docs/extension-loading.md`：发现顺序、路径来源、过滤、live source changes
- `docs/settings.md`：`disabledExtensions` 等 settings
- `docs/tools/` 与 `docs/skills/`：其他 capability 的独立开关

### 源码

- `packages/coding-agent/src/cli/flag-tables.ts`
  - `--extension` / `-e`
  - `--hook`
  - `--trusted-extension`
  - `--plugin-dir`
- `packages/coding-agent/src/main.ts`
  - `buildSessionOptions()`
  - trusted extension 校验
  - CLI extension package sibling root 注入
- `packages/coding-agent/src/extensibility/extensions/loader.ts`
  - `getExtensionFactory()`
  - `importExtensionModule()`
  - `bindExtension()`
  - `loadExtensions()`
  - `bindPreparedExtensions()`
  - `discoverExtensionPaths()`
- `packages/coding-agent/src/extensibility/extensions/directory-resolution.ts`
  - manifest / index / one-level scan 解析
- `packages/coding-agent/src/discovery/helpers.ts`
  - `getExtensionNameFromPath()`
- `packages/coding-agent/src/capability/index.ts`
  - `disabledExtensions` 的 capability 层过滤

### 相关测试

- `packages/coding-agent/test/cli-extension-path.test.ts`
  - `--extension` 路径解析，包括 Windows 路径含空格的情况
- `packages/coding-agent/test/cli-explicit-extension-isolation.test.ts`
  - `--no-extensions` 下显式 extension/hook 仍加载
  - trusted extension 路径规范化与目录拒绝
- `packages/coding-agent/test/cli-extension-providers.test.ts`
  - extension 注册 provider 后可在 CLI 中被解析

---

## 12. 最终结论

oh-my-pi 确实支持启动时通过 `-e`/`--extension` 动态加载 extension，且支持重复加载、扩展包目录、hook 模块、精确 trusted allowlist 和配置级禁用。

需要区分两件事：

- **启动时按参数选择模块**：支持；
- **运行中热插拔新模块**：不支持，启动时未导入的模块需要重启。

如果目标是“排除某个 extension 目录”，当前没有按路径排除的单参数；应使用：

1. `--no-extensions` + 显式 `-e` 白名单；或
2. `--config` + `disabledExtensions` 按 extension id 禁用；或
3. `--trusted-extension` 精确文件 allowlist。

不要依赖 `extensions:` 配置项来实现排除，因为它是追加发现来源，不是 allowlist。
