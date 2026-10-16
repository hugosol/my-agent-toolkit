# 04: detail 展示未提交会话、嵌套后代与续跑身份

**What to build:** 实际 detail 以已保存会话与可靠实时登记会话的并集展示代理树。首轮尚未提交也可展示已有读数，缺失消费保持未知；后代直接向 Owner 提供观察但按真实直接父关系排列，同一实际 session 的续跑不重复建行。

**Delivers:** P2, P3, P9

**Blocked by:** 03 — 子进程启动即安全登记并交付当前观察。

**Status:** ready-for-agent

依据：[已批准 contract](../contract.md)、[spec](../spec.md)。本票拥有 P2、P3、P9 的全部 coverage 与测试，包括真实 detail 表面，不以内部 registry 代替用户可见验收。

- [ ] 主、子、孙分处实际进程时，孙会话直接向 Owner 提供读数，不要求父进程中转；实际代理树仍为三级，孙不被挂到根。
- [ ] 同一实际 session 经两个 run 或进程来源交付，实际 detail 始终只有该会话一行；run 身份、进程身份与实际 session 身份不混用。
- [ ] 首次消费提交前，实际 detail 已展示会话行及独立给定非零上下文；缺失消费按缺失表达，不能显示虚构的确认零。
- [ ] 已保存与实时登记按实际会话身份合并，直接父关系与现有自身／含后代消费口径不被观察交付方向改变。
- [ ] 不为未提交身份新增持久化或消费 schema 迁移；观察值不落入消费文档。
- [ ] 按仓库测试规范验证树合并、身份边界及真实嵌套／续跑场景，执行所属分区和受影响展示消费者；TypeScript 变化执行 typecheck，记录实际表面及进程证据。

## Comments

### 2026-10-17 执行记录（P2、P3、P9）

实现与证据见 [证据文件](evidence/04-live-session-detail-tree-evidence-2026-10-17.md) 与
[真机日志](evidence/logs/04-pi-subagent-smoke-background.log)。要点：

- S1：`request-accounting.ts` 的身份来源接受 framework 的进程观察源（新窄接口 `SessionObservationSource`），
  `factsOf` 以该记录的事实为优先（它由本进程每次会话交付与另一进程每条读数共同更新，包括只带事实、不带读数的
  那一条），`identities()` 与 `inclusiveTotalsOf` 都据此把"已保存会话 ∪ 本进程观察到的登记会话"按实际会话
  身份合并；`runtime.ts` 在构建 accounting 前建立并传入同一个源。
- S3：`tests/model-cost/detail-tree-live-sessions.test.ts`（6 例，含真实前端绘制的 detail 行）钉住 P2 的三级
  树与直接父关系、P3 的一会话一行与同名不同会话两行、P9 的"提交前行 + 给定非零上下文 + 缺失消费不写零"；
  `tests/model-cost/detail-tree-process-sources.test.ts`（1 例）用两个真实子进程经真 named pipe 交付子／孙读数，
  断言真前端画出的三级 detail 行（S2 载体 + S3 表面）。
- 判定：`bun run typecheck` exit 0；`bun test tests/model-cost` **473 pass / 0 fail**（+7 新例）；
  `bun test tests/framework` **538 pass / 0 fail**；真 patched OMP host 的 `tests/harness-dock/detail-tree.test.ts`
  **3 pass / 0 fail**、`tests/harness-dock/session-ownership-tree.test.ts` **3 pass / 0 fail**；六处变异注入
  各自被对应用例捕获后还原。
- 真机：`bun scripts/pi-subagent-smoke.ts --background-only --expect-pi-version 1.3.0` 本票运行（55.6s）：
  登记、身份与观察源三条断言与票据 03 记录一致地通过，其后仍停在同一处既有失败（子进程自身消费未落盘，
  P27／票据 05）。
- 未验证：POSIX 载体与其他宿主版本；真 pi CLI 跑出孙会话（后台阶段停在同一处既有 P27 失败）；只带事实的登记
  会话要等宿主下一次重绘才出现在画面上（框架不派发该事件，本票不改派发）。

