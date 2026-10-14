# 07 集成同步轮：`session-ownership-tree` 3 例失败的环境级定位

**结论：失败与本需求代码无关，是当前机器环境下宿主自身的 judge 候选链状态造成的；本轮未能定位到确切的环境开关。**

## 现象

本轮（同步轮）在同一棵合并树（revision `e548e80`，与早前记录全绿的 `c7ad7e8` 只差票据 markdown 与运行日志）上重跑：

- `bun run test:dock` → 83 pass / 3 fail（`tests/harness-dock/session-ownership-tree.test.ts` 全部 3 例）。
- `bun run test` → 960 pass / 3 fail（同一批 3 例；其余 106 个文件全绿）。
- 失败断言全部是同一条：`expect(run.capture.requests()).toHaveLength(5|7)`，实际 11|13——每条用例恰好多 6 条请求（每个 task 子代理 3 条，共 2 个）。

## 证据链

1. **多出的 6 条请求体就是宿主自己的 auto-thinking 难度分类**（用 run-root 监视器在清理前抓取的 `captures/request-*.json`）：
   请求体为 2 条消息（system + user），user 为 `State: <solution_space>…Answer with exactly one of: low, medium, high, xhigh.`，
   出自 `@oh-my-pi/pi-coding-agent/src/auto-thinking/classifier.ts`（bundled `task` agent 的 frontmatter 是 `thinkingLevel: auto`，见 `src/task/agents.ts`）。
   子会话 JSONL 亦记录三条 `model_usage`，`purpose: "auto-thinking", role: "judge"`。
2. **宿主日志（本轮，用文件锁保留 run root 后读取）**：`judgment candidate failed candidate deepseek/deepseek-flash error: judgment "level": no option label in reply`——候选链里只有在线候选。
3. **对照：早前全绿 run 的残留 run root**（`%TEMP%\omp-dock-runtime-reload-SessCW`，2026-10-14 18:12）：
   同一位置日志为 `judgment candidate failed candidate typesafe/jev-latest status 451`——链首是 native（typesafe）候选，按 `judgment/index.ts` 的规则（首个 native 之后只保留 native）在线候选被丢弃，捕获端点因此只收到期望的 5 条。
   该 run 的 `agent-state/models.db` 有 `typesafe` provider 行；本轮 run 没有（只有 `factory-droid`）。
4. **与网络可达性无关**：本机直连 `https://api.typesafe.ai/v1/models` 现返回 451（经本机代理 `127.0.0.1:10808` 返回 200）；但绿 run 当天对同一 API 的 judge 调用同样返回 451、provider 仍已注册。
5. **环境级而非本票/本 worktree 级**：同一份测试文件内容（modulo CRLF）在**另一棵 parked worktree**（`hyper-ticket-NR12PO`，06 票分支，自己的 `.cache/omp-baseline`）单跑同一用例同样 11 vs 5 失败。
6. **env 探测（未改变结果）**：给测试进程加 `PI_PROXY`、`HTTPS_PROXY`+`HTTP_PROXY`+`NO_PROXY` 后仍失败（宿主 env 传递已用 `PI_PROXY_DEEPSEEK` 日志行证明可达宿主）；把 `TYPESAFE_BASE_URL` 指向本地 stub 后宿主完全没有发起 typesafe discovery——即该 provider 在本环境下根本未进入注册/候选链。

## 复现命令

```
bun test tests/harness-dock/session-ownership-tree.test.ts
```

日志：`evidence/07/runs/dock.log`（整批）、`dock-ownership-single.log`（隔离复跑）、`dock-ownership-probe*.log`（env 探测）。
