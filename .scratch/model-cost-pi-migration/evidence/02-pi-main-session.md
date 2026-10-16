# 02 pi 基础主会话加载与保存闭环：本轮真实验证记录

本文件只存证据与限制；交付内容与验收归属见 [本票](implementation/02-pi-main-session.md)、[契约](../contract.md)与 [spec](../spec.md)。未执行正式安装/切换、未清理用户数据、未做付费调用。

## 1. 固定来源与环境

- pi：本机已安装的 `@earendil-works/pi-coding-agent@1.2.0`，驱动工件为
  `D:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`（经 `pi.cmd` shim 解析），
  子进程以 `node`（v24.18.0）运行。`pi --version` 报告 `1.2.0`。
- OMP：既有 `@oh-my-pi/pi-coding-agent@18.11.1`（本轮未改动 OMP 侧代码，也未安装新工件）。
- 工作树：`hyper/model-cost-pi-migration/02-pi-main-session-683308-411dc288ea83`（起点等于集成分支 `pi-adapter`，`be96759`）。
- 运行时：bun 1.4.2；依赖经 `bun install --frozen-lockfile` 装入（typescript 7.0.2 等 4 个包）。
- 隔离：每次运行一个临时 run root（agent state、session dir、work dir、capture dir、user home）；pi 显式
  `--mode rpc --no-extensions -e <单入口> --no-mcp`；`models.json` 把 `deepseek` 整个目录指向本机 capture endpoint，
  凭据为 dummy key；`PI_OFFLINE/PI_SKIP_VERSION_CHECK/PI_TELEMETRY` 固定。默认 agent state、正式配置与运行中的
  agent 均未被触碰，仓库文件未被运行写入。

## 2. 命令与结果

### `bun run typecheck`

exit 0（无输出）。

### `bun scripts/pi-model-cost-smoke.ts`（真实 pi 1.2.0，RPC + capture endpoint）

exit 0；`PI MODEL-COST SMOKE SUMMARY: pi 1.2.0 — 25 check(s) passed, none failed`，wall 8.0s，4 个隔离 run。
覆盖的可见行为：

- 发现与加载：pi 自身 loader 从 `entrypoints/pi/model-cost.ts` 加载入口并完成绑定（无 refused-binding 诊断）；
  初始化在首个模型请求之前完成 provider 查询（capture arrivals = `["balance","model","model"]`）。
- 记账与保存：两次 exchange 的 usage 各计一次（input 14 / cacheRead 6 / output 14），金额等于本脚本对维护数据
  off-peak flash 价（1 / 0.02 / 4 CNY per 1e6）的独立手算 `0.00007012` CNY，写入 `harnesses.pi.sessions[0].own.deepseek["deepseek-flash"]`；
  periodId/holiday 保持隔离基线所述。
- 新进程读回：第二个真实进程显示已加载周期的 Accrued（`¥0.0001`），并把自有会话记为第二条记录，未改写前一条。
- 未配置位置无写入：工作目录、user home 根、agent state 均无扩展文件。
- 命令：`/budget detail` 由 pi 命令路径处理（disposition `handled`，0 次 provider 请求），announce 详细形式，
  widget 切到 detail（树中出现 `deepseek / deepseek-flash` 行、无 Round 行），文档字节不变；未声明参数被框架路由拒绝。
- 适用 provider 功能：DeepSeek 余额查询由扩展自身发出并被回答，widget 显示 `💰 Balance: ¥110.00`。
- storageDir：绝对、相对（两个不同 cwd 解析到同一 root，且 cwd 无写入）、该字段 `~/` = `<user home>/.omp/cost-archive`
  （不是 `<user home>/cost-archive`）三种解释均由真实进程核对。
- 非法配置：`storageDir: ""` 时框架报告 `model-cost: configuration error (config)`，扩展未绘制、未查询、未写入任何文件，
  会话仍正常完成一次请求。

### `bun scripts/pi-codebase-tools-smoke.ts`（迁移后回归）

同一驱动迁移到 `tests/harness-dock/pi-session.ts` 后重跑：首个 phase 的既有检查全部通过；随后在
「the session exits cleanly when its input closes」上失败。**该失败在未改动的 HEAD 版本上逐字复现**（同一检查、
同一 `exit 9: Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`），是本机 pi/node 关闭路径的既有现象，
不是本次迁移引入；`git show HEAD:scripts/pi-codebase-tools-smoke.ts` 的临时副本跑出同样结果，副本已删除。

### `bun test tests/framework tests/model-cost`

731 pass / 0 fail，3591 expect() calls，58 files，56.1s（本票改动涉及的框架分区与 model-cost 分区）。

## 3. 未覆盖 / 未执行（如实记录）

- 未写针对 pi adapter 主会话映射的 hermetic 单测（tests/framework 下），也未新增 README/harness-support 文档说明：
  本轮以真实宿主路径为主证据，这部分留作后续补齐。
- 未运行 tests/harness-dock（OMP 真实宿主分区）与全仓 `bun run test`；OMP 生产代码本轮未改动，`framework/adapters/pi.ts`
  与新增文件不被 OMP 消费。
- TUI 真实终端可读性、season 边界定时重绘、子代理 execution 耗时未验证（分别属 P52/P45/P24 的归属；
  本票 pi 前端按 RPC 的行形式绘制，未建边界等待）。
- capture endpoint 的余额/usage 是本 fixture 自己的文书，不代表真实账户事实，也未做付费调用。
- 仅 Windows x64 与 pi 1.2.0；未推断 POSIX、其他版本或其他提供方。
