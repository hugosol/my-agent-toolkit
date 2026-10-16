# 03: 子进程启动即安全登记并交付当前观察

**What to build:** 实际后台子会话取得可靠身份后即向 Owner 登记并提供当前活动与上下文，无须等待第三方完成通知。复用 framework Local access 补足 child 到 Owner 的声明值交付，Owner 直接采用读数；连接只能进入完整目标和有效接入所允许的观察范围。

**Delivers:** P1, P13, P25, P26

**Blocked by:** 01 — 共同上下文观察与首次快照；02 — Round 驱动的活动观察与切换保护。

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有所列 promises 全部 coverage 与测试；不得只交付协议定义或进程内模拟。身份只能来自宿主可靠事实，不能从 PID、名称或目录形状猜测。

- [ ] 实际 pi 后台会话在首轮结束及第三方完成通知之前已在 Owner 观察中可见，身份与独立宿主会话事实一致。
- [ ] 真实跨进程活动和上下文通知携带独立给定当前值；消费文档未变化时 Owner 仍采用这些值，并通过消费存储访问记录证明采用更新不需要读取文件。
- [ ] 两端校验完整 extension、Owner 和接入有效性；真实进程的错误扩展、错误 Owner、旧接入均被拒绝，两个并发 Owner 的给定值不串接。
- [ ] 诊断不泄漏接入校验材料；仅允许声明方向和操作，不扩展为任意 RPC、消息总线或远端 State 写入。
- [ ] 定位记录只承载发现所需信息，不含观察值或 State；通过实际文件内容及变动观察证明不是文件消息队列或目录扫描接收。
- [ ] 缺失或非法 runtime directory 明确失败，不回退到 cwd、临时目录或消费存储根；复用既有本机载体和资源寿命，不另建 harness 专属通信栈。
- [ ] 按仓库测试规范执行真实进程隔离场景、对应宿主 smoke、所属分区及受影响消费者；TypeScript 变化执行 typecheck，记录命令、平台、版本和证据限制。

## Comments

### 2026-10-17 执行记录（P1、P13、P25、P26）

实现与证据见 [证据文件](evidence/03-secure-process-registration-evidence-2026-10-17.md) 与
[真机日志](evidence/logs/03-pi-subagent-smoke-background.log)。要点：

- S2：`modules/local-access.ts` 在同一个 seat 上补出 child → Owner 的观察方向（`receive`/`deliver`、
  `observed` 帧、两端严格解码、按 seat 的 owner 校验观察范围、seat 记录与 endpoint 的既有寿命），
  并给出 adapter 用的 `createObservationDeliverer`（接入第一句话带"当前可用读数"，之后按变化写）。
- S1：`HarnessPort.sessionObservationAccess`（可选）+ `handOverReading` 唯一跨进程规则 +
  `binding.ts` 的 `receive`/`adoptReading`（写入本进程观察源并走同一套轴派发，不驱动计费生命周期）；
  `pi.ts` 声明 `childEntry` 即建载体，声明值半边仍只在 `follow` 存在时提供。
- 判定：`bun run typecheck` exit 0；`bun test tests/framework` 538 pass / 0 fail（新增 16 个用例）；
  `bun test tests/model-cost`（受影响消费者）466 pass / 0 fail；
  五处变异注入均被对应用例捕获后还原；真机 `pi-subagent-smoke.ts --background-only` 的三条新断言
  （首轮结束前登记、身份与宿主事实一致、读数落在 Owner 观察源）在本机 pi 1.3.0 上通过，随后停在
  既有已知失败（子进程自身消费未落盘，P27／票据 05），未越权修复。
- 未验证：POSIX 载体、其他 pi/宿主版本、真机 OMP；子会话上下文读数到达 Owner 的断言因上述既有失败
  未能执行（不当作通过）。
