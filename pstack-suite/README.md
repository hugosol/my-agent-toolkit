# pstack Suite 资源维护

从 toolkit 根目录运行以下命令。使用根 `package.json` 指定的 Bun；构建不联网，也不调用 OMP。

```sh
bun run pstack:preview
bun run pstack:build
bun run pstack:check
bun run pstack:upstream -- --local "/home/me/src/cursor/plugins"
bun run test:pstack
```

Windows 比较示例：`bun run pstack:upstream -- --local "C:/src/cursor/plugins"`。`--local` 必须是完整绝对路径，指向含 `pstack/` 的上游 checkout 根目录，不是 `pstack/` 本身。任一维护命令后加 `-- --help` 查看用法。

| 命令 | 行为 |
| --- | --- |
| `pstack:build` | 从固定快照和映射生成清单中的交付文件，更新所有权记录，并清理已过期的生成文件。 |
| `pstack:check` | 比较预期的生成字节及所有权，报告缺失、变更和过期记录；不改输入、产物或目录。 |
| `pstack:preview` | 显示每项本地适配的源路径、交付路径、源行号、名称、原因和替换文本；不读交付状态，也不写文件。 |
| `pstack:upstream` | 只读比较已列入清单的快照源文件与指定目录，显示文本差异、二进制大小和 SHA-256，或报告上游缺项；不应用映射，不扫描或同步未列出的资源。 |

退出 `0` 表示成功（对于 `check`/`upstream`，表示无差异）；`1` 表示 `check` 发现交付不一致或 `upstream` 发现基线差异；`2` 表示用法、输入、映射或文件系统错误。构建先验证快照和映射，再发布文件。发布不是整包事务：失败时会列出此前完成的文件效果；先处理错误并检查这些效果，再重跑。构建不会自动回滚先前已完成的操作。

## 更新流程

[manifest.json](manifest.json) 记录上游仓库、固定提交和版本，以及每个源文件及其确切交付位置。上游授权保留在[交付许可证](generated/LICENSE)。[待迁移事项](MIGRATION-BACKLOG.md) 不属于当前资源清单。

1. 更换基线时，先用 `pstack:upstream` 对照新版 checkout。把选中的原始字节复制到 `upstream/`，保留相对路径并同步更新清单里的来源版本与资源列表。不要在快照上实施本地适配。
2. 在 `mappings/` 调整适配；用 `pstack:preview` 单独审阅这些变化。因上游改写而重定位锚点，与有意改变本地行为分开审阅。
3. **先停止使用同一包的 pstack 会话**，再运行 `pstack:build` 和 `pstack:check`。提交快照、清单、映射、生成文件及生成所有权记录的对应改动，然后新发起会话。本包不提供热加载、跨进程检测或并发发布；未更新时正常并行使用不受限制。

清单每项的 `source` 相对于 `upstream/`，`output` 相对于 `generated/`，可选 `mapping` 相对于 `mappings/`。路径用 `/`，保留确切大小写。`kind: "text"` 声明 UTF-8 文本，只将 CRLF 转成 LF，原有 BOM、孤立 CR 和文件末尾换行保持原状；`kind: "binary"` 逐字节复制，不允许映射。Git 检出也不对快照或交付文件自动换行转换。

### 一项操作对应一个行为

参考 [in-your-own-words.json](mappings/in-your-own-words.json)：只把隐藏技能的手工调用改为 OMP 原生 `/skill:in-your-own-words`，不改变隐藏标记或方法正文。

- `name` 是映射文件内唯一且稳定的小写连字符名称；`reason` 说明这项独立改动的目的。
- `anchor` 必须在规范化的上游文本中恰好出现一次。可选 `find` 将实际编辑范围缩小到锚点内同样恰好出现一次的片段；不指定则替换整个锚点。`replace` 是新文本，可为空表示删除。需要插入时，可将小片段替换为含原片段及新增内容的文本。映射内以 LF 写多行锚点与替换。
- 操作都匹配原始快照，不匹配其他操作的输出。锚点上下文可以重叠，但实际编辑范围不能重叠。遇到缺失、歧义或冲突会按操作名失败，不会选第一个匹配或猜测。

### 所有权与恢复

当前清单和上次生成的 [generated-ownership.json](generated-ownership.json) 一起确定写入范围。生成文件不要手改：已登记且仍选中的文件会被重新生成；未登记的同名文件会阻止构建，不会被覆盖。需要改名且只改变大小写时，先在一次构建中移除旧路径，再加入新路径。

清理只删除不再选中、且内容与登记摘要一致的单个普通文件。已改写的过期文件与替换成目录或链接的过期路径会保留并解除登记。构建不会跟随目录链接或 junction，也不会递归删除目录、遍历未知文件或清理用户证据。将需要保留的用户文件放在清单之外。当诊断报告所有权记录无法更新时，先对照已报告的文件效果和实际字节；保留不确定归属的文件，再把阻塞路径移出交付位置后重建，不要删除整个生成目录。

## 验证

`bun run test:pstack` 是 pstack 特性的测试分区，包含隔离文件系统上的维护命令及已安装 OMP 对真实适配样例的原生读取。OMP 从现有安装选择（或显式指定 `OMP_CLI`），不安装宿主，不使用生产会话或模型凭据。受控 provider 只证明实际发出的请求包含显式调用的技能正文，不评价模型行为。其他 pstack 自动用例放入同一分区；TypeScript 变更也运行 `bun run typecheck`。

### Windows statechart

在 OMP 中显式调用 `/skill:statechart`，并提供自有的 `.tla`、TLC `.cfg` 与可选的视图模块。也可直接从 toolkit 根运行：

```powershell
$env:TLA2TOOLS = 'C:\deps\tla2tools.jar'
# 可选：不使用 PATH 上的 java 时，指定现有 Java 可执行文件。
# $env:JAVA = 'C:\Program Files\Java\jdk-26\bin\java.exe'
bun pstack-suite/generated/skills/statechart/scripts/statechart.ts `
  'C:\work\Request.tla' --out 'C:\work\Request-chart'
```

依赖 Bun 1.4.4、Java 11 或更高版本，以及官方 [TLA+ Tools 1.7.4](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4) 的 `tla2tools.jar`（TLC 2.19，`5a47802`，SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`）。Windows 验证选用 Oracle JDK 26。维护及运行命令不安装或下载依赖。小图产出 `chart.mmd`、`report.md` 和 `tlc.out`；退出 `0` 表示规则成立，`1` 表示规则违反且仍有报告，`2` 表示输入或执行错误而未发布产物。SVG 渲染是[单独的可选步骤](generated/skills/statechart/references/render.md)，不参与 Java/TLC 验证。

在 Windows 上验证时，设置 `TLA2TOOLS`，并令 `JAVA` 指向 JDK 内实际的 `bin\java.exe`，再执行 `bun run test:pstack`。测试会将启动的进程 PID 与 TLC 自报 PID 对照；Oracle 的 `javapath` 转发程序会启动另一进程，不能用于此核对。缺少 Java、TLC 或实际 OMP 会使相应测试失败，不记为通过。只运行本分区可用 `bun test tests/pstack/windows-statechart.test.ts`。设定 `PSTACK_STATECHART_EVIDENCE_DIR` 为本次独占证据目录可保留命令、真实进程退出、产物及资源清理证据。操作时如需记录所启动 Java 命令的参数、PID 和退出，可显式设置 `PSTACK_STATECHART_PROCESS_TRACE=1`，它只向 stderr 写诊断，不记录继承的环境变量。
