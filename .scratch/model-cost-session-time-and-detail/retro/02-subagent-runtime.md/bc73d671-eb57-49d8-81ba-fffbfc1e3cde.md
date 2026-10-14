# Retro — 02-subagent-runtime.md

## Provenance

```json
{
  "feature": "model-cost-session-time-and-detail",
  "ticket": "02-subagent-runtime.md",
  "run_id": "bc73d671-eb57-49d8-81ba-fffbfc1e3cde",
  "agent": "tdd",
  "agent_id": "02-subagent-runtimemd-85662e00-9cfa-44f6-b506-db",
  "session_id": "01a139bf-f304-70c9-ba18-d3782446ab09",
  "session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-14T08-54-26-495Z_01a1399e-bbbf-7756-b9c1-b208b4848d5c\\02-subagent-runtimemd-85662e00-9cfa-44f6-b506-db.jsonl",
  "parent_session_id": "01a1399e-bbbf-7756-b9c1-b208b4848d5c",
  "parent_session_file": "C:\\Users\\hugos\\.omp\\agent\\sessions\\--E--Developer-myhub-my-agent-toolkit--\\2026-10-14T08-54-26-495Z_01a1399e-bbbf-7756-b9c1-b208b4848d5c.jsonl",
  "workspace": "E:\\Developer\\myhub\\my-agent-toolkit",
  "execution_cwd": "C:\\Users\\hugos\\AppData\\Local\\Temp\\hyper-ticket-1Earge",
  "tdd_status": "completed",
  "started_at": "2026-10-14T09:30:43.178Z",
  "tdd_finished_at": "2026-10-14T09:56:37.430Z",
  "retro_finished_at": "2026-10-14T09:58:04.300Z"
}
```

## Retrospective

# Ticket 02（子代理运行耗时）TDD 实现轮复盘

范围：本节只复盘本 ticket 的 TDD 实现轮（run_id `bc73d671-eb57-49d8-81ba-fffbfc1e3cde`，session `01a139bf`，session 日志 `02-subagent-runtimemd-85662e00-…jsonl` 已核对，502 行，含本轮全部 bash 调用）。父 session、其他 ticket、retro 报告均不在范围内。以下"事实"均来自本轮工具输出或仓库现文件；"推断"已标注；无法确认的记为未验证，不做补造。

## 1. 仓库没有 `.gitattributes`，而机器 `core.autocrlf=true`：真实宿主 dock 套件在任意新 worktree 不可运行（最高严重度）

**事实**
- `git config core.autocrlf` = `true`；仓库根无 `.gitattributes`（均已实际检查）。
- 因此 `bun.lock` 在 worktree 落盘为 CRLF：`sha256sum bun.lock` = `7f5c82e6…`，而 `tr -d '\r' < bun.lock | sha256sum` = `9e9f4833eae6956d215f4a3e50a601791fcab43a828d5b263fa3b2e848415da9`，正是 `framework/docs/harness-baseline.json` 记录值。`tests/harness-dock/baseline.test.ts`（"records the lockfiles…"、"run artifact stays byte-identical…"）与 `tests/harness-dock/session-driver.test.ts`（"verifyLockfile"）直接比较该值，在本 worktree 必然失败（post-merge 全 dock 分区 79 pass / 2 fail，2 个失败即此）。
- `host-patches/omp-18.5.0-*/patch.diff` 同为 CRLF，`ensurePatchArtifact` 按 `record.json` 冻结的 sha256 校验后拒绝：我把它们还原成 CRLF 后再跑 `tests/harness-dock/detail-tree.test.ts`，`beforeAll` 直接抛错、`0 pass / 1 fail`（本会话实测）。
- 因果链与本轮收益：上一轮实现（`9e427ef`/`89efc89`）自己的报告写明"host-patches/*.diff 被 autocrlf 转成 CRLF，dock 需要先 sed 归一化才能运行…完整 dock 分区未运行"。其新增的 `Run:` 字段已经破坏了 `tests/harness-dock/detail-tree.test.ts` 的 `childContext.endsWith(...)`（字段被追加后变成后缀），而只有 dock 分区的真实宿主用例能发现——本轮我跑该文件才暴露（先从 293/1 fail 定位，再修）。也就是说：一个环境问题直接导致"受影响的真实宿主消费者从未被跑过"，回归被提交进分支。
- 本轮为此付出：两次 `sed -i 's/\r$//' host-patches/**` 归一化、一次因还原 CRLF 而失败的 dock 运行、以及每次 dock 运行前都要记得归一化。peers 01/03 与本 ticket 的报告里同样带着这条 caveat（05 的记录提交还专门记了 dock 环境 caveat）。

**建议**
1. 在仓库根加 `.gitattributes`：最少 `bun.lock -text`、`host-patches/** -text`；更省事的是 `* text=auto eol=lf`。这样与机器/平台的 autocrlf 设置解耦，真实宿主 dock 套件在任何 worktree 可运行，`baseline.test.ts`/`session-driver.test.ts` 的记录字节断言也不再因检出行尾而失败。
2. 可选第二半：把 `baseline.test.ts`/`session-driver.test.ts` 里"环境前置条件不满足"的两类断言（检出行尾不忠实、oracle checkout 缺失——本轮还见过 `checkout path does not exist: …\Temp\my-omp-toolkit`）改为带原因的 skip，而不是 fail。仓库已有这种写法先例（`extensions/model-cost/README.md` 的"Ready-made skip"）。理由：环境前置条件伪装成契约失败，会训练后来的 agent 忽略 dock 分区的红灯——本次 5 个 dock 失败里有 3 个就是环境类。

## 2. 已有检查全部未接线：没有 CI、没有 hook、没有聚合脚本

**事实**
- 根目录无 `.github`、`.husky`、`.githooks`、`lefthook.yml`、`.pre-commit-config.yaml`。
- `package.json` 有 `typecheck`、`test`、`test:dock`、`test:framework`、`test:codebase-tools` 与若干 smoke/verify 脚本；devDependencies 只有 `@types/node`、`bun-types`、`typescript`，没有任何 linter（无 biome/eslint），也没有把 typecheck+test 串起来的 `check`。

**建议**
加一个聚合入口（如 `"check": "bun run typecheck && bun test"`，或对环境有外部依赖的套件做显式 env 开关/排除），并接到一个 CI job 或文档化的 pre-push hook。这是本仓库唯一能自动拦住"改了显示模块却没跑真实宿主消费者"的机制；它同时也是发现项 1 的兜底（`.gitattributes` 修复前 CI 至少会暴露 dock 不可跑）。

## 3. 真实宿主证据无法回看：`RunRoot` 无条件删除运行目录

**事实**
`tests/harness-dock/run-root.ts` 的 `RunRoot.dispose()` 直接 `rmSync(root, {recursive:true, force:true})`，没有保留开关；dock 用例在 `finally` 里统一 dispose，因此一次运行产生的消费文档、session JSONL、capture 目录运行后即消失。
后果（本轮实测）：要写出非空洞的真实宿主断言，必须知道真实宿主给我的数值。上一轮的断言是 `children.every(child => child.runtimeMs === undefined || child.runtimeMs > 0)`——**空输入也能通过**。我只能临时把断言改成 `expect(children.map(c => c.runtimeMs)).toEqual("reveal")`，跑一次让失败 diff 打印真实值（756 ms、284 ms），再改成严格断言。这是"为了取数而故意让测试失败"，属于可避免的取证方式。

**建议**
让 `createRunRoot`/`dispose()` 识别一个 env 开关（例如 `OMP_DOCK_KEEP_RUN=1`）：保留 run root 并打印路径。成本极低，且正好服务本迁移自己的要求（"observed tip 按运行记录进 migration run record"）——agent 需要能引用真实运行留下的字节，而不是引用被删掉的目录。

## 4. 把套件输出接进 `tail`/`grep` 会丢掉失败清单，代价是整轮重跑；`docs/agents/testing.md` 的现有条目需要收紧

**事实**
- `bun test tests/harness-dock 2>&1 | tail -60`：工具只保留最后 60 行，失败清单被截断（只看到 4/5 个失败名，且当时那轮还多出 3 个后来不复现的 baseline 失败）。为拿到完整失败名，我重跑了整段 174 s 的 dock 分区。
- `bun test tests/connect-bot 2>&1 | grep -B 12 "^\(fail\)" | head -80` 输出为空，而同一套件不加管道时报告 5 个失败（后确认全部是缺少 `omp-bot.exe` 的环境失败），又白跑 75 s。
- `docs/agents/testing.md` 已有"Save long-run output to a run-specific log so truncated terminal output does not require another suite run just to recover failures"，但对"不要把套件输出接进 tail/head/grep"没有说；而 harness 的行为是**不加管道时**完整输出保存在 artifact（`artifact://<id>`），加了管道后 artifact 里也只有被截断的副本。

**建议**
就地把该条目写成一句更锐的表述，而不是新增段落：跑分区时不接管道，让 harness 保留完整输出到 artifact，失败从 artifact 读；把对套件输出接 `tail`/`head`/`grep` 视为丢掉了本次运行。
（推断，非事实：那次 `grep | head` 返回空，很可能是管道提前关闭导致 bun 摘要/失败行未被写出；同一命令不加管道有输出。）

## 5. 单个手抄 schema 校验器是"每个加字段 ticket 的冲突汇聚点"

**事实**
`tests/harness-dock/model-cost-persistence.test.ts` 的 `SESSION_KEYS` + `readRecord`（"按 key 集精确比对批准 schema"）被本特性的三个 ticket 同时改：本票 `runtimeMs`、01 的 `span`、03 的 `startup`；01 与 03 都主动发消息提醒"同一文件同一处会有冲突，保持 additive 才不相交"。本票合并 05 时也在这两个测试文件上出现 10 个冲突块（另加 `detail-tree.test.ts` 一处）。

**建议**
把这个汇聚点写进该文件头部注释（和/或该特性的 ticket 模板）：`SESSION_KEYS` 与 `readRecord` 是**手工镜像批准 schema** 的地方，每个新增字段的 ticket 都必须改它们，可预期文本冲突，合并后要重新核对 key 集。**不要**改成从 `consumption-document.ts` 导入 key 集：这个校验器的价值就在于独立于实现读文档，改成共享声明会把独立性检查变成同义反复。

## 6. 覆盖项把"进程内规则"写进"跨进程场景"，会产生两种验收读法

**事实**
本票 P35 的措辞把两件事并进一句："实际多进程／文件协调场景下，独立 Session 成功提交不互相覆盖；同次执行被重复观察也不重复累计"。上一轮实现明确报告"跨进程去重不适用：去重为内存态，逐执行账本按契约不做"，即把它读成了进程内规则；合同/边界又禁止持久化逐执行身份。本轮我按"存储协调层的重复观察"补了一个真实子进程用例（同版本同值→`unchanged`；后一版本仍为 360000 而非 720000），但这条读出是推断出的折中，不是票据文字明确指定的。

**建议（流程/编写，不是代码）**
在 contract 的 Coverage 行里为每个 clause 标明被观察的 seam 与场景，或把这类混写拆成两行；否则实现者与验收者可以对同一行给出不同结论，且没有一条能被判定为"错"。

## 7. 次要：代码文件默认折叠导致额外的 range 重读（工具层面，推断）

**事实**：`read` 对代码文件默认只给声明/骨架并提示 `[…432ln elided…]`，测试体需要再按 `path:start-end` 二次读取（本轮多处如此）；本指令又要求"读超过 100 行源码前先看大纲"，两者叠加时一次"取全貌"实际要 2–3 次调用。
**建议**：若折叠提示能直接给出可复制的 range 链接（或允许 `read path:` 返回全文一次到位），可省下若干次往返。属 harness 工具层，非本仓库问题，故列最后。

---

**本轮未验证/无法确认**：dock 分区那 3 个"跑过一次失败、之后不复现"的 baseline 用例（anchor 可达、artifact 字节一致、oracle checkout）未能给出稳定解释——推断与"记录/制品在本 worktree 的物化时序"有关，未做进一步取证；`satisfies 工具 `grep -B … | head` 返回空的机制未验证。上述建议本轮一律未执行（`gitattributes`、`check` 脚本、`OMP_DOCK_KEEP_RUN`、文档与模板改动均未落地），仅作候选。
