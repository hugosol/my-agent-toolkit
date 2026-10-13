# 03 — 公共 HTTP 代理与正文超时：自动证据与真实贯通

Ticket: [`implementation/03-http-proxy-body-timeout.md`](../implementation/03-http-proxy-body-timeout.md)（P54、P55）。
2026-10-13 本会话实际执行记录（retry）。每行都是已运行命令与其观察结果，不是支持声明、真实 provider 结果或人工验收。

## 本次 retry 修的是什么

上一轮的真实 smoke 证明：公共 `request` 的默认传输是进程的 `globalThis.fetch`，而 Bun 1.4.2 的 `fetch` **不兑现 `proxy: false`**——存在环境代理变量时，显式直连仍然走环境代理（上轮记录同样现象；本轮重跑复现，见下方故障注入）。这使 P54「显式路径被兑现」在真实传输层面不成立，属明确失败。

本轮把默认传输换成**本运行时自己的 `node:http`／`node:https` 客户端**：连接地址由本模块决定（直连即目标，命名代理即该代理自身地址），不读也不写任何环境代理名；HTTP 目标经代理由绝对 URL 表达，HTTPS 目标经 CONNECT 隧道（代理自身地址为 `https://` 时到代理的连接本身是 TLS），隧道之上再做目标 TLS。公共面不变：仍是单一 `request(url, options)`，返回原生 `Response`，非 2xx 正常返回，传输／超时／正文读取失败分别 reject，无业务 envelope、无自动 JSON／Bearer、无主动取消。

## 交付内容与落点

| 位置 | 内容 |
| --- | --- |
| [`framework/modules/http.ts`](../../../framework/modules/http.ts) | 公共 `request(url, options)`、`HttpRequestOptions`、`HttpConfigurationError`、模块内注入 seam `createHttpModule`；**新的默认传输**：`node:http`／`node:https` 客户端 + `TunnelAgent`（CONNECT 隧道复用已建连接）+ 预算驱动的连接销毁与正文流；共享 `framework/config.yaml` 的按需读取与校验 |
| [`framework/public.ts`](../../../framework/public.ts) | 公开面不变（`request`、`HttpConfigurationError`、`HttpRequestOptions`）；导出列表未变，故未新增／重钉任何 export 断言 |
| [`tests/framework/http.test.ts`](../../../tests/framework/http.test.ts) | 18 个永久用例，传输为注入 double，零网络；本轮未改（seam 与公共面未变） |
| [`scripts/http-transport-smoke.ts`](../../../scripts/http-transport-smoke.ts) | 重写的隔离真实 smoke：明文目标、TLS 目标、明文代理、HTTPS 代理、截断正文目标、环境代理陷阱，以及一个**独立子进程**（spawn 时即带代理环境），18 项观察 |
| [`tsconfig.json`](../../../tsconfig.json) | `scripts` 纳入 typecheck（上一轮 smoke 曾因未纳入而静默通过类型错误；现已验证：注入一行类型错误会报 TS2322，删除后恢复 0 errors） |
| 文档 | [`framework/docs/framework-capabilities.md`](../../../framework/docs/framework-capabilities.md#general-http-module)（响应语义、路由兑现方式、smoke 覆盖面）、[`docs/adr/0002-semantic-extension-framework.md`](../../../docs/adr/0002-semantic-extension-framework.md)（实施记录补传输事实）、模块头注释（为何不用 `fetch`、HTTP/1.1 与不代理解码、重定向是普通应答） |

## 逐 criterion 的支撑

| Ticket 验收项 | 支撑 |
| --- | --- |
| 单一公共 `request`：请求值默认 GET、原生 response、非 2xx 正常返回、传输／超时／正文读取失败分别 reject、无 envelope／自动 JSON／Bearer | `tests/framework/http.test.ts` → the request call（5 例）；smoke 第 3–5（代理路由与 method／headers／body 原样到达）、第 10（404 返回）、第 11–13（预算与截断正文分别 reject） |
| `proxy:false`／省略明确直连；命名项来自共享 `http.proxies`；HTTP／HTTPS 代理连接协议；缺失／非法／不可读配置与代理连接失败绝不直连重发 | `http.test.ts` → the proxy path（6 例，含 12 种不可满足选择的逐一拒绝）；smoke 第 1–3、5（明文代理绝对 URL、HTTPS 代理 TLS 连接）、第 6–7（CONNECT 隧道）、第 9（拒绝连接后目标零新增请求）、第 16（缺配置拒绝且不发请求） |
| 不依赖／修改全局代理环境，不接管宿主推理／OAuth 网络，不新增主动取消能力 | 传输由本模块自己的客户端建立连接、不读环境；smoke 全程把 `HTTP_PROXY`／`HTTPS_PROXY`／`ALL_PROXY` 及小写共 6 个名字指向一个真实监听的陷阱，第 1、2、8、18 项观察陷阱零请求，第 17 项在**独立进程**（spawn 时带同一环境）里经公开入口 `request` 验证省略／false／HTTPS 目标均到目标；公共面无 signal／controller 出口 |
| 超时优先级请求值→共享 `http.defaultTimeoutMs`→30000ms，正整数、0 与非法值拒绝，预算覆盖响应头与正文读取、不覆盖完整正文后的业务计算 | `http.test.ts` → the wait budget（7 例，按真实 signal 到期时间测量）；smoke 第 11（正文未到即超时，TimeoutError@202ms）、第 12（更大预算下同一正文到达）、第 14（共享默认 300ms）、第 15（内置 30000ms，实测约 30.0s 后 reject） |
| 永久网络用例全用 mock；隔离本地目标与 HTTP／HTTPS 代理真实 smoke 验证连接协议、路由兑现及无直连重发 | `http.test.ts` 零网络（注入 double）；smoke 全部 loopback，明文／TLS 两套代理与真实目标记录 hop |
| 本地延迟响应头／正文 smoke 验证正文预算、非 2xx 返回与读取失败，报告观察结果而非参数转发断言 | smoke 第 10（404 正常返回）、第 11（延迟正文＋小预算 → `TimeoutError`）、第 12（同正文在大预算下到达）、第 13（声明 4096 字节只发 17 字节 → 读取 reject）；每项都打印目标／代理的真实记录 |
| 通过批准的生产公共 seam 观察，预期来自合同／独立字面值／手算 | 观察在模块公共调用上（`createHttpModule` 注入真实目标地址与临时共享文件；第 17 项走 `framework/public.ts` 的公开 `request`）；断言用独立字面值（`GET http://…/ok HTTP/1.1`、`CONNECT 127.0.0.1:… HTTP/1.1`、状态码、`/ok`、时钟读数），无一处重算实现 |
| 隔离安装／配置／工作／Session／数据根，不操作正式 OMP，承接异步失败并保留脱敏证据 | smoke 只用 `mkdtemp` 临时根与 `127.0.0.1`；仓库零写入、无凭据、无真实 provider；异步拒绝全部由 `timed()`／`catch` 承接；子进程 stdout／stderr 与退出码被读取并打印 |

## 实际运行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 0 errors（含新纳入的 `scripts`；注入一行类型错误时按预期报 TS2322；纳入后确实抓到过本轮 smoke 里一处真实类型错误并已修复） |
| `bun test tests/framework/http.test.ts` | 18 pass / 0 fail，80 expect，556ms |
| `bun test tests/framework` | 309 pass / 0 fail，27 files，11.0s |
| `bun run smoke:http-transport` | **18 passed / 0 failed / 0 observation(s)**，exit 0，31.4s（其中 30.0s 是内置预算那项的真实等待） |
| `bun test`（全仓） | 见下方“全仓基线” |

## smoke 观察（`bun run smoke:http-transport` 原样输出，最终交付形态的这一次运行）

```text
PASS  an HTTPS target is reached through the HTTPS proxy's CONNECT tunnel — the TLS proxy was handed "CONNECT 127.0.0.1:7355 HTTP/1.1"; the client read reached=/ok back
PASS  an HTTPS target is reached through the plain proxy's CONNECT tunnel — the proxy was handed "CONNECT 127.0.0.1:7355 HTTP/1.1"; the client read reached=/ok from the TLS target
PASS  an omitted proxy connects directly — status 200; the target recorded "/ok" with hop null; the proxy recorded 0 request(s) and the ambient trap 0
PASS  proxy: false connects directly — status 200; the target recorded hop null; the proxy recorded 0 request(s) and the ambient trap 0
PASS  a named entry is carried by the HTTP proxy, over plain TCP — the proxy was handed "GET http://127.0.0.1:7350/ok HTTP/1.1"; the target served it with hop http-proxy:7353; the client got the target's answer back through http-proxy:7353
PASS  the caller's method, headers and body arrive through the proxy exactly as prepared — the target recorded POST body {"sessionId":"one"} with sentinel sentinel-value; the answer echoed body {"sessionId":"one"}
PASS  a named entry is carried by the HTTPS proxy, over TLS — the TLS proxy was handed "GET http://127.0.0.1:7350/ok HTTP/1.1"; the target served it with hop https-proxy:7354; the plain HTTP proxy saw nothing
PASS  an HTTPS target with no proxy reaches the target under an ambient HTTPS_PROXY — status 200; the client read reached=/ok; the ambient trap (HTTPS_PROXY=http://127.0.0.1:7352) recorded 0 request(s)
PASS  a refused proxy fails the request and is not re-sent direct — rejected Error: connect ECONNREFUSED 127.0.0.1:1 after 1ms; the target recorded 0 new request(s)
PASS  a non-2xx answer comes back for the caller to interpret — resolved (status 404) after 2ms
PASS  the wait budget covers reading the body — rejected TimeoutError: The operation timed out. after 202ms (the target sent its head at once and its body after 600ms)
PASS  the same body arrives under a budget large enough for it — resolved (status 200) after 606ms
PASS  a body that stops before its end fails the read — rejected Error: aborted after 4ms (the target declared 4096 bytes and sent 17)
PASS  the shared http.defaultTimeoutMs is the budget of a real request — rejected TimeoutError: The operation timed out. after 302ms (the file declares 300ms)
PASS  the built-in budget is what a request with nothing declared waits — rejected TimeoutError: The operation timed out. after 30007ms
PASS  a selection with no shared file is refused, not turned into a direct request — rejected HttpConfigurationError: the request selects the proxy "loopback", but the shared configuration file "...\absent.yaml" does not exist after 0ms; the target recorded 0 new request(s)
PASS  a separate process under a spawn-time proxy environment still reaches the target directly — the child exited 0, the target recorded 2 request(s) with hops null/null, the ambient trap recorded 0 request(s), and it printed: environment HTTP_PROXY=http://127.0.0.1:7352 HTTPS_PROXY=http://127.0.0.1:7352 | omitted: status 200 body {"reached":"/ok"} | proxy: false: status 200 body {"reached":"/ok"} | omitted, an HTTPS target: status 200 body {"reached":"/ok"}
PASS  no request in this run was carried by the ambient proxy environment — the trap at http://127.0.0.1:7352 recorded 0 request(s) while HTTP_PROXY, HTTPS_PROXY and ALL_PROXY pointed at it

SMOKE SUMMARY: 18 passed, 0 failed, 0 observation(s)
```

读法（传输证明，不是参数转发）：第 1–2 项同时观到三件事——目标真实服务了该请求、记录的 hop 为 null、两个代理与环境陷阱各收到 0 个请求，而陷阱此刻正被 6 个环境名指向且真实监听；第 3、5 项观到代理侧收到的那一行请求（绝对 URL）与目标侧记录的该 hop 标记，即请求确实经由该代理那条连接到达；第 6–7 项观到 `CONNECT host:port` 请求行与隧道之上读回的目标答案；第 9 项失败后目标零新增，即没有直连重发；第 11／12 与第 13 项把“预算覆盖正文”和“正文读取失败”分别变成真实读数与真实拒绝；第 15 项把内置 30000ms 从字面值变成 30007ms 的真实等待；第 17 项在独立进程里验证同一承诺。（本次输出里两条 CONNECT 观察先打印：它们由 socket 事件完成，打印顺序不构成判定。）每次运行端口与毫秒读数都不同，形状与判定相同：修复后四次运行均 18 passed / 0 failed / exit 0，各约 31.4 秒（其中约 30.0 秒是内置预算那项的真实等待）。

## 故障注入（新证据是否抓得到上一轮的失败）

| 注入的缺陷 | 观察 |
| --- | --- |
| 把默认传输换回上一轮的 `globalThis.fetch`（其余不动） | smoke 第 1、2 项立刻 FAIL：`the proxy recorded 0 request(s) and the ambient trap 1`——环境代理真的拿走了显式直连的请求（上一轮 P54 失败现象的复现），随后第 8 项以未捕获 `TypeError: Unable to connect` 中止脚本、exit 1。还原后重跑：18 passed / 0 failed / exit 0 |

即：本票的真实证据对“显式直连被环境代理劫持”这一缺陷有感觉；上一轮之所以判失败，正是因为当时该现象被记为 NOTE 而非缺陷。

## 备选传输的评估（为什么是这一个）

| 途径 | 观察 |
| --- | --- |
| 进程的 `globalThis.fetch`（上一轮的实现） | 命名代理能兑现（`proxy: "<url>"` 时请求确实到该代理），但**直连不能**：环境代理存在时显式 `proxy: false` 仍被环境代理接走——这正是上一轮的失败，故弃用 |
| `http.request` 的 `createConnection` 选项（先把隧道 socket 交给它） | 本机 Bun 1.4.2 下 CONNECT 请求不再发出 `connect` 事件（探针实测挂住），不可用 |
| `http.Agent` 子类在 `createConnection()` 里返回已建 socket | 实测可行：CONNECT 隧道成立、隧道之上 TLS 握手成立、隧道之上普通请求读回目标应答；即当前实现（`TunnelAgent`） |
| 平台标准 `Response` | 保留：传输把运行时自己的响应（状态、状态文本、头、正文流）装配成原生 `Response`，不另建业务结果类型；正文用 `ReadableStream` 承载并带背压，预算到期时以等待自身的原因（`TimeoutError`）终结读取 |

## 未验证／限度（不得当作通过）

- 未接触真实 provider、真实凭据或任何人工项。真实 HTTPS 目标由 loopback 上自签证书的 Bun.serve 承担，本进程对它关闭了证书校验（`NODE_TLS_REJECT_UNAUTHORIZED`，仅本 smoke 进程／其子进程，属该进程自己的信任而不是路由）；生产传输不做该开关。
- CONNECT 隧道已在本机真接（明文代理与 HTTPS 代理各一次，隧道之上完成目标 TLS 并读回目标应答），但没有对着真实 provider 的代理链跑过。
- 未提交生产 `framework/config.yaml`：共享配置属于机器；缺文件时直连照常、命名代理报配置错误，两侧均已实现并验证（`http.test.ts`「no file at all」「a file that declares nothing」；smoke 第 16 项）。
- 内置 30000ms 的精确值由 smoke 实测（30007ms）证明；永久用例只证明“未施加更短的期限”（单元测试不等待 30s）。
- 传输为本运行时自己的 HTTP/1.1 客户端（不协商 h2），且不添加 `accept-encoding`、不代理解码：调用方若自行声明压缩编码，读到的是原始字节并由响应的 `content-encoding` 说明；已写入模块与能力文档。当前 in-scope endpoint 不涉及 h2-only 服务。
- 代理 URL 中的凭据不参与（配置形状只有 `url`）：需要代理鉴权的代理会以 407 之类的真实失败暴露，不会静默换路；未新增代理鉴权能力。
- P52／P58 等具名责任按各自票执行；本票未迁移任何 HTTP 消费者（当前无生产消费者导入 `request`）。

## 全仓基线

| 命令 | 结果 |
| --- | --- |
| `bun test`（全仓，改动冻结后） | **495 pass / 4 fail**，499 tests，58 files，119.9s |

四个失败与本票无关，均为改动前就存在的历史失败，且不在本票触及的文件内：

- `the protocol the actual omp-bot panel receives is the frozen one (P23) > a whole session …`（`tests/connect-bot/budget-regression.test.ts`，20.2s）
- `an unregister that never arrives leaves the row to the panel's own window (P25) > the blocked row stays registered and goes offline by the 30s window …`（`tests/connect-bot/panel-registration-lifecycle.test.ts`，15.0s）
- `baseline record > the checkout is at the recorded revision anchor`（`tests/harness-dock/baseline.test.ts`，锚点漂移）
- `baseline record > the run artifact stays byte-identical to the anchor for the recorded contract files`（同上，字节一致性漂移）

即：本票没有带来新的失败，也没有把上述历史失败说成通过。框架套件本身 `bun test tests/framework` 为 **309 pass / 0 fail**，本票自己的 `tests/framework/http.test.ts` 为 **18 pass / 0 fail**。
