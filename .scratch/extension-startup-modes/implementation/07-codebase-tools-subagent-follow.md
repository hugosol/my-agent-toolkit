# 07: codebase-tools 子代理 follow 与真实 pi 子进程

**What to build:** 用户通过任一模式加载 codebase-tools 后，子代理继续 follow Owner 的当前 State，而非独立执行主会话启动策略。Owner 在启动后的改变仍能传递；未接通时既有默认读数不变。pi 的显式 childEntry 与入口装配保持一致，真实跨进程跟随能力不退化。

**Delivers:** P14。

**Blocked by:** 01: codebase-tools 双模式首次启动。

**Status:** ready-for-agent

依据：[已批准契约](../contract.md)、[Spec](../spec.md)。不依赖 connect-bot 或 codebase-tools 跨模式持久化票。

- [ ] 在支持的子代理接入范围内，两种入口模式均保持 follow Owner 语义，不增加子代理独立启动默认值或记忆策略。
- [ ] 通过公共装配 interface 受控改变 Owner 当前值，观察子代理实际贡献／marker 交付随之变化；覆盖开启与关闭方向，不仅核对首次读数。
- [ ] 未接通 Owner 接入时，维持既有默认读数，不把未知接入改成独立自动开启。
- [ ] 在真实 pi 子进程运行中证明跟随效果，显式 childEntry 与所选模式装配一致；childEntry 字符串相等、入口导入成功或模拟进程都不能代替运行证据。
- [ ] 保留既有子代理接入与必需等待语义，不为自动启动修改准入或新增生产调试接口；不扩大 harness/provider 支持范围。
- [ ] 使用隔离 Owner、子进程与临时状态，不操作用户会话；记录启动命令、实际贡献、进程结果及环境限制。真实依赖不可用时报告具体阻塞，不将未运行项标为通过。
- [ ] 完成受影响 follow／接入用例、所属分区和受影响消费者检查；TypeScript 变更执行类型检查与相关静态检查，并更新必要 childEntry／使用说明。遵守共享工作树运行协调规则。
