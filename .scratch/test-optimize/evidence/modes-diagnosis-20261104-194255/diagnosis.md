# model-cost-modes 启动稳定性诊断

## 结论

已验证一个能够复现历史 ready 超时签名的部署缺陷：临时源码部署没有携带运行时依赖 `yaml`，因此真实 Bun 宿主在加载扩展时隐式访问包注册表并安装依赖。注册表元数据响应不能完成时，宿主在 ready 之前阻塞，最终触发原有 90000ms deadline。

通过仅增加本地依赖物化的一行临时修改，受控注册表持续不可用时整个文件仍连续两次通过，且注册表收到零请求；撤回这一行后相同超时再次出现。原工作区未改，诊断 worktree 的该修改也已撤回。本轮交付诊断，不保留永久修复。

这是已验证的因果机制，不等于证明历史每一次失败的外部网络原因：旧基准没有注册表请求抓取，不能断言当时具体是 DNS、代理、注册表服务、缓存刷新还是其他网络条件。也不排除其他独立启动问题。

## 源状态与隔离

- 源提交：`6c75dc1ed4c5fe98d006b409d2684cc084fccca3`。
- 诊断 worktree：`E:/Developer/myhub/my-agent-toolkit-test-bench-20261104-184849`。
- Bun 1.4.4，Windows x64；使用已准备好的实际 OMP 18.5.0 viewed-session 制品，未修改宿主、补丁或 native。
- worktree 中原有 `framework/docs/pi-acceptance.json` 更新和三个验收证据文件来自上一轮基准，未撤销。
- `OMP_BASELINE_RECORD_ROOT=E:/Developer/myhub/my-agent-toolkit`。
- 各诊断顺序执行，开始时未观察到其他 Bun test/基准驱动。保留现有交互程序和服务，未声称机器全局无负载。
- 注册表对照仅修改诊断进程环境：`BUN_INSTALL_CACHE_DIR=<本轮唯一空目录>`，`BUN_CONFIG_REGISTRY=http://127.0.0.1:<动态端口>`。不清空全局缓存，不修改真实 registry 配置，不记录请求头、凭据或全量环境。
- 本地注册表由 Python ThreadingHTTPServer 启动，动态 loopback 端口；记录请求路径/时间。每轮结束释放 Event、关闭 server/socket、join 服务线程。宿主仍执行真实测试，模型仍是测试既有 capture 服务。

## 复现命令

在上述 worktree 执行：

```text
bun test ./tests/harness-dock/model-cost-modes.test.ts --test-name-pattern="an unlisted pair" --reporter=junit --reporter-outfile=<本轮证据.xml>
```

全文件验证：

```text
bun test ./tests/harness-dock/model-cost-modes.test.ts --reporter=junit --reporter-outfile=<本轮证据.xml>
bun run typecheck
```

单场景运行选择一个案例，其余七个由名称过滤排除，JUnit 记作 skipped；这些是诊断负载，不是修改完整 gate 的选择。全文件两次验证均无过滤/跳过。

## 控制注册表的精确行为

1. 第一种控制不发送响应头，记录 `/yaml` 后等待。观察到两次请求，原始阴性 hidden 场景 74.06 秒后仍通过。这不是历史 ready 超时的稳定复现，不能以此声称故障已复现；也说明只看 hidden 场景绿色不能替代完整正向场景验证。
2. 用于闭环复现的控制发送 HTTP 200、`Content-Type: application/json`、`Content-Length: 1000000`，发送 `{` 后每秒发送一个空格，始终不完成 JSON 响应体。这样连接保持活跃而依赖解析无法完成。原始测试保持原来的 90000ms ready deadline；未改 timeout、assertion、provider 或业务数据。
3. 原始场景在 ready 前请求 `/yaml`，到期报 `DockSessionError: timed out after 90000ms waiting for ready frame`。诊断同时为 `exit: <still running>`、`session files: <none>`、stderr 空、frames 空，与旧基准签名一致。测试自身的启动失败清理回收宿主。
4. 两次红色复现都使用不同的空缓存目录。绿色候选也各自使用不同空缓存和相同未完成响应策略，因此不是读取上轮临时下载缓存造成的绿色。

## 测量结果

|条件|墙钟秒|结果|注册表观察|
|---|---:|---|---|
|原始源码、原环境，第1次|4.001905|1 pass / 7 filtered|未接入控制注册表|
|原始源码、原环境，第2次|4.649616|1 pass / 7 filtered|未接入控制注册表|
|原始源码、原环境，第3次|3.868163|1 pass / 7 filtered|未接入控制注册表|
|原始源码、私有空缓存、正常注册表|5.390035|1 pass / 7 filtered|缓存新增 yaml@2.9.1、npm 元数据|
|原始源码、无响应头注册表|74.061544|1 pass / 7 filtered|2次 /yaml；未稳定复现|
|原始源码、响应体不完成注册表|90.434415|0 pass / 1 fail / 7 filtered|1次 /yaml，ready timeout|
|临时补齐 yaml、同类阻塞注册表|2.171814|1 pass / 7 filtered|0 请求|
|临时补齐 yaml、完整文件第1次|16.730112|8 pass / 0 fail / 0 skip，71 assertions|0 请求|
|临时补齐 yaml、完整文件第2次|17.264975|8 pass / 0 fail / 0 skip，71 assertions|0 请求|
|撤回补齐、响应体不完成注册表|90.406325|0 pass / 1 fail / 7 filtered|1次 /yaml，同一 ready timeout|

临时修改下 `bun run typecheck`：exit 0，1.408622 秒。两次全文件的完整 testcase 身份与上轮未修改原始文件的全量诊断身份一致，均为八个案例。精确结果和失败日志见同目录 XML/log/summary JSON。

## 源码因果链

1. `tests/harness-dock/model-cost-modes.test.ts:47-54` 的 `materializeModelCostSource` 把 adapters/framework/model-cost/OMP entrypoints 复制到 OS 临时目录，只移除共享配置；没有复制 node_modules/yaml。
2. `framework/core/config.ts:28` 从裸包名 `yaml` 导入 `parse`。临时源码不在仓库 node_modules 的祖先目录下。
3. `model-cost-modes.test.ts:283-322` 将该临时 entrypoint 交给真实 `ControlledSession.start`，并设置每场景独立 HOME/USERPROFILE。
4. `tests/harness-dock/session.ts:119-151` 启动真实 Bun CLI，并等 ready；`335-360` 的 waiter 在应用启动未完成时持续等待。
5. 执行 Bun 1.4.4 的 `bun --help` 明确列出默认 runtime auto-install 行为，以及 `--no-install`。新私有缓存实际产生 yaml 安装、受控 registry 实际收到 /yaml，补足了静态推断以外的运行证据。
6. 已有仓库模式可直接复用：`tests/workflow-chat/support/manager-dock.ts:35` 显式复制 yaml；`tests/harness-dock/consumer-regression.test.ts:100-107` 将部署放在仓库 cache 下以保留依赖祖先解析。

官方注册表环境配置参考：https://bun.com/docs/pm/cli/install （Environment Variables 中的 `BUN_CONFIG_REGISTRY`）。以实际安装 Bun 版本帮助和本轮观察为执行证据，不将最新文档当作历史版本源码证明。

## 临时单变量干预

只在诊断 worktree 的 materializeModelCostSource 中、移除 config.yaml 前加入：

```ts
cpSync(path.join(REPO_ROOT, "node_modules", "yaml"), path.join(source, "node_modules", "yaml"), { recursive: true });
```

未移动源码部署位置、未改变 HOME、未过滤 runtime 目录、未调整宿主/并发/时钟/超时/请求/断言。上述其他潜在改善都没有混入因果试验。验证后精确删除该行，完成 A(红)–B(绿)–A(红) 闭环。

## 修复建议与保留条件

建议下一步正式修复仅让该临时部署携带从仓库已安装依赖复制的 yaml，复用已有夹具模式。不要改为让测试先访问 npm，不要增加 retry 或延长 ready timeout，不要使用共享可变 session/home。

|保护的承诺|必须保留|本次证据|
|---|---|---|
|真实模型执行、隐藏/预算/币种/切换场景|全部六个真实宿主场景及两例 publication polling|完整八例身份一致，71条断言，两次通过|
|真实模块装配与配置读取|生产源码和真实 yaml 实现，缺省共享配置仍移除|仅复制既有 yaml 包，未 mock parser/host/model|
|会话与持久化隔离|每例独立 run root、HOME、存储、capture、清理|原 fixture 逻辑未改|
|启动失败与 deadline|原90000ms、真实进程和失败清理|干预前和撤回后同样超时；未吞错|

本轮没有永久修复，没有新增永久测试，也没有跑新的全仓验收；不能宣称全仓稳定性已经修复或全仓提速。完整多worker/其他平台/所有历史超时的归因仍未验证。最后进程快照未发现命令行引用诊断 worktree 的 Bun/Node 遗留进程；此观察不证明所有可能的 detached 子孙关系。
