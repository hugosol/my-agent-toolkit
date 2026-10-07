# 08: 子代理 owner 继承与只读跟随

**What to build:** owner = 沿原生 parent 链上溯遇到的最近一个 top-level main 会话（main 的 owner 是它自己）；解析复用 Agent 运行时的原生 parent 引用与官方注册表递归到 main，不用 depth 或进程全局推断。子代理对 owner 的激活值只读、每轮实时跟随（不是创建时快照、不是整份拷贝、无写面），并按自身 branch 独立推导 init 进度；嵌套子代理逐级上溯，最终跟随同一个 root owner；后台 fork 沿用同一跟随规则，解析不到则 off。owner 缺失/不可解析 → off 且不可 toggle，有通道时给一次可选 best-effort 提示（无 UI 走 stderr），该提示不属于准入拒绝通道。首版只支持单 main，同进程多 main 的已知限制被记录在案。

**Delivers:** P4、P8、P9；P3（子代理只读、无写面部分）

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] 真实内建子代理（非 mock）实时跟随 owner 当前 `enabled`：main toggle 前后各跑一轮，行为随切换改变（B9、C3）
- [ ] 子代理无写面，不能改变 owner 的意图；框架只维护一个活动映射，不重新实现 agent 图
- [ ] 子代理各自按自己 branch 推导 init 进度：enabled+无 init→init，enabled+有 init→reminder，off→静默
- [ ] 嵌套子代理逐级上溯到同一个 root owner；后台 fork 沿用同一跟随规则，解析不到则 off
- [ ] owner 不可解析/不存在 → off 且不可 toggle；有通道时一次 best-effort 提示，无 UI 走 stderr（N4）
- [ ] 「首版仅支持单 main，同进程多 main 可能解析到错误 owner」被记录为已知限制，不作为通过证据（N10）
