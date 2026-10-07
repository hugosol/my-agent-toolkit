# 22: M 层真实 OMP × omp-bot 集成验收执行

**What to build:** 用户在真实 OMP 与运行中的 omp-bot 面板上按观察清单执行端到端验收：接入/重注册/状态/心跳/失联/切会话/恢复 + 多会话隔离 + 与 codebase-tools 共存 + 新旧装载互斥 + 配置切换。

**Delivers:** P46

**Blocked by:** 21

**Status:** ready-for-human

- [ ] 前置成立：源基线冻结记录在案、面板运行中且 `listen_addr` 与 `config.yaml` 的 endpoint 一致、`bun run test` 全绿、explicit-only 装载
- [ ] 按清单逐步执行并记录每步观察结果（截图/日志）：面板就绪、接入成功、幂等重注册、轮次结束、兜底终态、主动离线、杀进程 30–35s、面板失联 auto-disarm、守卫（no-UI / 未知参数）
- [ ] 兜底终态（abort、无 assistant）在真实会话中确认不卡「工作中」
- [ ] 杀进程后行保留并 30–35s 转「已离线」；面板失联触发 auto-disarm 且不自动重连
- [ ] 多会话隔离；与 codebase-tools 共存（两 marker 同区按 id 排序、`codeBaseTools enabled/disabled` 不变）
- [ ] 结果记入 run record；未通过项与差异逐条登记交用户判断，不做自动裁决

**来源:** contract P46；spec §12 M 层、故事 84/88/96；lighthouse 06 §6
