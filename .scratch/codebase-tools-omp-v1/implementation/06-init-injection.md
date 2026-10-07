# 06: init 注入槽位

**What to build:** on 之后的首个启用轮恰好注入一条 init：隐藏（`display:false`）、持久化为 `custom_message`、尾部追加、`attribution:"agent"`，身份为 `codebase-tools:init`。贡献决策是「持久化 State + 当前 branch 内容」的纯函数：当前 branch 是否已有该槽位身份即 init 进度，不使用任何额外进度标志；钩子内不写 State、不推进进度。两个提示词资源各自按文本独立加载，文本取自 oracle、不改写；不自动探测/启用 MCP 或 LSP，也不按子代理工具裁剪。

**Delivers:** P18（首个启用轮恰好一条 init 部分）、P19、P21、P22、P37

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] on 后首个启用轮恰好一条 init，`display:false`、`attribution:"agent"`、尾部追加（B3）
- [ ] init 随轮落盘；resume 后历史重放仍含该消息，customType/可见性/归属/位置正确（B5）
- [ ] 进度按当前 branch 是否已有 `codebase-tools:init` 推导；不写 `initInjected`（C7）
- [ ] 历史保护成立：只追加，不重写/重排/删除既有条目，不加取消消息（C8）
- [ ] 一个用户轮只触发一次语义钩子；工具续轮与同一 run 内多模型请求不重触发（C6）
- [ ] 两个提示词资源独立按文本加载；不探测 MCP/LSP、不按子代理工具裁剪（B10、C11）
- [ ] 同一槽位的规则冲突已在票 03 显式报错；组合与优先级不在本版范围
