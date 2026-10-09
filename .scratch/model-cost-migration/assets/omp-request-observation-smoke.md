# OMP 请求／响应观测链路探针

## 环境与验证边界

2026-10-09，运行 repo Harness dock 的 OMP 18.5.0 隔离 exact install，真实 RPC CLI、provider 注册与原生扩展回调。每个场景独立临时 session／agent state；本地 OpenAI-compatible SSE endpoint 返回确定性内容、唯一响应头请求 ID 与非零 usage。不访问远端 provider 或真实凭据，不修改生产实现／正式宿主配置。

一次性观察扩展记录实际 sessionId、agent 身份、模型、上下文、钩子字段与 assistant 消息。驱动运行正常请求、工具后续请求、首次 503 后成功、流式中途取消四场景；四场景均运行完成，host stderr 为空。正常／工具／重试的 prompt_result 为 completed，取消为 aborted，均 sessionSettled=true。首轮输出含大段请求体，预览不足以读完整关联；精简输出后复跑同四场景取得以下完整证据。两轮临时运行目录均 finally 清理，探针文件调查后删除。

这是原生可用性调查，不是新的 framework turn_start／turn_end、Turn ID、账本或当前事实读取接口的实现／验收。fixture 用量不是远端账单；未证明币种、非零模型价格、实际 reasoning Effort、账户身份或全部 provider 等价支持。

## 实际观察

| 场景 | endpoint 实际 HTTP 请求 | before_provider_request | after_provider_response | assistant message_end | 结果 |
| --- | --- | --- | --- | --- | --- |
| 正常 | 1 | 1 | 1，200，wf-normal-1 | 1，stop | input=10, output=7, cacheRead=3, totalTokens=20 |
| 工具后续请求 | 2 | 2 | 2，wf-tool-1／wf-tool-2 | 2，toolUse／stop | 第一份 10／7／3／20，第二份 20／14／6／40；工具消息不作为 assistant usage |
| 首次 503，随后成功 | 2 | **1** | **1，仅最终 200，wf-retry-2** | **1，最终成功响应** | 最终 usage=20／14／6／40；503 的 wf-retry-1 不出现在扩展响应回调 |
| 流式取消 | 1 | 1 | 1，200，wf-cancel-1 | 1，aborted | provider 的终结 usage chunk 尚未交付时中止；宿主消息却有四路及 totalTokens 全零的 usage |

所有消息 usage 的 cacheWrite=0，catalog cost 四路为 fixture 的 0。正常／工具的非零 token 分桶在驱动中有断言；工具场景实际执行内置 bash 的 bun --version 并发出第二次模型请求。重试场景断言首请求 503、最终请求 200；取消在 endpoint 收到请求后通过真实 RPC abort 触发，不把停止流看作模型正常完成。

## 关联与生命周期细节

- before_provider_request 载荷 keys 只有 type／payload，无 requestId；context 有本次模型与实际 sessionId。
- after_provider_response keys 为 type／status／headers／requestId／metadata；成功请求的 x-request-id 被映射为 requestId。
- assistant message_end 中 responseId 是 SSE 的 chatcmpl-wf-…，不是 headers 的 wf-…；消息没有 requestId。这两个外部 ID 不能直接假定相等。
- 单实际 session 的上述正常链按 before → after → assistant message_end 顺序可见；身份仍需 adapter 建立，不能把此有限场景称为所有异常／并发路径都已认证。
- 工具场景第一份 assistant message_end at=1791544862466，原生 turn_end at=1791544862592，后者在工具执行及 toolResult 之后。原生 turn_end 包含 toolResults，不等于已经批准的“不含工具执行”的 framework Turn 结束位置；adapter 应以已批准语义选择映射，不照搬同名钩子。
- 取消的 assistant message_end stopReason=aborted；消息里存在全零 usage 并不证明 provider 报告了零消费。此次已知 endpoint 没有交付 usage chunk，故不能将此记录标为已确认零。不能由此反推所有取消的零 usage 都缺失；仍需来源证据区别真实零和宿主默认值。
- 503 重试发生在扩展钩子以下：实际网络尝试数不等于 before 钩子数。只复用这三个扩展钩子无法逐次记录所有网络重试或每次网络发出的实际时刻。若公共 Turn 只采用可观察模型调用周期，必须用户明确确认其与“每次实际 HTTP 尝试”的区别，不默改既有逐请求原则。

## 当前上下文与 Effort 读取

本次非 reasoning fixture 的 getThinkingLevel 返回 undefined（日志为 null），只证明缺失可以出现，未验证实际生效 Effort。

正常场景 getContextUsage 在 assistant message_end 为 tokens=6406，随后原生 turn_end 为 tokens=13；工具第一响应的 message_end 为 6411，原生 turn_end 为 21；第二响应分别为 24／26。这说明即时读数会随宿主处理阶段更新，不能把任意回调中的当前快照视作稳定请求 usage 或最新 provider 上下文。当前事实刷新／可用性需按既有刷新票处理，不把累计 token 当上下文占用。

## 未验证

本探针未运行子代理请求（此前子代理 Round 资产另有证据）、多 main 并发、模型／账户切换、长时间工具、失败后外层重试、无终结 chunk 的正常断流、恢复重放、迟到 usage 补齐、Codex 原生 transport、其他 provider、实际 reasoning Effort 或外部账单核对。没有增加永久测试或生产代码。
