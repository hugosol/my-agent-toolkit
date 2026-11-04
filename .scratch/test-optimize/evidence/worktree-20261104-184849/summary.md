# 新 worktree 构建/测试基准结果

## 范围

- 固定提交：`6c75dc1ed4c5fe98d006b409d2684cc084fccca3`。
- 独立 detached worktree：`E:/Developer/myhub/my-agent-toolkit-test-bench-20261104-184849`，保留供复查。
- Bun 1.4.4 / Node v24.18.0 / Windows x64。
- 未复制 node_modules、仓库 .cache 或 runtime。保留机器下载缓存、已安装 Pi CLI、旁仓预构建安全后端；不是全新机器。
- 仅自动验收更新 worktree 内 `framework/docs/pi-acceptance.json` 并产生证据；原工作区源码未改。

## 分阶段测量

|阶段|命令|外部墙钟|结果|
|---|---|---:|---|
|创建 worktree|git worktree add --detach … 6c75dc1…|1.104 秒|通过|
|安装|bun install --frozen-lockfile|1.249 秒|通过，14 packages|
|类型/静态检查|bun run typecheck|3.405 秒|通过，authoring 0 diagnostics|
|冷缓存宿主准备|bun run test:dock:serial|965.798 秒|166 pass / 7 fail / 0 skip，48 文件|
|标准全仓 1|bun run test|619.171 秒|1809 pass / 6 fail / 0 skip|
|标准全仓 2|bun run test|618.161 秒|1809 pass / 6 fail / 0 skip|
|标准全仓 3|bun run test|364.761 秒|1811 pass / 4 fail / 0 skip|

仓库没有独立 build 脚本。各测试命令追加 JUnit 和 per-file timings 输出参数，具体完整 argv 见对应 `*-summary.json`。每轮 timings 输入文件初始不存在，没有借用历史耗时排序。全仓仍是 package script 的 12-worker 选择，没有过滤或 retry。

各阶段执行耗时累计至第一次完整结果为 **1590.727 秒（26 分 30.7 秒）**，含仓库要求的串行宿主准备，不含阶段间人工分析停顿。这是得到失败结果的时间，不是全绿反馈时间。冷缓存只测了一次，不能声称其稳定分布。

三轮全仓均为 229 文件、1815 个相同用例身份，包含运行时展开场景；全部 0 skip。全仓耗时中位数 618.161 秒，范围 364.761–619.171 秒。失败数与断言数变化，所以不能把第三轮变快当作优化收益。

## 主要证据

1. `model-cost-modes.test.ts` 在全仓三轮分别耗时 542.589 / 541.585 / 288.232 秒。前两轮六个真实宿主场景全部 ready 超时；第三轮前三个超时、后三个通过。没有 frames/stderr/session files，诊断时子进程仍在运行。冷串行也出现同样的六个超时。
2. 后续单独运行该完整文件：**32.383 秒，8/8 通过**。单独运行首个曾失败场景：4.455 秒，1 pass / 7 name-filter skips。只证明它并非稳定必现的业务断言失败，不证明全仓已修复，也不区分缓存/负载/顺序。
3. 冷准备的 `activity-facts` 在初始化 hook 默认 5 秒处超时，没有执行三个实际场景。源码 beforeAll 调用可能安装依赖的 `ensureIsolatedHarness`，没有单独设置 hook deadline。缓存就绪后完整文件独立运行 8.333 秒，3/3 通过。不能靠提高 timeout 或隐藏失败解决。
4. 第三轮 `integrations/cli.test.ts` 的 selected assembly output 用例发生默认 5 秒 timeout；完整文件独立运行 11.933 秒，6/6 通过。
5. 其他实测慢场景包括 HTTP 默认 30 秒预算（30.003 秒）、文件锁默认 15 秒预算（15.080 秒）、真实后端离线窗口（35.024 秒）。这些时长本身是机制的一部分。

## 优先级建议

- **P0：稳定真实宿主启动/部署边界**。先分段观察源码部署、依赖解析、host bootstrap/readiness 与清理，保留所有真实模型/宿主/状态隔离和断言。临时源码部署未显式带 yaml 是一个源码线索，但后续原样通过，因此不把它认定为确定根因。当前不能把失败主导的墙钟当健康基准。
- **P1：独立准备不可变 host/patch artifacts**。避免首次安装落在业务 hook 的默认 5 秒预算内。可评估复用现有 materialization helpers，保留确切版本、哈希、native 与原子发布校验；是否替代完整串行预热需先验证 prefix 覆盖和所有原测试。尚未实施或测得节约。
- **P2：健康基准后再调度/复用**。保留进程隔离，采 worker 开始/结束与资源指标，再评估耗时感知排序或并发上限。现在不能从 12 worker 推断需要更多或更少 worker。
- **保持：根安装/typecheck 与真实 timeout 场景**。前两者仅合计 4.654 秒；不要优先优化。后者不能通过删等待、改 fake clock 或缩短契约来获得虚假加速。

未改测试、未调 runner、未实现优化，无 before/after 提速声明。没有独立 CPU/I/O profiler、网络冷缓存对照或第二个全冷 worktree；全仓未出现绿色结果。完整保留条件见 `findings.md`，条件与复现协议见 `protocol.md`，逐轮身份/失败见 `all-results.json`。

最终进程快照未发现命令行引用本 worktree/计时驱动的遗留进程；此检查不是对所有 detached 子孙进程的形式化保证。
