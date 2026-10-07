# 01: 固定基线与验收 harness

**What to build:** 让后续每一张票都能在固定、隔离、可重复的真实环境上验证。以隔离前缀精确安装 `@oh-my-pi/pi-coding-agent@18.5.0` 作为运行/验收产物，把修订锚点（本地 `oh-my-pi` checkout `@9348320`）、该安装产物与仓库 lockfile 记在同一处可核对的基线记录里。提供 harness：临时 `PI_CODING_AGENT_DIR` + `--no-extensions -e <OMP 入口目录>` 的受控会话驱动、会话 JSONL 读取、出站请求（SSE 全量 JSON）捕获、stderr 捕获。复用 `.scratch/codebase-tools-omp-v1/assets/03/` 的探针手法作为 prior art（RPC 驱动、本地捕获端点、provider 覆写），并清掉 `OMP_PROFILE`、`XDG_DATA_HOME`、外部 auth-broker 以避免解析偏移。

**Delivers:** P32

**enabling:** unblocks P29, P30, P31，以及所有需要真实 Agent 运行时路径的 promise（P3–P27、P33）

**Blocked by:** None（可立即开始）

**Status:** ready-for-agent

- [ ] 隔离安装的 18.5.0 能启动一次受控会话并正常退出；默认全局安装、正式配置与运行中 agent 全程未被触碰
- [ ] harness 能启动会话、执行扩展命令、读回会话 JSONL 条目、读回出站请求 JSON，失败时给出可诊断输出
- [ ] 修订锚点、运行/验收产物、lockfile 三者的对应关系有单一可核对记录（沿用 03 的逐字节对照结论，不重复推理）
- [ ] 所有运行一律使用临时 agent state 与隔离捕获目录，不写入默认环境
- [ ] 环境条件被记录为条件而非待办：Windows x64 + Bun 1.4.2、不构建 natives、不用本地 checkout 直跑完整会话
