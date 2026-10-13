# 19: holiday 与 clear 的完整周期切换

**What to build:** 用户在可靠允许的 DeepSeek 入口执行 holiday/clear，完整归档已保存消费后切新周期，阶段失败反馈真实且不迟到执行。

**Delivers:** P30, P31, P32, P33, P34, P35, P36

**Blocked by:** 14: Codex 成对采样估计与独立保存；17: 静态 detail 与立即切换入口偏好

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 仅当前 DeepSeek 入口可靠 idle 且保存已收口允许；busy/pending-save warning、unknown error 拒绝，不排队/延期，不要求其他 CLI/子全空闲，不清真实活动或 Owner。
- [ ] 首次 holiday 新周期直接 true，clear 新周期 false；已开启 holiday info 幂等不切周期不查余额，无 off。
- [ ] 允许后、文件锁前只尝试一次 5000ms 余额，可靠同值作旧 end_bal 和新 start_bal；失败/超时省略两处仍 reset，不用旧缓存/零/重试。
- [ ] 权限内重读最新完整有效活动文档，先生成唯一拒覆盖归档含 end，再原子发布新活动，跨 provider 全文件且零消费也归档；只归档已保存数据。
- [ ] 归档失败不 reset；归档已生成但活动发布失败保留归档并准确报告阶段，只在实际新活动提交后成功；宿主命令等待真实完成，同步/异步错误单报，不补做/事务日志。
- [ ] 新 periodId 拒绝旧周期/在途提交，不收集其他进程内存/强制保存/终轮，不复活旧消费；不清旧归档、独立 estimate 或 detail。
- [ ] 本票写 P30–P36 全部业务 tests，经公共命令/S2、mock 单次查询捕获和真实文件独立读回验证顺序/归档/幂等/失败/保留；完整跨文档 P52 验证由 24 负责。
- [ ] 准备 P36 H2 边界余额脱敏读数或跳过原因与归档检查步骤；人工结果未确认不记真实余额贯通通过。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
