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

## 资源与来源

[固定清单](manifest.json) 逐文件记录交付资产；下面的分类同时标明扩展时应使用的来源和许可证。pstack 及 Cursor Team Kit 为同一 [cursor/plugins 固定提交](https://github.com/cursor/plugins/tree/aaeb0ea3a0584995aa8f55ce44c6c5259414b896)，但分别保留各自的上游授权文件；不能用一份授权替代不同来源的记录。

| 类别 | 相对布局与来源 | 读取方式及边界 |
| --- | --- | --- |
| 技能及原则 | `pstack/skills/<name>/SKILL.md` → `generated/skills/<name>/SKILL.md`；[pstack MIT](generated/LICENSE) | [核心路由](generated/skills/poteto-mode/SKILL.md) 与[帮助](generated/skills/poteto-help/SKILL.md) 列出实际资源；带隐藏标记的技能按需读取或显式 `/skill:<name>`，不在默认提示中展开。 |
| Playbooks | `skills/poteto-mode/playbooks/`，保留相对布局；pstack MIT | 具体步骤由路由按需打开，不是独立的 slash 命令。 |
| Worker | [skills/poteto-mode/worker.md](generated/skills/poteto-mode/worker.md)；pstack MIT | Worker kickoff 传递该文件的绝对路径；worker 与持续模式都以同一份生成的 `skills/poteto-mode/SKILL.md` 为工程规则来源。 |
| Persona | 上游 `pstack/agents/`；pstack MIT | 与 worker 规则分开。只有完成 OMP 原生 persona 适配和角色绑定生成后才登记实际 persona；上游角色名称不等于已加载 persona。 |
| 脚本 | 上游技能内的 `scripts/`；pstack MIT | 可执行资产单独登记、保留相对路径，并说明运行依赖、写入与副作用；指令引用不代表脚本已随包提供。 |
| 资料 | 上游技能内 `references/`，或 `pstack/docs/`；pstack MIT | 随实际消费项登记。当前包括决策日志 TSV 模板与 TypeScript 模式参考。 |
| 必要外部技能 | Cursor Team Kit 的 `cursor-team-kit/skills/{deslop,control-cli,control-ui}/SKILL.md`；[该来源的 MIT 授权](https://github.com/cursor/plugins/blob/aaeb0ea3a0584995aa8f55ce44c6c5259414b896/cursor-team-kit/LICENSE) | 外部依赖资源适配时分别登记源文件与授权，不加载整个插件。当前核心路由仅在实际技能存在时使用相应方法。 |

直接打开生成文件可阅读方法；文件存在不能证明任务调用、运行取证或其他工具机制已经接上。纯本地方法与需要后续资产的工作流分开；不在清单的专题见[待迁移说明](MIGRATION-BACKLOG.md)。

## OMP 持续模式

直接运行原生 pstack 会话时，显式加载 [`pstack-suite/omp.ts`](omp.ts)，并把绝对的 `pstack-suite/generated/skills` 路径加入 OMP 的 `skills.customDirectories`。普通 OMP 扩展目录不自动加载此入口。新进程首次打开没有保存值的会话时默认开启。输入 `/poteto-mode` 切换开关；开启时编辑器上方显示 `◈ Poteto mode`，关闭时移除该行。两种切换都给出提示，原生会话记录保留该值；退出后用 `omp --resume <会话文件>` 及相同的入口和配置恢复。

首次启用的请求带上[生成的工程规则](generated/skills/poteto-mode/SKILL.md)及绝对来源路径，后续启用轮次只添加简短提醒。关闭只停止新增贡献，不移除已有会话历史。`/skill:poteto-mode` 是原生单次技能调用，即使持续模式关闭也能显式读取正文，并且不会改开关。隐藏技能不会列在模型的默认技能目录中；可以使用明确的 `/skill:<name>` 或 `skill://<name>`。读取技能正文后，从原生读取结果给出的源文件位置解析配套相对路径；子代理的 kickoff 明确传递资源路径，不依赖父会话正文。

开关仅更新本地会话状态、提示贡献和界面。开启不会执行或授权合并、部署、对外业务操作；项目、宿主及外部系统的授权要求仍适用。这不是用来拦截后续模型操作的权限控制。

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

### H1：真实 OMP TUI 开关与恢复

下面使用已安装的 OMP 和本地受控 provider。实际 TUI 的显示只由操作者确认；RPC 的 marker 事件、请求及日志不是屏幕验收。先完成自动检查：`bun run test:pstack --test-name-pattern 'Pstack native mode'`。如需留存自动证据，运行前把 `PSTACK_MODE_EVIDENCE_DIR` 指向本次独占证据目录；其中有双向切换前后 JSONL、RPC frames、请求内容、进程退出和 Git 副作用对照。

1. 在 toolkit 根目录打开 PowerShell 7。用第一个终端启动只监听动态回环端口的受控 provider，保持它运行，并记下输出的目录：

   ```powershell
   $env:PSTACK_H1_ROOT = Join-Path (Get-Location) ".scratch/pstack-omp-suite/evidence/h1-$([Guid]::NewGuid().ToString('N'))"
   bun -e 'import { startCaptureServer } from "./tests/harness-dock/capture-server"; const root = process.env.PSTACK_H1_ROOT; const server = startCaptureServer({ dir: `${root}/requests` }); await Bun.write(`${root}/capture-url.txt`, server.baseUrl); console.log(root);'
   ```

2. 在第二个终端从同一 toolkit 根目录运行下列命令。配置、日志、工作目录和会话均落在独占目录，不读取生产会话。使用默认 TUI，不重定向屏幕或 stdin：

   ```powershell
   $repo = (Get-Location).Path
   $root = Read-Host '输入第一个终端输出的证据目录'
   $env:DOCK_CAPTURE_BASE_URL = (Get-Content -Raw "$root/capture-url.txt").Trim()
   $env:HOME = $env:USERPROFILE = "$root/home"
   $env:PI_CODING_AGENT_DIR = "$root/home/.omp/agent"
   'OMP_PROFILE','PI_PROFILE','OMPCODE','PI_CONFIG_DIR','PI_CONFIG_FILES','XDG_DATA_HOME','XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_CACHE_HOME' | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
   Get-ChildItem Env: | Where-Object Name -Like 'OMP_AUTH_BROKER_*' | ForEach-Object { Remove-Item "Env:$($_.Name)" }
   New-Item -ItemType Directory -Force -Path $env:PI_CODING_AGENT_DIR,"$root/work","$root/sessions" | Out-Null
   $skillDir = ConvertTo-Json -Compress "$repo/pstack-suite/generated/skills"
   Set-Content -Encoding utf8 "$env:PI_CODING_AGENT_DIR/config.yml" "skills:`n  customDirectories:`n    - $skillDir"
   $nativeArgs = @('--offline','--no-title','--no-tools','--no-extensions','--cwd',"$root/work",'--session-dir',"$root/sessions",'--model','dock-gateway/dock-model','-e',"$repo/tests/harness-dock/fixtures/extension-root/provider.ts",'-e',"$repo/pstack-suite/omp.ts")
   Set-Location "$root/work"
   omp --version | Tee-Object "$root/omp-version.txt"
   omp @nativeArgs
   $LASTEXITCODE | Set-Content "$root/first-exit.txt"
   ```

3. 新会话在输入首轮之前应显示 `◈ Poteto mode`。发一条普通消息。输入 `/poteto-mode`，记录通知 `Poteto mode disabled` 和标记消失。再切换，记录 `Poteto mode enabled` 和标记返回。再切到关闭，发一条普通消息，空输入时用 `Ctrl+D` 正常退出。对照前后截图和通知，不用模型回答判断开关。
4. 仍在第二个终端。复制唯一会话的原生 JSONL 后，启动独立进程并恢复原文件：

   ```powershell
   $sessions = @(Get-ChildItem "$root/sessions" -Recurse -Filter '*.jsonl' -File)
   if ($sessions.Count -ne 1) { throw '隔离目录必须正好有一个原生会话' }
   $session = $sessions[0].FullName
   Copy-Item $session "$root/before-resume.jsonl"
   omp @nativeArgs --resume $session
   $LASTEXITCODE | Set-Content "$root/resume-exit.txt"
   Copy-Item $session "$root/after-resume.jsonl"
   ```

5. 恢复后首条输入前后均应没有 `◈ Poteto mode`，且早先的消息仍可见。发一条新消息后正常退出。停止第一个终端的 provider（`Ctrl+C`）。保留截图、两份 JSONL、两次退出状态、`home/.omp/logs/` 下的 OMP 原生日志及本地请求。若未生成某个日志文件，记录该事实，不用 RPC 记录冒充 TUI 观察。不要上传 `/record` 或使用生产配置。H1 只有操作者回传并确认实际显示后才通过。

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
