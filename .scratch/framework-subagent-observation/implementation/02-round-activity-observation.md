# 02: Round 驱动的活动观察与切换保护

**What to build:** 会话 Working/Idle 由 framework 共同 Round 语义提供给扩展。自动继续、待处理输入和等待异步工作期间保持 Working；真正静止才 Idle。普通 transferred 或查看位置切换不因离开该位置而强制结束实际会话的 Round。

**Delivers:** P10, P33

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P10、P33 全部 coverage 与测试。与 01 可独立开始；相邻公共消费 interface 的改动须保持一致，不建立第二套观察或生命周期派发。

- [ ] 用独立场景验证自动继续、待处理输入、持有异步工作及真正静止；只有满足共同结束条件时才观察到 Idle。
- [ ] adapter 仅映射宿主执行事实；不能把 pi 子会话创建或原生执行结束通知直接解释为 Working 或 Idle，也不能把 settled 无条件等同 round_end。
- [ ] 活动与待继续阶段切换会话或查看位置，不产生额外 round_end、保存或 Idle；普通 transferred 与正常 disposed 的含义保持不同。
- [ ] 在共同消费 interface 和实际 OMP、pi 表面验证活动状态；实现复用现有 Round 判断，观察不得反向驱动重复计费生命周期。
- [ ] 按仓库测试规范执行相关确定性场景、所属分区和受影响消费者；TypeScript 变化执行 typecheck。记录实际宿主证据与限制，不以 mock 或历史运行代替本次观察。
