# 12 — DeepSeek 余额成功 TTL 与在途合并：自动证据与真实贯通

Ticket: [`implementation/12-deepseek-balance-ttl.md`](../implementation/12-deepseek-balance-ttl.md)（P38，seam S2／S5）。
2026-10-13 本会话实际执行记录。每行都是已运行命令与其观察结果，不是支持声明或人工验收。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`extensions/model-cost/shared-logic/provider-balance.ts`](../../../extensions/model-cost/shared-logic/provider-balance.ts) | 新业务 Module：一个进程一份 DeepSeek 读数（CNY total ＋ 接纳时间），成功 TTL（默认 30000ms）＋ 在途合并 ＋ 失败保旧值的调度；公共 HTTP 直连、5000ms 业务预算、按当次宿主凭据／地址取 `<base 去尾 /v1>/user/balance`、缺地址用 `https://api.deepseek.com`；解析 DeepSeek 文档化 `balance_infos` 的 CNY `total_balance` |
| [`extensions/model-cost/shared-logic/runtime.ts`](../../../extensions/model-cost/shared-logic/runtime.ts) | 新输入 `providerAccess`／`now`／`httpRequest` 与配置 `balanceTtlMs`（缺失即默认）；`turn_end` 里按**请求自身 provider** 触发 `usageSettled`；`presentation` 传入 balance；`cleanup` 同时 dispose |
| [`extensions/model-cost/shared-logic/presentation/display.ts`](../../../extensions/model-cost/shared-logic/presentation/display.ts) | S2 只读面新增 `ConsumptionPresenter.balance()` 与 `balanceText()`（失败写成事实、不写零、不带货币符） |
| [`extensions/model-cost/harnesses/omp/widget.ts`](../../../extensions/model-cost/harnesses/omp/widget.ts) | widget 末行显示余额／失败（失败只显示、不弹通知） |
| [`extensions/model-cost/definition.ts`](../../../extensions/model-cost/definition.ts) ＋ [`config.yaml`](../../../extensions/model-cost/config.yaml) | 声明并随包 `balanceTtlMs: 30000`（既有扩展 YAML 机制，无平行解析） |
| [`framework/core/protocol.ts`](../../../framework/core/protocol.ts) ＋ [`assembly.ts`](../../../framework/core/assembly.ts) ＋ [`behaviors/binding.ts`](../../../framework/behaviors/binding.ts) ＋ [`public.ts`](../../../framework/public.ts) | 批准的小访问 Interface：`ProviderAccess`／`ProviderAccessFacts`（每次操作读取、无原生对象、非快照），`HarnessPort.providerAccess` → `ImplementationContext.providerAccess` |
| [`framework/adapters/omp.ts`](../../../framework/adapters/omp.ts) | 按需映射：只命名 `modelRegistry.getProviderBaseUrl` 与 await 的 `getApiKeyForProvider`；keyless sentinel `"N/A"` 映射为无凭据；不镜像 registry |
| 文档 | [`framework-capabilities.md`](../../../framework/docs/framework-capabilities.md)（能力与 exports）、[`extensions/model-cost/GLOSSARY.md`](../../../extensions/model-cost/GLOSSARY.md)（Provider balance reading）、模块头注释 |
| 测试 | [`tests/model-cost/provider-balance.test.ts`](../../../tests/model-cost/provider-balance.test.ts)（S2，12 例）、[`tests/harness-dock/model-cost-balance.test.ts`](../../../tests/harness-dock/model-cost-balance.test.ts)（S5，2 例）、`tests/framework/turn.test.ts` 新增 provider access 映射 3 例、`tests/harness-dock/capture-server.ts` 增加 `/user/balance` 脚本应答与 `balanceCalls()` |

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 按真实请求 provider 的 usage 触发成功 TTL（默认 30000ms，YAML 可配）；过期且无在途才查；不因到点／活动开始／终轮／切换查 | S2：`一个 settle 的 DeepSeek 请求检查成功 TTL` 5 例——边界 29999ms 不查／30000ms 查（期望＝成功时刻＋30000，手算自本文件时钟）、配置 1000ms 生效、TTL 自身过期＋时间快进 10,000,000ms 零请求、非本 provider 零请求、round_start／session_facts／round_end 各零请求 |
| 同实例触发合并在途、完成不补发；成功更新时间与读数；失败保留旧值与旧时间、不冷却／不重试、后续 usage 可再试 | S2：在途 1 次请求被 3 个后续 usage 复用（sent 仍 1）；完成后 sent 仍 1；失败（连接拒绝／503／无 CNY 段落）时 `reading` 与其 `obtainedAt` 逐字不变且 `failure` 另记，随后下一个 usage 立即再查并成功 |
| 余额经公共 HTTP 直连、业务预算 5000ms；按当次宿主凭据／base URL 去尾 `/v1` 后余额路径；缺地址用批准默认；不借其他凭据 | S2：首个用例逐字断言 `{method:"GET", headers:{authorization:"Bearer key-one"}, timeoutMs:5000, proxy:false}` 与 `https://host.example/user/balance`（host base `…/v1`）；`…/api/` → `…/api/user/balance`；无地址 → `https://api.deepseek.com/user/balance`；`resolve` 调用序列＝`["deepseek"]`；无凭据 → 不发送任何请求并记 `no-access` |
| 通过生产 S2 结果／变化订阅 ＋ 公共依赖受控时间验证；永久网络 tests mock；捕获次数证明无轮询／补发 | 全部 S2 用例走生产 runtime ＋ 框架公共绑定（port double），只读 `runtime.presentation.balance()`，HTTP 为注入的同形 call（记录每次 url／options），时钟为受控输入；`view.subscribe` 收到变化通知（成功 1 次、失败 1 次）；无固定时长等待 |
| 通过批准的生产公共 seam 观察，预期来自规格／独立字面值／手算 | URL 规则、5000ms、30000ms、`Bearer <credential>` 均为规格与文档化协议的字面值；余额文档形如 `{"balance_infos":[{"currency":"CNY","total_balance":"110.00"}]}` 来自 DeepSeek 公开 API 文档（[Get User Balance](https://api-docs.deepseek.com/api/get-user-balance)），非被测实现重算 |
| H2：脱敏余额结果或跳过原因 ＋ 正常 usage 观察方法 | 见下节；真实效果仍待用户 |
| 隔离安装／配置／工作／Session／数据根，不操作正式 OMP；承接异步失败并保留脱敏证据 | S5 两例走 dock 隔离 install ＋ `mkdtemp` run root（agent state／session／work／capture／user-home 全在其中），`models.yml` 只改隔离 provider 的 baseUrl／apiKey（`dock-key`，非秘密）；S2 全部 `mkdtemp` root。未读写任何真实秘密，未触碰正式 OMP |

## 实际运行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 0 errors |
| `bun test tests/model-cost/provider-balance.test.ts` | 12 pass / 0 fail，37 expect |
| `bun test tests/framework/turn.test.ts` | 16 pass / 0 fail（含新增 provider access 映射 3 例） |
| `bun test tests/model-cost` | 122 pass / 0 fail，10 files |
| `bun test tests/model-cost tests/framework` | 496 pass / 0 fail（41 files） |
| `bun test tests/harness-dock/model-cost-balance.test.ts` | 2 pass / 0 fail，13 expect，3.6s（隔离真实宿主） |
| `bun test`（全仓） | **708 pass / 4 fail**，712 tests，80 files，211.6s；4 个失败与本票无关且改动前即存在（[`.cache/full-suite.log`](../../../.cache/full-suite.log) 与 08 号证据同一记录）：2 个 `harness-dock/baseline.test.ts` 记录基线失败（本机 `oh-my-pi` checkout 停在 `579da1d…`）、2 个 connect-bot 真实面板超时 |
| 还原后复跑 `bun test tests/model-cost tests/framework` ＋ `bun test tests/harness-dock/model-cost-balance.test.ts` | 496 pass / 0 fail；2 pass / 0 fail（注入全部还原，无残留） |

## 故障注入（green 后的证据复核）

在被测实现上做定点改动（`edit` 注入 → 复跑 → 还原），确认用例真的能抓住对应违规：

| 注入 | 观察 |
| --- | --- |
| `usageSettled` 去掉成功 TTL 新鲜度判断（`if (false && …)`） | 2 fail / 10 pass：`the TTL boundary is the success instant plus 30000ms…` 与合并用例中的 TTL 内复检失败 |
| 去掉 `if (querying) return;` 在途守卫 | 1 fail / 11 pass：`triggers arriving while a query is out join it…` 失败 |
| 失败路径改成同时清空 `reading` | 1 fail / 11 pass：`a rejected transport leaves the reading and its obtained instant untouched…` 失败 |
| 适配器不再把 keyless sentinel 映射为无凭据 | 1 fail / 15 pass（`turn.test.ts`）：`the keyless sentinel is no credential…` 失败 |

## S5 真实宿主 smoke 观察（脱敏）

`bun test tests/harness-dock/model-cost-balance.test.ts`（隔离 18.5.0 install ＋ 本机捕获端点）：

- **成功路径**：真实 RPC 会话发一次 `deepseek/deepseek-flash` 请求 → 扩展按该请求 provider 触发余额查询 → 捕获端点在 `GET /user/balance` 收到 1 次调用，`authorization: Bearer dock-key`（隔离 run 自己的 fixture 键）→ widget 显示 `Balance: ¥110.00`（端点脚本金额，非真实账户）→ 第二次 exchanged 仍在 30000ms TTL 内，`balanceCalls()` 仍为 1、`requests()` 为 2（无轮询、无补发）。
- **失败路径**：捕获端点对 `/user/balance` 答 503 → widget 显示 `Balance: unavailable (unreadable)`，stderr 为空、无 notify 帧，模型 exchange 仍 `completed`（失败不阻断、失败不冒零）。

## H2 材料：真实 DeepSeek 余额最终效果的观察方法（待用户）

本会话未读取任何真实凭据、未访问真实服务。用户侧观察步骤与预期：

1. 在正式环境加载本扩展（`extensions/model-cost/config.yaml` 的 `storageDir` 与 `balanceTtlMs` 按需设置），确认宿主已登录 DeepSeek（其 base URL 与 API Key 由宿主解析，扩展不读取、不落盘）。
2. 正常发一条 DeepSeek 请求：usage 返回后应出现余额查询（真实端点 `<宿主 base 去尾 /v1>/user/balance`），widget 末行出现 `Balance: ¥<真实余额>`；随后 30s 内的下一次请求不再查询（TTL 内）。
3. 断开／改错凭据后再发请求：应显示 `Balance: unavailable (no-access)`（或 `unreachable`），且**旧读数与旧时间保留**、无自动重试风暴。
4. 跳过原因：本机若未配置 DeepSeek 凭据／地址，则第 2 步预期为 `Balance: unavailable (no-access)`——这是“缺地址用批准默认 + 不借其他凭据”的既定行为，不是通过，也不等于真实效果已验证。

## P58／P52 具名责任

- **P58（受影响消费者迁移后原协议不变）**：本次公共面变更为加法与同票迁移 —— `ConsumptionPresenter` 新增 `balance()`（现有 `of(target)` 未变）、`ImplementationContext`／`HarnessPort` 新增 `providerAccess`、extension 配置新增声明字段 `balanceTtlMs`。调用方已在本票内迁移：装配（`harnesses/omp.ts`）、port double、`tests/model-cost/storage-root.test.ts` 的声明断言与 6 个 S2／storage 套件的 config reader、dock 的 capture server（新增 `/user/balance` 脚本应答，既有 `/models`、completions 路径未改）。模型记账、Owner／State、prompt／历史与既有命令效果未改；`tests/framework`、`tests/model-cost`、dock 既有套件全部通过（见上表）。
- **P52（持久文档只含批准 schema，不增加账本）**：余额读数只存在于进程内存（`provider-balance` 的闭包），不落盘、不进 `consumption.json`、不新增字段或第二套权威；本票未改消费文档 schema。

## 未验证与限制

- **真实 DeepSeek 余额最终效果**属 H2，按上文材料交用户确认；本轮只有隔离脚本应答与受控 mock 证据。
- **`/user/balance` 的响应形态**来自 DeepSeek 公开 API 文档（独立来源），未对真实服务运行验证；永久测试用该文档的自造文档。
- **真实宿主上余额告警色（<10／<5 元）**属展示票的视觉部分，本票只交付读数与文本行，未实现颜色告警。
- **真实 OMP 的 registry 行为**（凭据刷新／keyless sentinel）只按隔离 18.5.0 源码结构与 dock 覆盖验证；正式环境未运行。
- 本票不改变任何承诺；P38 是否完成仍由承诺完成情况、全部必需检查与人工确认共同派生。
