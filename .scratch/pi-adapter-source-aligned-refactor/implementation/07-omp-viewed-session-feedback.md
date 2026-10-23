# 07: OMP Marker area、反馈与可选 Viewed-session 路径迁移

**What to build:** OMP extension 的 Marker area、Extension feedback 与 Viewed session 投影保持既有输出和交互语义；可选 Viewed-session 契约存在与缺失时分别维持原有行为，并正确识别为原生契约变体。

**Delivers:** P7（OMP 自动化与真实运行覆盖）；P15；P10、P13、P14（OMP UI／投影路径的适用覆盖项）

**Test owner for:** P7 的 OMP 输出／身份／投影／有无 UI 用例；P10、P13、P14 的 OMP UI 路径独立用例。跨路径组合用例及 H1 交接由 09 拥有，H1 结论由用户确认。

**Blocked by:** 01: 固化迁移清单与重构前验证基线。

**Status:** ready-for-agent

## 边界与覆盖

遵循本 feature 的 spec／contract 与 01 分配，经 S1／S2 观察。使用既有 Session 身份和 Owner 契约，不等待其内部目录迁移。可选补丁是 native variant，不是第三方 provider；不安装、实现或修改宿主补丁。

- [ ] 按实际消费的 OMP 原生 UI／Viewed-session 契约归置完整映射，不跟随最终 TUI 执行位置机械镜像，不为对称建立第三方分组。
- [ ] 经公开 assembly 自动验证 Marker area 输出、会话身份、有效 State 投影、反馈严重级别及有／无 UI 分支，保持输出渠道和模型上下文隔离。
- [ ] 用可控契约输入分别验证 Viewed-session outlet 存在及缺失；覆盖既有查看切换和目标身份不可用的投影规则，不能用名称伪造身份或把 Viewed session 当作 Owner。
- [ ] 验证本路径适用的多 binding 隔离、既有错误传播、释放后订阅及迟到回调停止，另一有效 binding 的投影继续工作。不新增不存在的重试、等待或回退机制。
- [ ] 迁移相关调用方和类型，保持共享 Marker area 与资源生命周期，删除本职责旧实现和转发路径并更新直接导航。
- [ ] 执行当前环境适用的真实 OMP 场景；真实运行只声明实际存在的分支。没有补丁环境时明确记录接通缺口，受控双分支检查仍须完成，不把替身当作真实补丁接通证据。
- [ ] 准备环境／版本、重构前后输出、可重复操作步骤、自动检查结果和已知差异，交给 09 汇总 H1；用户确认前实际日常 TUI 体验保持未验证。

## 验证与交接

迭代运行受影响测试及 TypeScript 类型检查；完成时运行拥有分区、受影响消费方和适用真实 dock／smoke。断言来源于独立预期和既有契约，不从实现重算。记录命令、退出状态、源／环境及限制。H1 只覆盖实际可用环境，不替代身份、状态、输出和补丁分支的自动验证，也不阻塞其他自动工作。跨行为入口的同一组合用例唯一归 09。
