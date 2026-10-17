# 07: 观察按事件去重，展示合并采用最新值

**What to build:** 会话采集和观察发布按承诺事件发生，相同读数不重复发布；静止或流式响应期间不新增持续轮询或逐 token 流量。多会话、多字段的同批可合并观察更新及时采用到内存，并以合并重绘呈现各自最新值。

**Delivers:** P14, P15

**Blocked by:** 04 — detail 展示未提交会话、嵌套后代与续跑身份。

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P14、P15 全部 coverage 与测试。01–04 的正常交付证据不是本票通信频率与绘制成本验收的替代。

- [ ] 固定事件序列和独立给定重复值下，记录实际发布／通知，相同读数不重复发布；启动快照与有效重连仍满足其当前观察语义。
- [ ] 在静止窗口和实际流式响应中记录通知，证明没有新增持续轮询、逐 token 发布或运行耗时持续跳动，不从最终截图推断通信频率。
- [ ] 受控交付多个会话、多个字段更新，各最新值均保留，且存在可观测的合并重绘，不要求每条消息独立绘制。
- [ ] 合并只影响展示请求，不丢弃本地影响结算的生命周期事实，不延后内存采用直至绘制时才处理。
- [ ] 在实际终端观察最新结果并测量通知与绘制次数／成本，分开记录采集、通信和绘制；不宣称未经测量的零开销或最优效率。
- [ ] 按仓库测试规范执行受控事件与合并边界测试、所属分区和展示消费者，TypeScript 变化执行 typecheck；取得实际进程与终端证据并标注环境。

---

## 实现与证据（本票据分支）

- 实现：`extensions/model-cost/shared-logic/presentation/coalesced-redraw.ts`（display 的合并重绘）+
  `runtime.ts` 的观察两通道改走它（结算与 provider 发布路径不变），并在 `cleanup` 释放。
- 证据：见 [evidence/07-event-driven-coalesced-display-evidence-2026-10-17.md](evidence/07-event-driven-coalesced-display-evidence-2026-10-17.md)，
  运行日志见 `evidence/logs/07-dock-normalized.log`、`07-pi-subagent-smoke-background.log`、`07-pi-tui-acceptance.log`。
- 摘要：`bun run typecheck` exit 0；`bun test tests/model-cost` 491 pass / 0 fail；`bun test tests/framework`
  555 pass / 0 fail；归一冻结文件 + `OMP_BOT_BINARY` 下 `bun test tests/harness-dock` 107 pass / 0 fail；
  真机 pi 1.3.0 后台 smoke 10/10；真终端 pi TUI 捕获 34 ok / 1 failed（脚本自钉 `pi 1.2.0` 的既有环境不符）。
  未验证项（POSIX、控制台设备 smoke、单帧成本）在该证据文件末尾标注。

