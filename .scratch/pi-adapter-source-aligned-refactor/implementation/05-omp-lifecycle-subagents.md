# 05: OMP Session 生命周期与原生子会话接入迁移

**What to build:** OMP 的主会话和实际子会话继续交付正确的 Session、Turn、Round 与相关观察，保留 Parent agent、Owner、状态隔离和释放行为；来源导航体现 OMP 原生机制而非 Pi 第三方协议的镜像。

**Delivers:** P5、P12（OMP）；P10、P13、P14（OMP 生命周期／原生子会话接入路径）

**Test owner for:** P5、P12 的 OMP 用例；P10、P13、P14 的 OMP 生命周期／原生子会话接入独立用例。跨路径组合用例由 09 拥有。

**Blocked by:** 01: 固化迁移清单与重构前验证基线。

**Status:** in-progress

## 边界与覆盖

以本 feature 的 spec／contract 和 01 的分配为准，经 S1／S2 验证。不承接 State 编码、命令、prompt 或 UI 内部迁移；依赖其既有契约而非等待其搬迁。

- [ ] 按实际适配的 OMP 原生契约归置完整生命周期和原生 registry 关系读取；不创建空 thirdParty／mixture，不把多个原生事件自动归为跨来源组合。
- [ ] 以独立事件事实、身份和顺序预期验证 Session／Turn／Round 与相关观察的开始、结束、转移、取消和终止失败；不要求 Pi 与 OMP 原生事件相等。
- [ ] 保持 Parent agent、Session ancestry、Owner、Session observation 的区别及实际身份，主子会话不得错误继承或合并。
- [ ] 经公开 assembly 验证多 extension／binding、绑定失败后再绑定、主子会话和 Owner 隔离；不读取私有状态代替消费结果。
- [ ] 验证错误、取消、终止及适用超时／等待规则原样传播；不新增重试、延长等待或吞掉失败。
- [ ] 验证释放后本路径应停止的交付、回调和外部效果停止，另一个有效 binding 保持运行；不以释放函数被调用替代效果证明。
- [ ] 运行真实 OMP 子会话接入，证明适用 child-extension 加载要求及可观察能力保持不变，并通过可控条件验证拒绝路径；不能用注册成功冒充加载成功。
- [ ] 保留共享状态和资源生命周期，迁移实际调用方、相关类型和加载支持；删除本职责旧实现和转发路径，更新直接导航，port assembly 不新增语义翻译阶段。

## 验证与交接

迭代运行受影响测试及 TypeScript 类型检查；完成时运行拥有分区、受影响消费方、适用真实 OMP dock／smoke 和终止场景。保留消费可见断言，不为搬迁削弱场景。记录命令、退出状态、源／环境和验证限制；替身、真实加载及结构供给分别记录。现存语义缺陷单独报告并请求范围决策，不顺手修复。共享 assembly 修改按 owner 和执行窗口协调，不添加仅由文件冲突导致的逻辑阻塞。
