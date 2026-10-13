# 05: 逐实际 Session 的 Turn 事实交付

**What to build:** 公共观察组获得实际主/子/孙 Session 的可靠请求事实，Owner 组只驱动主效果；同一生产机制承接身份、关联与异步失败。

**Delivers:** P57

**Blocked by:** 01: 公开 Viewed session 并冻结隔离宿主；02: 公共工厂生命周期与 actions 路由

**Status:** ready-for-agent

## Acceptance criteria

- [ ] 按订阅组声明 Owner 或逐实际 Session 范围，复用同一公共派发机制；主/子/孙身份、直接父及最新名称持续交付，不只交付当前查看目标。
- [ ] framework 拥有不透明 Turn 身份、在途关联、正常去重和冲突处理，adapter 映射原生信号及可靠桥接；工具在 Turn 外，不照搬含工具执行的原生 turn_end。
- [ ] turn_start 固定真实请求开始时间/provider/model/实际 Session/所属 Round 和可取 catalog 价格币种单位，turn_end 交付同身份结果、可靠 usage 与可取 HTTP status/headers/metadata。
- [ ] 缺事实显式不可取得；不能可靠关联则反馈并丢弃，不按当前会话/模型/到达顺序猜、不补造开始；不假定 provider 请求/响应 ID 相等或当公共身份。
- [ ] 无法判断有效来源的最终 usage 冲突按不可用，正常流式更新不算冲突；真实零与宿主默认零可靠性明确，不增持久冲突账本/结束后修正。
- [ ] 公共身份/生命周期先处理再有序 handler 交付，同步/异步错误统一承接；子事件不驱主效果，不授予 Owner 写权限，观察处理不等待文件锁/远端刷新。
- [ ] 同一公共声明/绑定分别运行 Owner 与逐 Session tests，核对主/子/孙实际身份、关联、结束和错误；隔离真实 loader/RPC 请求捕获证明实际请求开始、响应边界及可靠 usage，不以零 usage fixture 代替生产贯通。
- [ ] 通过批准的生产公共 seam 观察行为，预期来自合同/规格、独立字面值或手算，不以被测实现重算；永久网络 tests 使用 mock。
- [ ] 使用隔离安装/配置/工作/Session/数据根，不操作正式 OMP；承接异步失败并保留够用脱敏证据，完成本票自动检查及材料准备，不因计划人工验收暂停可执行工作。

## Verification responsibility

本票负责所列 Delivers 的自动 coverage 与适用宿主贯通/证据准备；P58/P52 按本票具名责任执行。合同采用 Rapid iteration：H1/H2 及允许的条件性 H3 按原 Coverage 交用户确认，未确认不记通过；不改变承诺或免除实现/永久 tests。
