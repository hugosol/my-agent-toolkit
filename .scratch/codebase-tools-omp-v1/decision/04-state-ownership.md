# 确定 State 归属、会话恢复与子代理实时跟随契约

Type: grilling
Labels: wayfinder:grilling
Status: open
Interaction: HITL
Parent: [首版语义扩展框架：codebase-tools 完整迁移与 OMP 适配](../map.md)
Blocked by: 01, 03

## Question

如何仅使用 OMP extension 可获得的身份和生命周期，建立正确的所属主会话关系，使激活值实时跟随、各会话 init 进度独立、持久化可逆且多主会话互不串扰？

必须明确：

- State 的拥有者标识、session 与 agent 身份关系、父链/嵌套子代理映射与注册清理；不能仅用 depth 或进程级全局开关推断 owner。
- 主会话切换、resume、分支/树切换时从何处恢复，哪些原行为保留；开关恢复如何传播给已存在的子代理。
- 子代理首次创建、退出/重建、单独恢复、owner 消失或暂不可用时的策略；子代理侧命令与写入权限。不得默认为整份 State 拷贝、创建时快照或共享写入。
- 当前值、持久化映射和 UI 读取之间的职责；State 更新/持久化失败时对命令反馈和后续读取的契约。不得增加破坏旧实现读取的通用存储封装。
- 在不同 owner 并存、开关 off/on 往返和恢复条件下的可观察不变量；独立 init 进度与指令贡献提交的具体接口交给贡献及接口票对齐。

已确定的范围与持久化原则见 [框架架构决策](../../../docs/adr/0002-semantic-extension-framework.md)；具体旧记录格式只引用 [原状态逻辑](../../../../my-omp-toolkit/extensions/codebase-tools/state.ts)。本票决定契约，不实现 owner 注册表或存储模块。
