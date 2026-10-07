# 11: 交付角色按 provider 路径记录为事实

**What to build:** 用真实出站捕获记录 custom 注入在每条 provider 路径上的实际序列化角色：主路径 `deepseek/deepseek-flash` 全量捕获；辅路径 `openai-codex/gpt-6-luna` 用本地 probe（`api="openai-codex-responses"`）捕获 OMP 序列化并标注 shape-only。角色只记录为验收事实、不作启用/拒绝门槛；未测路径标 unverified，其他 Agent 运行时的角色/权威语义保持未决。不得用 system prompt 改写或 user 消息静默替代来伪造角色，也不得框架级删除其他 Agent 运行时可能需要的角色能力。同时备好层2 真凭据送达所需的隔离 harness 与确切操作步骤（隔离 agent dir、`providers.openaiWebsockets="off"`、请求录制、`gpt-6-luna`）。

**Delivers:** P23（deepseek 真实捕获部分、openai-codex 层1 shape-only 部分）

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] deepseek 路径：真实捕获记录 custom 注入的出站角色/顺序/位置，作为事实记录（C9）
- [ ] openai-codex 路径：层1 本地 probe 捕获 OMP 序列化，明确标注 shape-only、不证明真实 provider 接受
- [ ] 角色不作启用/拒绝门槛；未测路径与未决 Agent 运行时分别标 unverified / 未决
- [ ] 层2 真凭据送达的隔离 harness 与 wizard 步骤备好（凭据由人提供，执行见票 14）
