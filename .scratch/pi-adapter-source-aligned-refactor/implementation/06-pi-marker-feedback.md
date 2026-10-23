# 06: Pi Marker area 与反馈路径迁移

**What to build:** Pi extension 的 Marker area、Extension feedback 和既有 delivery-position 投影继续呈现正确输出、State 与会话身份；映射按实际使用的原生 UI 契约组织。

**Delivers:** P7（Pi 自动化与真实运行覆盖）；P10、P13、P14（Pi UI／投影路径的适用覆盖项）

**Test owner for:** P7 的 Pi 输出／身份／投影／有无 UI 用例；P10、P13、P14 的 Pi UI 路径独立用例。跨路径组合用例及 H1 交接由 09 拥有，H1 结论由用户确认。

**Blocked by:** 01: 固化迁移清单与重构前验证基线。

**Status:** ready-for-agent

## 边界与覆盖

遵循本 feature 的 spec／contract 与 01 分配，经 S1／S2 观察。使用既有 Session 身份和 Owner 契约，不因其内部迁移尚未完成而人为阻塞。只调整 adapter 映射，不改变 extension 业务输出或为 Pi 新增 Viewed-session outlet。

- [ ] 按实际消费的原生 UI 契约归置 Marker area 与反馈；不因最终 TUI 执行位置不同而建立错误来源导航，不创建转发层。
- [ ] 通过公开 assembly 验证 Marker area 输出、实际会话身份、有效 State 投影、反馈严重级别和有／无 UI 分支，保留既有输出渠道与模型上下文隔离。
- [ ] 保持现有 Viewed-session outlet 不可用时的 delivery-position 投影行为，不能凭显示名称推断 Owner 或创造身份。
- [ ] 验证本路径适用的多 binding 投影／输出隔离、既有错误传播、释放后订阅及迟到回调停止；另一有效 binding 的 UI 继续运行。不存在的等待或取消机制不新增。
- [ ] 迁移相关调用方和类型，保留共享 Marker area 与资源所有权，删除被替代实现及兼容转发，更新直接导航。
- [ ] 执行适用真实 Pi harness 场景并保存输出；记录环境／版本、重构前后输出、可重复操作步骤、自动检查结果及已知差异，交给 09 汇总 H1。
- [ ] 用户日常 TUI 的体验判断保持 human-led；自动输出检查和真实非交互运行不能冒充 H1 通过，H1 也不能替代底层自动检查。

## 验证与交接

迭代运行受影响测试及 TypeScript 类型检查；完成时运行拥有分区、受影响消费方和适用真实 dock／smoke。用独立字面量和既有消费契约断言输出，不从映射实现重算。记录命令、结果、源状态和验证限制。不要等待 H1 才完成可执行自动工作。UI 路径内的独立用例归本票；跨命令／生命周期／UI 的同一组合用例唯一归 09。
