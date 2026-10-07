# 15: 人工验收、真凭据送达与 cutover

**What to build:** 由人完成自动套件覆盖不到的盲区：在真实交互 TUI 亲自验收 codebase-tools 的可见行为（marker 渲染与生命周期、notify 文案、命令切换）；用 wizard 在隔离 agent dir 提供 openai-codex 凭据并完成层2 真实送达捕获（secret 不进上下文，不可得则记 unverified、不阻塞）；验收通过后执行永久 cutover（删除旧 codebase-tools + 配置加上 OMP 入口目录条目 + 重启）并做 cutover 冒烟；由维护者显式替换最终支持版本。

**Delivers:** P31（永久 cutover 与 cutover 冒烟部分）、P23（openai-codex 层2 真凭据送达部分）

**Blocked by:** 12、14

**Status:** ready-for-human

- [ ] 交互 TUI 确认：marker 出现/每启用轮重设/off 清除、两种 notify 文案、两次命令切换（H1）
- [ ] openai-codex 层2：真实往返 + 出站 role/order 捕获；凭据或捕获不可得则记 unverified，不阻塞、不自动认证（H2）
- [ ] cutover：删旧实现 + 配置加新入口目录条目 + 重启；cutover 后冒烟一次；失败则回退到原 git 修订（H3）
- [ ] 维护者显式替换单一支持版本，并同步更新支持记录（H4）
