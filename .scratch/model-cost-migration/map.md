# model-cost 完整迁移：通用能力分层与 OMP 适配

Labels: wayfinder:map

## Destination

逐项确认 model-cost 的完整需求、extension／framework 通用能力／harness adapter 的归属、能力契约、源码组织及验收标准，形成可直接实施的完整迁移规格。地图清晰后进入单独跟踪的实施，最终完成 OMP 上的迁移与验收；地图本身不承载生产实施。

## Notes

- 2026-10-09 用户确认：先决策，再完整实施；OMP 落地，业务逻辑与通用契约保持 harness-independent，不在本次实现 pi adapter。
- 用户确认以现有功能全量保留为讨论基线；逐项讨论后才允许有意删改。以实际代码、业务 ADR 和 glossary 为证，不把 README 当完整清单。
- 用户允许全新统计：不要求导入旧统计文件、延续旧统计基线或新旧文档读写兼容。保留旧数据、不自动删除或改写；新存储根目录、账户隔离、归档格式和正式切换另行决策。
- 用户确认按三层开票：model-cost 拥有业务规则；HTTP／文件及并发协调纳入 framework 通用能力；宿主事实与语义映射由 framework adapter 提供。具体接口并未确认；widget、命令和认证／代理的 seam 单独讨论。
- 现有 ADR-0002 的责任测试与 native import 边界继续约束本次设计。backlog 对 HTTP 曾持扩展自有方向，本次明确讨论升级为 framework 能力；最终决策须同步其唯一权威文档，不能并存两套政策。
- 2026-10-09 用户选择以旧实现“聚合为主”为基础，先检验具体极端场景，只有发现不能满足的必要场景才取舍是否升级。/tree 优先保证 Session 累计正常，历史 Turn 累计可能不可取得可以接受；最小 framework 能力由选定实现需要倒推，而非先造完整账本／框架接口。该局部取舍不自动取消其他功能，正式修订范围由当前数据决策记录。
- 2026-10-09 用户要求重新评估“按 Turn 记录”的成本收益：逐响应计价／累加、运行期关联与长期明细留存不是同一要求，不把完整逐 Turn 账本或准确性最大化作为默认迁移目标。数据讨论先用旧代码和实际场景验证最小必要记录粒度；此前决定可据此提出修订，但未确认的修订不改变当前有效契约；已确认修订按用户要求同步旧 Lighthouse 与决策票正文，修订前版本保留历史快照，不自动缩减其他功能。
- 2026-10-09 用户要求纠正讨论顺序：先用旧源码、具体数据结构和一条端到端数据流建立实现心智模型，再讨论逻辑／接口取舍；未说明数据在哪里、谁读写、何时持久化前，不泛问同步／异步。当前先做数据归属／寿命／查询，再做存储与协调，随后收口观察处理约束和刷新调度。装配草图可以提前作为讨论材料，最终装配规格仍在契约明确后收口。保持地图规划模式，可用隔离探针支持决定，不做生产迁移。
- 后续设计讨论遵循[Happy flow 优先的设计推进原则](lighthouse/03-observation-contract.md#happy-flow-优先的设计推进原则)：先建立原则，再在原则内推进具体设计，避免用假想极端组合反复推翻主线；确认来源与重审条件在该权威主题。
- 每次咨询 grilling、domain-modeling；设计接口咨询 codebase-design；决策落地依次使用 lighthouse、backtracer。HITL 决策须由用户确认。每次工作只解决一个非 research 决策票，chart 会话不关闭票。
- [现状调查与功能证据](assets/current-state.md) 是事实资产，不是已批准的契约。它也记录调查 smoke 的实际输出；远端余额／额度、动态 TUI、完整 OMP 原生链路均未在本次调查运行。
- 框架当前仅实现 OMP adapter，支持基线为 18.5.0；本机安装版本不等于支持基线。迁移验收版本是否改变必须显式决定。
- 子票存放于 decision/；按编号扫描 open、无未满足依赖、未认领的票选 frontier。开始工作前先写 Status: claimed 和 Assignee。开放票不在地图正文重复列出。
- [数据归属与账户周期决议](lighthouse/12-state-data-contract.md)已正式结案；最终取舍与历次暂停溯源只在 Lighthouse。后续按已定数据流推进存储与协调，再返回观察处理约束；不重问聚合／明细账、不恢复观察票旧 Q10，不把本票结案视为存储或原生观测已实现。继续工作时按 tracker 查询 frontier，或使用用户明确指定的票。

## Decisions so far

- [完整保留哪些业务行为，统计单位如何命名？](lighthouse/01-behavior-contract.md)：保留请求锚价、公共 Turn／工具／Round 与 Codex 额度功能；当前有效功能清单已同步数据决议的聚合、账户周期及预算修改移除。

- [用量与费用属于哪个会话、账户和请求，如何避免漏算与重复？](lighthouse/02-accounting-ownership.md)：实际会话／身份聚合与去重并发正确；单账号可替换、DeepSeek 凭据身份范围已修订，本周期／clear 与同账号多会话支持保留。

- [model-cost 的哪些数据进入 framework State，如何声明与读取？](lighthouse/12-state-data-contract.md)：扩展自有逐响应聚合；本轮修订子代理仅按直接父 Session 汇总、Round 仅本实际会话自身，取消父 Round 启动标签／消费分段；本周期、账户 clear 与恢复取舍保留。

- [framework 如何提供独立存储、原子更新与跨进程协调？](lighthouse/06-local-storage.md)：单活动 JSON／独立归档与 estimate、唯一聚合／最近轮；提前异步保存并在 handler 返回前等待，轻量 FIFO／跨进程互斥、周期／版本校验、默认协调等待 15 秒；普通消费保存失败丢弃未保存部分、从磁盘有效快照初始化，不重试补账并接受少量损失；clear 只归档已保存数据、不排空内存，先归档后提交、失败终止；无有效基线暂停统计至下一次初始化；用户级共享、storageDir 可配置，~/ 特指用户 .omp 主目录，初始 ~/cost-archive 复用旧目录，由用户切换前手动备份清空、修改重启；固定 consumption.json、独立 codex-usage-estimate.json 与 archives/；本机本地文件系统同机跨进程共享已确认，不承诺网络盘／云同步跨机器写入；framework 通用文件能力（规范化路径协调键、锁文件互斥、锁内重读、临时文件 rename 原子发布、损坏不覆盖、陈旧锁回收且不静默覆盖）、读新鲜度以锁内读为准不做每请求读取、consumption.json 最小 schema（parent 已按子代理 Session-only 修订裁剪）与 UUID 归档、同会话多执行者靠版本冲突收口均已确认。

- [framework 如何提供请求、响应、Turn／Round 与模型事实观测？](lighthouse/03-observation-contract.md)：已按正常数据流、最小必要事实与异常基本原则收束；公共逻辑优先 framework、adapter 必要桥接，尽量统一 round_end；宿主可先 idle／接受新输入，公共 handler 等待自身异步保存，具体装配与生产验收仍未实施。

- [账户凭据、provider 地址和代理如何跨 seam 提供？](lighthouse/04-provider-access.md)：已结案，adapter 按需交付当前访问资料，业务查询留 shared logic；身份、HTTP 与初始化规则分别消费其原权威。

- [framework 的通用 HTTP 能力承诺什么，如何接入余额与额度请求？](lighthouse/05-http-capability.md)：部分确认独立配置、多代理及逐请求选择，缺配置直连、运行失败不自动直连重试；完整 interface 未决。

- [额度与余额在何时刷新，异步效果怎样跟随会话生命周期？](lighthouse/09-refresh-lifecycle.md)：部分确认初始化两源并行预取、首次模型请求前收口；其余调度未决。

- [/budget 的参数、操作与状态如何在新框架表达？](lighthouse/07-command-state.md)：仅确认 clear 在当前入口 Round 中拒绝、不延期排队，结束并保存收口后可执行；其他命令问题未决。

- [观察契约的 Handoff](decision/03-observation-contract.md#handoff)记录本轮收束、证据限度及下游职责；不恢复异常情景树或父 Round 分配，不把规划结案／临时探针当生产实现。

## Not yet specified

- 原生宿主缺失尚未具体暴露的观测能力时，其降级／拒绝与诊断如何衔接，遇到具体路径再展开；账户访问的局部查询失败原则已由账户访问权威持有，提示承载由现有展示票决定，不在此重复开雾。
- 本次新增通用能力对 connect-bot 等既有消费者的复用或收口影响，需在接口定型后判断哪些是本次调用方迁移义务，避免制造第二套机制或扩大业务范围。

## Out of scope

- 本次 DeepSeek／Codex 多账号选择、自动轮换／逐请求账号追踪、无消费者的账号管理接入，以及 DeepSeek 同账号换 Key 的自动识别／统计合并；支持范围与取舍见[消费归属的账户主题](lighthouse/02-accounting-ownership.md#账户隔离多会话与额度)，单账号允许前后替换。

- 多台机器通过网络共享盘／云同步共同写入统计的正确性保证、分布式锁或同步冲突合并；[本地协调范围决议](lighthouse/06-local-storage.md)限定本机本地文件系统，不取消同机多进程安全共享。

- 实现或认证 pi adapter；只考虑契约是否把 OMP 原生细节泄漏给共享代码，不宣称 pi 能力对等。
- 导入旧统计、继续旧基线或要求新旧统计文档双向兼容；用户允许从空统计开始，旧数据保留。
- 图内执行生产迁移；决策规格完成后进入独立 implementation 工作流，整体迁移目标不取消。
- Codex 会话消耗与账户额度之间的转换或分摊；[消费归属决议](lighthouse/02-accounting-ownership.md)确认不做此换算，账户级双窗口／ratio／left 与参考费用继续保留。
