# 票据 06 证据：State follow 与会话观察独立运行（P21、P22、P23）

日期：2026-10-17。worktree 分支：`hyper/framework-subagent-observation/06-follow-observation-independen-ed2819-e98ea402077c`
（基于集成分支 `hyper-tdd` 的合并树 `e50c574`）。平台：Windows 10.0.26200，bun 1.4.2，typescript 7.0.2。

## 交付内容

P21–P23 的大部分语义由既有实现承载（`framework/core/state.ts` 的 `followed`/`view`、
`framework/core/followed-owners.ts` 的读取半边、`framework/modules/local-access.ts` 的进程内直接读取与跨进程接入、
`framework/behaviors/binding.ts` 的 owner seat 接收、`framework/core/observations.ts` 的进程观察源）。
本票补齐本契约下的 S1／S2／S3 覆盖与独立给定值证据，并修复在执行 checklist 第 1 项时发现的一处
**进程模式不一致**：

- **缺陷（P21，「两种进程模式均取得 Owner 当前权威值」）**：进程内被跟随的读取走 `openOwnerAccess` 的
  直接调用方（`directCaller`）。该调用方的 `ended()` 只在自己 `dispose()` 时置位，因此当 Owner 的生命结束
  （cell 退休、offer 撤回）或同一 owner 被重新进入（`#offerAccess` 换出新的 source）时，它仍继续回答**上一个生命
  的值**——即永久快照，只是快照来自旧生命。跨进程路径不受影响：seat 两个半边都在边界处释放后，host 会销毁连接
  （`#releaseIfEmpty` → `socket.destroy()`），远端调用方据连接关闭自行失效并在后续读取重连。
- **修复**（`framework/modules/local-access.ts`，3 处）：`directCaller(target, seat, source)` 增加 target 参数，
  并把 `ended()` 定义为「本进程为该 seat 提供的 values 半边已不是当初这条 access 所依据的 source」，
  即 `ended || processSeats()?.get(seatKey(target))?.values !== source`；调用点同步传入 `options.target`。
  于是被替换／撤回的 offer 上的 access 报告自身已耗尽（与连接被 host 关闭同义），
  `FollowedOwners` 按既有政策放掉它并在后续读取重开当前 offer——两种进程模式由此得到同一含义：
  退休的 seat 只回答声明默认值，重新进入后的读取取得新生命的当前值。

新增测试：

- `tests/framework/follow-observation-independence.test.ts`（4 例，S1 + S2）：进程内 follow 直读与值双向变化、
  access 随 Owner 生命耗尽且新生命可读、无 follow 字段的真实进程登记与更新、远端读数采纳不写 Owner 值。
- `tests/model-cost/form-observation-independence.test.ts`（1 例，S2 + S3）：真实交付进程 + 生产前端，
  brief 期间读数仍被采集、切 detail 显示最新读数、重复切换不重复来源／不停止采集／不重建接入。

## 逐项验收

| 票据验收项 | 证据 |
|---|---|
| 两种进程模式分别验证初始读取及 Owner 值 true→false 后的后续语义读取；跨进程实际取得 false，不把不可达默认值计为成功读取 | **同进程**：`follow-observation-independence.test.ts`「the seat is answered in this process…」——Owner 自身 boundary 恢复独立给定值 `true`，首读为声明默认（未达），到达后读得 `true` 且 marker 区渲染该行；Owner 写入 `false` 后同一语义消费（注入 prompt 与 marker 区）都变为 `false`，再写回 `true` 又读得 `true`。该读取指向**不存在**的配置文件路径，故不可能来自定位／端点路径。`owner-follow.test.ts`「an owner this process holds is read from its cell, with no access at all」以同一 store 的 cell 路径验证 true→false（`seat.opens` 为空）。**生命周期**（本次修复）：`follow-observation-independence.test.ts`「the access is spent with the Owner's life…」——Owner 生命结束（seat 撤回）后读取为声明默认而非退休值；以 `false` 重新进入该 owner 后不携带旧值，新生命写入 `true` 即读得 `true`、写回 `false` 即读得 `false`。**跨进程**：`owner-follow-processes.test.ts`「the follower reads what the serving process holds, then follows its change」——真实两进程，先读到服务进程持有的 `true`（marker 行 `◈ followedOwnerProbe` 为独立证据），Owner 改 `false` 后读到 `false`，再改回 `true` 又读到 `true`；不可达默认值与真值由同一用例的首读／后续读分离，并由 `owner-follow.test.ts`「an owner that cannot be reached reads the declared default…」钉住 |
| 一次语义处理内相关读取使用所取得的一致快照，不要求每个 getter 分别通信；同进程直接读取，跨进程复用 framework Local access | 同一 handling 内注入 prompt 与 marker 区用同一快照：新用例中 `on.contribution` 与 `on.markers` 同时为开、`off` 时同时为关。多次 getter 只做一次通信：`owner-follow.test.ts`「reads before the access is reached answer the default, and one attempt is shared」（三次 getter 读取 → `seat.opens` 长度 1）。同进程直接读取：新用例的读取指向不存在的配置文件仍读得 Owner 真值（`openOwnerAccess` 只在该进程有 seat values 半边时走直接读取，否则解析配置并抛 `LocalAccessConfigurationError`）；`local-access.test.ts`「reading in the process that serves the seat opens nothing and reads the source itself」钉住该路径。跨进程复用 framework Local access：`owner-follow-processes.test.ts`、`local-access-observation.test.ts`（真 named pipe／socket 文件、真 location record） |
| 读取及观察更新后 Owner 的独立给定值不被修改；错误方向、未声明操作及远端 State 写入被拒绝 | 读取不写：新用例末尾 `serving.view(OWNER.key).read(FIELD)` 仍是 Owner 自己写入的值；`owner-follow.test.ts`「a widened observation grants no write or effect authority」在 S1 断言子侧 write／notify／command 全部不落地。观察更新不写：`follow-observation-independence.test.ts`「a reading from another process writes nothing of the Owner's」——采纳远端读数后 Owner 值仍是 boundary 给定的 `true`，marker 区无新增渲染（写路径必重发布），无诊断；无 follow 字段的真实进程用例同样断言 Owner 值不变。错误方向／未声明操作／远端写被拒：`local-access.test.ts`「the endpoint serves its own seat and refuses a frame for any other」（真实进程：`{t:"write",…}` 帧被 refused、无 value 回包、服务进程值不变）与 `local-access-observation.test.ts`「a seat that receives no observations refuses one」「a reading that names another owner is refused」 |
| 无 follow 字段扩展在实际进程中仍可完成登记与更新，观察启用不依赖 follow 字段存在 | `follow-observation-independence.test.ts`「a real process registers and then updates on that Owner's seat…」——`state` 只声明字段（继承取默认 `none`），真实子进程经真 location record／端点两次 deliver（activity + tokens），本进程观察源先后读得 4242 与 8888，且该 seat 的 values 半边不存在（`localOwnerAccess` 为 undefined）。S3：`form-observation-independence.test.ts` 断言 `stateInheritance(MODEL_COST) === "none"`，真实进程读数仍进入该扩展的观察源并画入 detail。既有 `local-access.test.ts`「the pi assembly offers an owner's values only for a follow field, and its observation seat wherever it spawns」钉住“值半边随 follow、观察 seat 不随” |
| brief 期间更新后切 detail，实际表面显示最新读数；重复切换不重复来源、不停止采集、不重建观察连接 | `form-observation-independence.test.ts`：brief（默认）期间真实进程交付 45,000 tokens 读数 → 已被采集而 surface 仍不画树；`/budget detail` 后真前端行含 `Ctx: 10% (45,000/450.0K)`；detail 期间再交付 90,000，连续两次 `/budget detail` 后行含 `Ctx: 20% (90,000/450.0K)`；再交付 120,000 仍被采集，两次切换后行含 `Ctx: 27% (120.0K/450.0K)`；会话行数恒为 1（不重复来源），交付进程自身报告 `reached: true`、`ended: false`、3 条读数都经同一接入送达（连接未重建、采集未停止） |
| 按仓库测试规范覆盖 State 消费者、真实进程读取和实际展示切换，执行所属分区；TypeScript 变化 typecheck；记录权威值证据与未验证限制 | 见下「命令与结果」；限制见下「未验证与限制」 |

## 命令与结果

| 命令 | 结果 | 日志 |
|---|---|---|
| `bun run typecheck` | exit 0 | `logs/06-typecheck.log` |
| `bun test tests/framework/follow-observation-independence.test.ts` | 4 pass / 0 fail（34 expect） | — |
| `bun test tests/model-cost/form-observation-independence.test.ts` | 1 pass / 0 fail（21 expect） | — |
| `bun test tests/framework` | 559 pass / 0 fail（47 文件，2504 expect） | `logs/06-partition-framework.log` |
| `bun test tests/model-cost` | 479 pass / 0 fail（45 文件，2630 expect） | `logs/06-partition-model-cost.log` |
| `bun test tests/framework/owner-follow.test.ts tests/framework/owner-follow-processes.test.ts tests/framework/session-observation-access.test.ts` | 22 pass / 0 fail（110 expect） | `logs/06-follow-suites.log` |

上述分区结果对应工作树内容 = 本票提交内容（`framework/modules/local-access.ts` 的 3 处修复 + 两个新测试文件），
测试文件与源码在运行期间未再变动。

## 变异注入（确认用例能捕获对应违规，随后还原；每次还原后复跑为绿）

| 注入 | 位置 | 结果 |
|---|---|---|
| 丢弃接入推送的变化（读取退回“永久启动快照”） | `framework/core/followed-owners.ts` `#open` 的 `caller.observe(...)` 赋值改成 `void caller;` | 新用例 1 失败于「Owner 写 false 后下一次消费仍为开」；还原后绿 |
| 观察 seat 只在值半边存在时接收（把观察绑到 follow 字段上） | `framework/modules/local-access.ts` `OwnerAccessHost.receive` 开头加 `if (seat.values === undefined) return () => {};` | 无 follow 的真实进程用例与 model-cost 展示用例同时失败（子进程连不上 seat）；还原后绿 |
| 进程内 access 一律报告已耗尽 | `framework/modules/local-access.ts` `directCaller` 的 `ended` 改成 `() => true` | 新用例 1 与 `owner-follow.test.ts` 的 pi assembly 同进程用例失败（读取不再活跃）；还原后 16 pass / 0 fail |
| （修复自身的红）不修 `ended()` | 修复前的工作树 | 新用例 2 失败于「Owner 生命结束后仍读得退休值 `true`」；修复后绿 |

## 未验证与限制

- **未跑真机 pi CLI／OMP 真机**：S3 证据是生产前端（`attachModelCostWidget`）经**真实** framework 本机接入与
  **真实**子进程读数绘出的 detail 行；它不认证真实 harness。真实宿主链路由票据 12（P34、P35）承载，本票未运行
  `scripts/pi-subagent-smoke.ts`，也未运行 `tests/harness-dock/viewed-marker.test.ts`（该 dock 需要
  materialise 的 patched host 安装，属真机范围；且共享工作树内与同伴票据同时运行代价过高）。
- **未跑 POSIX 载体**：全部真实进程证据来自 Windows 命名管道；`local-access-observation.test.ts` 的 POSIX
  socket 分支未被本票运行认证。
- **未验证的其他宿主版本**：未验证 pi 1.3.0 之外版本。
- **未在本票运行的其他分区**：`tests/harness-dock`、`tests/codebase-tools`、`tests/connect-bot` 未运行；
  最终集成按项目约定执行全仓回归。
- **载体侧同一生命边界未单独取证**：跨进程在 Owner 边界后的恢复由既有 `owner-follow-processes.test.ts` 用例
  覆盖（其 serving 进程只提供 values 半边，seat 因空而被释放）；「两个半边都在（真实 pi 主进程会同时接收观察）
  时连接也在边界处被销毁」由代码路径推断（`#withdrawValues`/`#withdrawReadings` → `#releaseIfEmpty` →
  `socket.destroy()`），本票未构造同时持有两个半边的 serving 子进程用例。**推断项，未验证。**
- **端点创建未计数**：新用例 1 的「不看定位／不开端点」由“指向不存在的配置文件仍读得真值”推出，未对端点创建做计数。
- **合并注意（来自票据 05 的交接）**：`framework/modules/local-access.ts` 与本票的 `directCaller` 改动会被
  票据 05 的同函数改动重叠。整合时应取本票的 `directCaller(target, seat, source)` 签名、`ended()` 与调用点，
  并保留票据 05 在 `deliver` 内的 `const asSource = nextSource();` 与 `seat.readings?.adopt(asSource, reading)`；
  票据 05 的 `ObservationSource`/`SessionObservationSink`（含 `receive`／`#accepted`／`ProcessSeat.readings`）
  不可退回裸函数 sink，否则无法通过类型检查。
