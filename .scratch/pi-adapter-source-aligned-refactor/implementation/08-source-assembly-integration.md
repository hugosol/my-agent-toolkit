# 08: 完成来源组织、公开 assembly 与接入完整性收口

**What to build:** 维护者能从两个 harness 的实际 assembly 追踪映射的真实来源，消费方继续使用原公开类型和绑定方式；接入检查从真实供给得到原有结论，仓库只保留一套有效实现和一致导航。

**Delivers:** P1、P2、P3、P4、P16

**Blocked by:** 02: Pi 原生 State、命令、prompt 与模型供给路径迁移；03: OMP 原生 State、命令、prompt 与模型供给路径迁移；04: Pi Session 生命周期、第三方接入与跨来源组合迁移；05: OMP Session 生命周期与原生子会话接入迁移；06: Pi Marker area 与反馈路径迁移；07: OMP Marker area、反馈与可选 Viewed-session 路径迁移。

**Status:** ready-for-agent

## 边界与覆盖

以本 feature 的 spec／contract 为权威，经 R1、S1 和 S3 验收。02–07 必须各自完成职责迁移、调用方、直接导航和删除旧路径；本票不是遗漏实现的收纳箱。若清单职责未交付，明确退回其 owner，而不是静默承接或忽略。

- [ ] 对照实际上游契约和完整职责审查来源追踪及导航，区分 Pi 原生事实、pi-subagents 协议、必要 mixture 和 OMP 原生机制／可选补丁；目录名本身不构成证据。
- [ ] 审查实际依赖：native 不依赖 pi-subagents 特定协议；thirdParty 可使用必要 Pi 原生契约；mixture 消费两方显式事实／操作，来源不反向依赖 mixture。复用并按批准规则更新既有导入约束检查，不冻结所有私有路径为行为测试。
- [ ] 确认公共 assembly 与顶层私有 port assembly 职责独立，笼统 internal 分组已移除，原生类型和加载支持有真实归属；port 不解释跨来源语义，消费方不获知来源细节。
- [ ] 确认只有一套有效实现，无旧引用、兼容转发、无职责镜像或空来源分组；完整协议没有因单事件或上游文件结构被机械拆散。
- [ ] 经公开 extension 定义和 assembly 验证两个 harness 原有成功／拒绝场景以及条件能力类型凭据，公开接口、HarnessPort 和绑定使用方式不变。
- [ ] 对所有受影响消费方运行两端接入完整性检查，从实际 PI_PORT／OMP_PORT 和真实需求得到可解析供给；必需项无新增缺口，可选不可用／条件状态含义不变。
- [ ] 保留静态分析支持的显式 assembly 和 canonical delivery construction，不删减需求或加入手工能力清单掩盖缺口；允许内部源码定位变化，不要求报告逐字节相同。
- [ ] 更新既有 ADR-0002 的来源组织决定及权威架构／导航，替代过时 domain-first 规则但保留无关语义和依赖规则；不新增业务术语，也不将计划描述为已认证支持。

## 验证与交接

运行公开 assembly 契约覆盖、条件类型检查、导入约束、拥有分区及受影响消费方；TypeScript 变更必须类型检查。实际执行两端静态检查命令并审查报告，另运行适用真实 harness 加载／assembly smoke，不能把静态 provided 当作运行成功。检查更新文档的链接与示例。向 09 交付命令、退出状态、源／环境、完整结构审查结果及未解决失败；最终全量回归由 09 在稳定窗口执行。
