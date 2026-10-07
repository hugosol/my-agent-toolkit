# 07: reminder 槽位与重入幂等

**What to build:** 首个启用轮之后每个启用轮恰好注入一条 reminder（身份 `codebase-tools:reminder`），不被 init 进度干扰；每个启用轮对每个槽位至多一条贡献。同一启用轮内语义钩子重入不重复注入；pre-commit 取消后 branch 无 init 则重新 init；`/tree` 回溯后按 branch 事实回到应有的注入。off 后再启用轮无注入，历史与 init 进度不被清除，重新打开走 reminder。

**Delivers:** P18（reminder 与「每启用轮至多一条槽位贡献」部分）、P20

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] 之后每个启用轮恰好一条 reminder，不被 init 进度干扰（B4）
- [ ] 同一启用轮钩子重入不重复注入；pre-commit 取消后 branch 无 init 则重新 init（B11）
- [ ] off 后再启用轮无注入；历史与 init 进度不被清除；重新 on 走 reminder（B7）
- [ ] 贡献决策不依赖宿主注册顺序，只依赖持久化 State 与当前 branch 内容
