---
status: accepted
---

# connect-bot 的面板命名随产品改为 herdr-bot

## 背景

面板产品由 `omp-bot` 原地改名为 `herdr-bot`（见 herdr-bot 仓库的
`docs/adr/0010-rename-project-to-herdr-bot.md`）。本仓库的 connect-bot 扩展仍以
`/connect-bot` 注册会话，生产代码只依赖 `config.yaml` 中的 loopback 端点和固定的
`/api/sessions/events` 协议；真正与产品名耦合的是面向操作者的文案，以及唯一直接启动面板进程的
测试支持代码。

这里有一个真实的取舍：保留旧测试变量与旧 sibling 路径可以减少改动，但会让本仓库同时使用两套
产品词汇，并让默认的 interop 路径继续指向一个已不存在的目录；硬切换则以放弃旧名兼容为代价，
换取单一词汇和一个可验证的默认路径。

## 决定

- 面向操作者的文案把 `omp-bot` 改为 `herdr-bot`，保留“面板”一词和原有句式；测试中的逐字断言同步更新。
- 测试支持代码跟随产品命名：`tests/connect-bot/support/herdr-bot.ts`、`HerdrBotFrame` /
  `HerdrBotPanel`、`startHerdrBot`；默认二进制为 sibling checkout
  `../herdr-bot/backend/target/release/herdr-bot(.exe)`，覆盖变量为 `HERDR_BOT_BINARY`，
  运行期生成的配置名为 `herdr-bot.toml`，临时目录前缀为 `herdr-bot-interop-`。
- 不保留 `OMP_BOT_BINARY` 或 `../omp-bot` 的回退：这是硬切换，旧变量名与旧路径都不再解析。
- 面板端点保持 `http://127.0.0.1:8787`；只把注释中的 mDNS 名从 `omp-bot.local` 改为
  `herdr-bot.local`。
- 扩展 ID `connect-bot`、命令 `/connect-bot`、`/api/sessions/events`、`{sessionId, kind, data?}`
  信封和 `zones.json` 不变。
- 明确叙述旧名或历史基线的文字保持原文：connect-bot README 的 H3b 迁移记录与 `.scratch/`
  下的历史证据不重写；当前指引与可复制命令使用新名。

## 后果

- 真实面板 interop 用例要求新路径下的 `herdr-bot.exe`，或用 `HERDR_BOT_BINARY` 指定；
  否则 `bun test tests/connect-bot` 会以环境前置条件失败，而不是产品失败。
- 旧 `OMP_BOT_BINARY` 不再生效；依赖旧名的记录只作为历史证据，不再作为当前操作指引。
- 面板协议与扩展持久化没有迁移：已部署的发现入口、`{enabled}` 状态和面板会话表继续工作。
