# 06: 消费文档安全保存与存储基线

**What to build:** 各实际 Session 按批准存储根安全保存自身消费，正常多 CLI 更新互不覆盖，旧周期/版本和坏基线不覆盖已有数据。

**Delivers:** P44, P45, P47, P51

**Blocked by:** 02: 公共工厂生命周期与 actions 路由；04: 安全文件更新与锁恢复

**Status:** in-progress

## Acceptance criteria

- [ ] 存储根初始化读取、重启生效：默认用户 .omp 主目录 cost-archive；仅 storageDir 的 ~/ 按 .omp 主目录解析，普通相对路径按配置目录，绝对路径直接使用，不随 cwd，不自动搬迁/合并。
- [ ] 活动文档采用批准 schemaVersion=1、periodId、start、可选 start_bal、holiday 和 harnesses；Session 为扁平 id/name/parent/saveVersion/own，保存可靠直接父关系且不要求父先保存。
- [ ] 只按负责 Session ID 替换/追加，保留其他记录；自身四类 token 及适用 Cost/Ref，不保存额外权威总数、账号键、Turn/Round 明细或历史价格；完整 P52 测试 owner 为 24。
- [ ] 版本作用域 periodId+harness+sessionId；旧周期/旧版拒绝，同版同业务内容幂等，同版不同内容冲突，比较业务值而非 JSON 排版，不相加/取最大/最后覆盖。
- [ ] 损坏/不兼容/无有效基线明确反馈并暂停本实例消费统计/保存，不猜零覆盖；仅下一正常初始化再加载，不自动探测补写，独立 provider 测量不受暂停规则禁用。
- [ ] 生产公共存储调用通过真实临时文件和多独立进程验证并发保存、独立读回各 Session/父关系、冲突和坏基线保护；不同 cwd、根及目录别名验证实际位置。
- [ ] 复用公共非阻塞文件入口，不把同步 I/O 包 Promise，不建立消费专属锁或路径配置体系；为后续计费提供真实可初始化、保存和恢复的基线。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
