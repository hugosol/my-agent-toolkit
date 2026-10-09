# 旧 model-cost 的等待与后台刷新行为

## 源码事实

源：E:/Developer/myhub/my-omp-toolkit/extensions/model-cost/index.ts，当前读取的源码，不宣称冻结迁移 revision。

- before_provider_request（682–693）：同步读取 holiday、锚定请求价格并请求 widget 更新；不 await 网络、不执行 recordTurnCost。
- assistant message_end（696–714）：同步 getMessageUsage／addMessageCost；Codex 缓存过期时 void refreshChatGPTUsage(ctx)，不等待额度 API。该路径沿用 30 秒 TTL。
- refreshChatGPTUsage（426–438）：已有 Promise 则复用，完成后 apply snapshot、finally 清 Promise；合并并发刷新。
- refresh（348–374）：注册 widget render，不主动发起余额／额度网络请求。
- agent_start（666–668）await initializeForModel；初始化（476–507）在缓存过期时 await DeepSeek 余额或 Codex 刷新。
- agent_end（717–801）：Codex await 强制额度刷新；DeepSeek await daily.recordTurnCost，再 await fetchBalance。recordTurnCost（daily-tracker.ts:250–291）在跨进程锁内重读、合并并发布。
- after_provider_response（671–679）：await 解析响应头，包含加载原生 parser 的异步步骤；不是每个回调都纯同步。
- 旧业务 ADR-0003 明确选择逐 assistant 响应按 TTL、single-flight 主动刷新，且 render 不请求网络。

## 已运行的隔离回调探针

2026-10-09，直接加载旧扩展并捕获它实际注册的回调，不改旧实现。通过其现有 __setOmpModuleLoaderForTest seam 提供受控、尚未完成的额度请求 Promise。使用临时 HOME／USERPROFILE；加载前断言 os.homedir() 指向临时目录，避免读写正式统计。没有真实 OAuth、远端 API、完整 harness 会话或 TUI。

成功输出：

```json
{"requestStartReturnsImmediately":true,"messageEndReturnsBeforeUsageRefresh":true,"pendingFetches":1,"concurrentRefreshSingleFlight":true,"agentStartWaitsForStaleCacheRefresh":true}
{"fetchFinished":true,"startSettled":true}
```

断言证明：请求开始与 message_end 回调返回 undefined；额度调用已开始但 Promise 未完成时，message_end 已返回。并发触发第二次 message_end 不新增额度调用；agent_start 返回 Promise，在释放同一个刷新 gate 前尚未完成，释放后才完成。

初次 fixture 缺 ctx.setTimeout，agent_start 失败；该次不算成功的初始化等待证据。补齐 timer seam 后才得到上面完整成功输出。一次性探针与临时 HOME 调查后删除。

这证明等待位置，不测量真实用户体验或网络延迟；不能把工具 wall time 0.08 秒解释为扩展延迟，也不能声称旧实现完全没有等待。

## 对当前讨论的意义（尚非异步接口决议）

用户希望沿袭旧扩展基本感受不到延迟的体验。旧关键路径是轻量同步统计、网络刷新按 TTL／single-flight 后台进行；启动与 agent_end 仍存在等待。Q10 的“统一等待所有观察 Promise 再继续宿主流程”尚未获确认，不可作为契约。新版逐响应持久化若直接在 turn_end 等待跨进程锁／文件写入，会新增旧 message_end 不存在的等待点，需要显式选择。后台持久化的排空、异常、恢复与并发一致性须由存储／刷新票承接，不因不等待而取消已确认的正确性要求。
