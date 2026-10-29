# collect lifecycle 历史运行样本

从 extensions/workflow-chat/README.md 迁入的单次开发记录，不是当前运行保证。

2026-10-29 验证样本（Windows x64、Bun 1.4.2、隔离 omp 18.5.0、真实 herdr-bot safe_shutdown_shell；下面毫秒均从该连接建立计，端口/身份每次重建）：

| 真实宿主操作 | 后端响应头 / 客户端 FIN / 后端 FIN | 仍未收到正文 | 后续真实报告 → 新 collect |
| --- | --- | --- | --- |
| `abort` | 1 / 3 / 3 ms | 0 字节 | `bc-1fecbf76e0d8` → `notification` |
| `new_session` 后恢复原 Session | 1 / 4 / 4 ms | 0 字节 | `bc-761020ce1e44` → `notification` |
| stdin 关闭、正常 shutdown 后重启恢复 | 1 / 5 / 5 ms | 0 字节 | `bc-de7d12662440` → `notification` |

该次 `abort` 的实际错误为 `cancelled / Interrupted by user`，shutdown 为 `cancelled / Session ended`；切换时宿主没有交付旧工具结果。三个场景均收到真实 200、未等到 30 秒期限，且新 collect 的 `pendingReports.A` 对应表中报告、A 仍 running。复核命令为 `bun test tests/harness-dock/manager-collect-lifecycle.test.ts`，不把这组时序当作性能承诺。
