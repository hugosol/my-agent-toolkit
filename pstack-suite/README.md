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
| Persona | 上游 `pstack/agents/` → `generated/persona-templates/`；pstack MIT | `poteto-agent` 和 `comment-sicko` 的原生文件由明确确认的套件绑定生成至 `generated/agents/`；无绑定时没有占位 persona。 |
| 脚本 | 上游技能内的 `scripts/`；pstack MIT | 可执行资产单独登记、保留相对路径，并说明运行依赖、写入与副作用；指令引用不代表脚本已随包提供。 |
| 资料 | 上游技能内 `references/`，或 `pstack/docs/`；pstack MIT | 随实际消费项登记。当前包括决策日志 TSV 模板与 TypeScript 模式参考。 |
| 必要外部技能 | Cursor Team Kit 1.2.0 的 `cursor-team-kit/skills/{deslop,control-cli,control-ui}/SKILL.md`；[单独的 MIT 授权](generated/licenses/cursor-team-kit.txt) | 仅交付这三个技能，不加载整个插件。使用原生 `/skill:deslop`、`/skill:control-cli`、`/skill:control-ui` 显式读取。 |

直接打开生成文件可阅读方法；文件存在不能证明任务调用、运行取证或其他工具机制已经接上。纯本地方法与需要后续资产的工作流分开；不在清单的专题见[待迁移说明](MIGRATION-BACKLOG.md)。

## OMP 持续模式

直接运行原生 pstack 会话时，显式加载 [`pstack-suite/omp.ts`](omp.ts)，并把绝对的 `pstack-suite/generated/skills` 路径加入 OMP 的 `skills.customDirectories`。普通 OMP 扩展目录不自动加载此入口。新进程首次打开没有保存值的会话时默认开启。输入 `/poteto-mode` 切换开关；开启时编辑器上方显示 `◈ Poteto mode`，关闭时移除该行。两种切换都给出提示，原生会话记录保留该值；退出后用 `omp --resume <会话文件>` 及相同的入口和配置恢复。

首次启用的请求带上[生成的工程规则](generated/skills/poteto-mode/SKILL.md)及绝对来源路径，后续启用轮次只添加简短提醒。关闭只停止新增贡献，不移除已有会话历史。`/skill:poteto-mode` 是原生单次技能调用，即使持续模式关闭也能显式读取正文，并且不会改开关。隐藏技能不会列在模型的默认技能目录中；可以使用明确的 `/skill:<name>` 或 `skill://<name>`。读取技能正文后，从原生读取结果给出的源文件位置解析配套相对路径；子代理的 kickoff 明确传递资源路径，不依赖父会话正文。

开关仅更新本地会话状态、提示贡献和界面。开启不会执行或授权合并、部署、对外业务操作；项目、宿主及外部系统的授权要求仍适用。这不是用来拦截后续模型操作的权限控制。

## 首次模型设置与更新

未绑定也可在新 OMP 会话中调用 [`/skill:setup-pstack`](generated/skills/setup-pstack/SKILL.md)。该技能读取实际模型清单并展示待确认的角色、席位与推理选项；不替使用者选默认绑定。以会话所用的 OMP 入口、相同模型配置 overlay 和 provider 扩展执行 `omp models --json`，保存目录输出为 `omp-models.json`。

确认提议前不写入包；取消用 `bun run pstack:setup -- --cancel`。确认后先停止所有使用这份包的 pstack 会话（也包括 setup 会话），在 toolkit 根目录运行：

```sh
bun run pstack:setup -- --confirm proposal.json --catalog omp-models.json
bun run pstack:check
```

`proposal.json` 是按角色名索引的 JSON；核心角色 `poteto-agent` 和 `comment-sicko` 必填。每条绑定选择一个 `model`（完整 `provider/model` 或 `inherit-parent`）和 `thinking`（模型支持的等级、不高于 `xhigh`，或保留模型默认值的 `default`）。`inherit-parent` 要求 `thinking: "inherit"`，原生 persona 显式使用 `@default`。

可按需加入 `swarm-worker-<seat>`、`arena-runner-<seat>`、`arena-judge-<seat>` 或 `interrogate-reviewer-<seat>`，例如 `arena-runner-first`。后缀用小写字母、数字与连字符；每项生成一个独立 persona，不接受模型数组。`arena-judge-<seat>` 的提议字段顺序即候选裁判优先级。若不配置席位，技能仍可读取，不会替用户选择模型或使用占位角色。

确认的配置保存在 `pstack-suite/models.local.json` 的 `roles` 字段；用提议文件与确认命令更新，不直接改已保存记录。`generated/roles.local.json` 提供已生成的绑定清单，`generated/agents/` 下的 Markdown 由 OMP 原生读取。这些文件与其本地所有权记录不提交 Git，不复制到全局或项目 OMP 配置。套件 `build` 只消费已确认的配置，`check` 校对两组交付字节与所有权。若文件发布失败，检查已报告的效果；修复阻塞后可用 `pstack:build` 根据已保存的绑定恢复交付。

重新发起会话后，以套件选中的 OMP 原生扩展目录 `pstack-suite/generated` 发现 persona；直接启动时同样可用 `omp -e /absolute/toolkit/pstack-suite/generated`。通过原生 `task` 的 `agent` 传递角色名，不传单次调用模型。执行者提交有证据的 scoped 工作；注释审查者报告发现，父会话编辑。后者只声明读取类 built-in，不构成 OS、MCP 或附加扩展工具沙箱。本流程不提供热重载或强制停用检测。

### 并行工作流

[Swarm](generated/skills/swarm/SKILL.md) 做分片、同题竞速或混合；[arena](generated/skills/arena/SKILL.md) 对独立候选评分、选基底、综合并验证；[interrogate](generated/skills/interrogate/SKILL.md) 逐条复跑对抗评审的发现。三者共用 [原生 task 派发说明](generated/skills/arena/SKILL.md#native-panel-dispatch)。面板 persona 共用执行正文；单次 native task 可并行运行多个独立席位，等待各自返回终态。每个可写候选需独占产物路径或工作树；使用原生隔离时应关闭自动应用，分别读回保留的 patch 或分支。不创建 herdr Map，也不把工作树当安全沙箱。

同一个 `-e …/pstack-suite/generated` 加载原生 task 的只读结果观察器。对已确认角色的终态结果，观察器追加 `pstack task facts`，区分配置的模型、原生有效选择器、实际模型身份、provider 路由、推理等级和已观察到的偏离；不改变任务或重新派发。没有可用实际值时报告未知。Provider 路由不一定等于模型厂商；只有以已知的实际模型和厂商资料核实后，才能计入跨厂商比较，不从席位名推断。模型效果、评分和综合质量不在机制验证范围内。

## 本地 PR 交付与观察

[打开 PR](generated/skills/poteto-mode/playbooks/opening-a-pr.md)只负责创建 ready PR；[Babysit](generated/skills/poteto-mode/playbooks/babysit.md)最多驱动到 merge-ready，不合并、不 retarget、不 rebase；[Shipping](generated/skills/poteto-mode/playbooks/shipping.md)在操作者给定的交付范围内，要求独立验证、从栈底连续落地并回读真实目标分支。开启模式不是交付授权，也不新增统一逐项确认。[Autopilot-full](generated/skills/poteto-mode/playbooks/autopilot-full.md)只合入获授权队列中通过验证的项；[Autopilot-stack](generated/skills/poteto-mode/playbooks/autopilot-stack.md)交到 verified 即止，不合并。[Autonomous run](generated/skills/poteto-mode/playbooks/autonomous-run.md)使用活跃会话中的有界等待和本地 task，不承诺定时唤醒或退出后续跑。现有项目、宿主和 forge 门禁照常生效。

GitHub watcher 使用已安装的 Bun、`gh` 和 Git（仅目标推断需要 Git）。从目标 checkout 执行；也可以用 `--owner`、`--repo` 和 `--pr`/`--stack-prs` 显式指定目标：

```text
bun "<absolute poteto-mode directory>/scripts/watch-pr/cli.ts" --pr 31 --status-only --pretty
bun "<absolute poteto-mode directory>/scripts/watch-pr/cli.ts" --queued-stack --stack-prs 31,32 --timeout 300
```

`--help` 列出所有选项。默认输出 JSON；轮询输出 NDJSON，`--pretty` 输出便于阅读的报告。`QUEUE` 是观察列表，不是 forge 入列成功；`queued` 是 GitHub 观察到的队列条目，`auto-merge-requested` 单独报告。`MERGED` 和 `COMPLETE` 给出已观察到的实际 base；合入父分支不代表已到 trunk。后续查询失败时，错误和此前观察到的合并会同时保留在输出中。watcher 的 GitHub 请求只读，不创建、回复、入队、fetch、推送、合并或删除；PR 写操作由相应 playbook 的独立工具完成。Origin 走各 playbook 的原生命令，不用 GitHub watcher。

Windows 机械检查：`bun run test:pstack --test-name-pattern='P38|P36 installed OMP reads Shipping'`。设置 `PSTACK_FORGE_EVIDENCE_DIR` 可保存命令、退出、forge 请求、消费到的状态文本及本次 Git/OMP 清理证据。受控 forge 响应不代表真实 GitHub 或 Origin 已验收，也不评价模型的 shipping 决策。

## 更新流程

[manifest.json](manifest.json) 记录上游仓库、固定提交和版本，以及每个源文件及其确切交付位置。上游授权保留在[交付许可证](generated/LICENSE)。[待迁移事项](MIGRATION-BACKLOG.md) 不属于当前资源清单。

1. 更换基线时，先用 `pstack:upstream` 对照新版 checkout。把选中的原始字节复制到 `upstream/`，保留相对路径并同步更新清单里的来源版本与资源列表。不要在快照上实施本地适配。
2. 在 `mappings/` 调整适配；用 `pstack:preview` 单独审阅这些变化。因上游改写而重定位锚点，与有意改变本地行为分开审阅。
3. **先停止使用同一包的 pstack 会话**，再运行 `pstack:build` 和 `pstack:check`。提交快照、清单、映射、生成文件及生成所有权记录的对应改动，然后新发起会话。本包不提供热加载、跨进程检测或并发发布；未更新时正常并行使用不受限制。

清单每项的 `source` 默认相对于 `upstream/`，`output` 相对于 `generated/`，可选 `mapping` 相对于 `mappings/`。`origin: "runtime"` 标记由 toolkit 维护的运行时代码，`source` 相对于 `runtime/`；不应用映射，也不计入 `pstack:upstream` 的固定快照比较。路径用 `/`，保留确切大小写。`kind: "text"` 声明 UTF-8 文本，只将 CRLF 转成 LF，原有 BOM、孤立 CR 和文件末尾换行保持原状；`kind: "binary"` 逐字节复制，不允许映射。Git 检出也不对快照或交付文件自动换行转换。

### 一项操作对应一个行为

参考 [in-your-own-words.json](mappings/in-your-own-words.json)：只把隐藏技能的手工调用改为 OMP 原生 `/skill:in-your-own-words`，不改变隐藏标记或方法正文。

- `name` 是映射文件内唯一且稳定的小写连字符名称；`reason` 说明这项独立改动的目的。
- `anchor` 必须在规范化的上游文本中恰好出现一次。可选 `find` 将实际编辑范围缩小到锚点内同样恰好出现一次的片段；不指定则替换整个锚点。`replace` 是新文本，可为空表示删除。需要插入时，可将小片段替换为含原片段及新增内容的文本。映射内以 LF 写多行锚点与替换。
- 操作都匹配原始快照，不匹配其他操作的输出。锚点上下文可以重叠，但实际编辑范围不能重叠。遇到缺失、歧义或冲突会按操作名失败，不会选第一个匹配或猜测。

### 所有权与恢复

当前清单和上次生成的 [generated-ownership.json](generated-ownership.json) 一起确定写入范围。生成文件不要手改：已登记且仍选中的文件会被重新生成；未登记的同名文件会阻止构建，不会被覆盖。需要改名且只改变大小写时，先在一次构建中移除旧路径，再加入新路径。

清理只删除不再选中、且内容与登记摘要一致的单个普通文件。已改写的过期文件与替换成目录或链接的过期路径会保留并解除登记。构建不会跟随目录链接或 junction，也不会递归删除目录、遍历未知文件或清理用户证据。将需要保留的用户文件放在清单之外。当诊断报告所有权记录无法更新时，先对照已报告的文件效果和实际字节；保留不确定归属的文件，再把阻塞路径移出交付位置后重建，不要删除整个生成目录。

## 验证

`bun run test:pstack` 是 pstack 特性的测试分区，包含隔离文件系统上的维护命令及已安装 OMP 对真实适配样例的原生读取。OMP 从现有安装选择（或显式指定 `OMP_CLI`），不安装宿主，不使用生产会话或模型凭据。受控 provider 只证明实际发出的请求包含显式调用的技能正文，不评价模型行为。其他 pstack 自动用例放入同一分区；TypeScript 变更也运行 `bun run typecheck`。只检查确认与原生角色时，运行 `bun test tests/pstack/setup-personas.test.ts tests/pstack/setup-personas-omp-dock.test.ts`；设置 `PSTACK_SETUP_EVIDENCE_DIR` 可保留实际 OMP 调用、模型请求和退出记录。面板分区用 `bun run test:pstack --test-name-pattern="native task"`；设置 `PSTACK_PANEL_EVIDENCE_DIR` 可留存本次独占 Git 回读、真实原生 task 结果、实际模型请求及进程退出记录。

### Windows CLI 与 UI 驱动

Cursor Team Kit 固定提交中，这三个技能各只有一个 `SKILL.md`；没有独立脚本。`deslop` 保留原文，是基于 Git diff 的清理方法，不自行改代码。`control-cli` 和 `control-ui` 原文内嵌的是平台范例；交付版分别提供可直接复制运行的 Windows Bun 伪终端探针和 Python Playwright 探针。项目已有驱动时优先复用。

- [`control-cli`](generated/skills/control-cli/SKILL.md)：用 Bun 1.4.4 启动自有终端命令，等明确提示再输入一行，保留原始终端转录、子进程 PID 和退出结果。
- [`control-ui`](generated/skills/control-ui/SKILL.md)：需要已有的 Chromium（Chrome 或 Edge）以及安装了 Playwright 的 Python。连接测试专用的 loopback 调试端口和新 profile，以 URL 和页面根节点定位目标，执行一次真实点击，记录前后截图和可访问性转录。

仅跑本分区：`bun run test:pstack -- -t 'external drivers'`。可用 `PSTACK_CHROMIUM` 和 `PSTACK_PYTHON` 指定已安装的可执行文件，用 `PSTACK_EXTERNAL_DRIVERS_EVIDENCE_DIR` 保留原始结果和截图。测试不会安装宿主或浏览器，不接触用户现有的浏览器、会话或凭据。找不到依赖或目标时失败；不会将不同页面当成成功目标。

### 视频汇报

在 OMP 中显式调用 [`/skill:ketchup-video`](generated/skills/ketchup-video/SKILL.md)。它沿用 Ketchup 的待决事项写法，以真实的静音横向幻灯片视频替代进展摘要。字幕烧录在画面下方的固定条带中；嵌入前检查真实解码帧、字幕位置和每页停留时间。渲染或解码失败时，说明失败并仅列出待决事项，不把文本方案当视频。

固定上游的 `ketchup-video` 目录只包含技能正文，不附渲染器、辅助脚本或字体。生成的技能附有可执行的 FFmpeg 示例：在仓库外的自有工作目录提供同尺寸 PNG 幻灯片和 `captions.ass`，使用已有的 `ffmpeg`（带 `xfade`、`ass`/libass 和 `libx264`）、`ffprobe` 及可用字体。不会安装依赖或覆盖已有的 `report.mp4`。保留核验过的视频、字幕源及必要证据，仅清理自己创建的临时资源。

本分区用 `bun run test:pstack --test-name-pattern=P42`。测试通过已安装的 OMP 显式读取方法并执行其渲染命令，用 FFprobe 读取元信息，再解码检查两页画面、停留、过渡及条带内不同的烧录字幕。Windows 验收还核对所属进程退出和临时目录清理。缺少工具、产物或可解码画面会失败。设定 `PSTACK_VIDEO_EVIDENCE_DIR` 为本次独占证据目录，可同时保留原生请求、进程记录、字幕源、MP4 及取样帧；受控 provider 不评价模型编排或视频叙事质量。

### 项目验证与工程核查

| 要做什么 | OMP 入口 |
| --- | --- |
| 创建项目行为验证指引和 feature map | [`/skill:create-verification-skill`](generated/skills/create-verification-skill/SKILL.md) |
| 逐项核查行为、修复指引或驱动漂移 | [`/skill:maintain-verification-skill`](generated/skills/maintain-verification-skill/SKILL.md) |
| 选择性质及工具、建立可失败的形式检查 | [`/skill:create-formal-verification-skill`](generated/skills/create-formal-verification-skill/SKILL.md) |
| 检查模型与代码同步，区分漂移和缺陷 | [`/skill:maintain-formal-verification-skill`](generated/skills/maintain-formal-verification-skill/SKILL.md) |
| 确立失败回归、证明影响面、审查测量口径 | [`/skill:tdd`](generated/skills/tdd/SKILL.md)、[`/skill:blast-radius`](generated/skills/blast-radius/SKILL.md)、[`/skill:benchmark-checklist`](generated/skills/benchmark-checklist/SKILL.md)及[数字核查原则](generated/skills/principle-explain-the-number/SKILL.md) |

新项目产物保存在项目目录，例如 `verification/verify-<app>/SKILL.md`。交接时提供绝对路径，在 OMP 中显式 `read`；项目文件不会自动加入 Suite 默认技能集合。创建指引要求实际执行自己的步骤、捕获证据并清理自有资源；维护时不得以重写文档掩盖产品缺陷。

**包内资产与运行前提：**这些创建、维护和核查技能的上游目录仅交付 Markdown（包括 [Notes feature map 示例](generated/skills/create-verification-skill/references/feature-map-example/README.md)），没有捆绑生成器、验证驱动或基准脚本。示例中的 Notes 应用、`control-notes` 和 `notes` 不随包交付。行为验证使用目标项目的实际启动命令、测试数据和 UI/CLI/API 驱动；宽影响面复核若用 arena，需要其配置完毕的工作流及角色。TDD 与性能核查使用项目现有测试、测量和分析工具。形式验证使用目标项目明确选定的验证器；TLA+ 的可执行套件资产与外部 Bun、Java、TLC 前提见[下节](#windows-statechart)。有引用不等于已执行。

本分区使用 `bun run test:pstack --test-name-pattern=P34`；设定 `PSTACK_VERIFICATION_EVIDENCE_DIR` 为本次独占证据位置可保留原生 OMP 读取的请求、事件、退出和清理记录。测试不评价模型生成的验证方案或自主执行质量。

### 决策日志、worktree 审计与交接

运行下面的命令需要 Bash（Windows 用 Git for Windows 自带的 Git Bash，不是 WSL）；审计还需要支持 `git worktree list --porcelain -z` 的 Git，以及 `du` 和支持 `sort -h` 的 coreutils。用工作区自有的日志路径和要审计的仓库；下面从 toolkit 根执行。

```bash
bash pstack-suite/generated/skills/show-me-your-work/scripts/log.sh \
  "C:/owned run/audit/decisions.tsv" review "Keep the change" "Checks passed" "tests/report.txt" done
bash pstack-suite/generated/skills/poteto-mode/scripts/worktree-audit.sh \
  --base origin/main --no-pr "C:/owned repo"
```

- [决策日志](generated/skills/show-me-your-work/SKILL.md)使用随包的 [TSV 模板](generated/skills/show-me-your-work/references/decision-log-template.tsv)。辅助命令需要六个参数，创建缺失父目录，为新建或空文件追加表头，再追加一行 UTC 记录。单元格内 Tab、CR 和 LF 各替换为一个空格；前导 `=`, `+`, `-`, `@` 加单引号。已有行不改写；同一日志使用一个写入者。
- [worktree 审计](generated/skills/poteto-mode/playbooks/worktree-cleanup.md)输出按大小排序的 TSV，排除主 worktree。`--base` 指定合入比较基线；不提供时尝试 `origin/HEAD` 所指分支、`origin/main`、`origin/master`。`origin/<branch>` 会尝试 fetch，可能更新远端跟踪 ref、`FETCH_HEAD` 和 Git 对象；即使之后返回错误，之前的效果也不会回滚。fetch 失败但本地 ref 可用时输出陈旧警告并继续。若要避免这一步，传已核实的本地 ref 或 SHA。默认可用 `jq` 和已授权的 `origin` 或 `gh` 查询 PR；`--no-pr` 跳过查询，不等于禁止 Git fetch。`PR` 为 `-` 不能证明没有 PR；`LAST_CHAT` 为 `-` 不代表没有活动会话。用法错误退出 `2`，无法完成审计退出 `1`，出错时表格可能不完整。辅助命令不删除 worktree、分支或证据；分类仅作建议。
- [安全暂停](generated/skills/poteto-mode/playbooks/pause-safely.md)仅按明确请求，在安全边界保存本次工作及可明确读取的续接笔记。[本地续接](generated/skills/poteto-mode/playbooks/session-pickup.md)使用当前上下文与明确提供的笔记、日志、WIP 或分支，不自动读取其他会话历史或云 agent。

本分区使用 `bun run test:pstack --test-name-pattern=logs-audit`（包含 P36 的日志／审计代码分区）。Windows 可用 `PSTACK_GIT_BASH` 显式选择现有的 `Git/bin/bash.exe`。设置 `PSTACK_LOGS_AUDIT_EVIDENCE_DIR` 保留日志字节、Git refs、进程退出与原生 OMP 读取记录。测试不执行删除或评价模型选择暂停点的能力。

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
