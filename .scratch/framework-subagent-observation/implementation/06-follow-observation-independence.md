# 06: State follow 与会话观察独立运行

**What to build:** 同进程和跨进程子会话均在语义使用时取得 Owner 当前权威 State，而非永久启动快照。观察与 follow 独立声明和管理，没有 follow 字段仍能观察；brief/detail 只是展示偏好，不建立或拆除观察来源。观察和 follow 都不赋予远端写 Owner State 的能力。

**Delivers:** P21, P22, P23

**Blocked by:** 04 — detail 展示未提交会话、嵌套后代与续跑身份。

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P21–P23 全部 coverage 与测试，复用现有 State 缺值默认与恢复政策，不增加新的 State 权威。

- [ ] 两种进程模式分别验证初始读取及 Owner 值从 true 改 false 后的后续语义读取；实际跨进程使用取得 false，不能把不可达时默认值计为成功读取。
- [ ] 一次语义处理内相关读取使用所取得的一致快照，不要求每个 getter 分别通信；同进程直接读取，跨进程复用 framework Local access。
- [ ] 读取及观察更新后 Owner 的独立给定值不被修改；错误方向、未声明操作及远端 State 写入被拒绝。
- [ ] 无 follow 字段扩展在实际进程中仍可完成登记与更新，观察启用不依赖 follow 字段存在。
- [ ] brief 期间更新后切 detail，实际表面显示最新读数；重复切换不重复来源、不停止采集、不重建观察连接。
- [ ] 按仓库测试规范覆盖 State 消费者、真实进程读取和实际展示切换，执行所属分区；TypeScript 变化执行 typecheck。记录读到权威值的证据与未验证限制。
