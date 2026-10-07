# 04: `/codebase-tools` 命令切换端到端

**What to build:** 用户执行 `/codebase-tools` 时：命令事件 → adapter 匹配 → 在所属 owner 的 State cell 上应用转移 → 把新值持久化进 owner 会话 JSONL 的 `codebase-tools:state`（`{ enabled: boolean }`，best-effort，扩展侧不可观测落盘失败）→ 由新 State 驱动通知 `${displayName} enabled` / `${displayName} disabled`。State 是按 extension、按 owner 作用域的单一当前值来源，默认 `false`，只有 owner 是写者，全部更新经框架单写者写路径串行，renderer 只读。干净会话加载时默认关闭：无 state entry、无出站 init/reminder、无 marker。

**Delivers:** P6、P11、P12、P15、P36；P3（按扩展/按 owner 作用域、默认 false、owner 单写者部分）

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] 干净会话加载：无 `codebase-tools:state` 条目、出站无 init/reminder、无 marker（B1）
- [ ] 第一次 `/codebase-tools` 写 `{enabled:true}` + 通知 `codeBaseTools enabled`；第二次写 `{enabled:false}` + 通知 `codeBaseTools disabled`（B2）
- [ ] 写路径顺序固定且可观察：命令转移 → 持久化尝试 → 由新 State 驱动反馈（C5）
- [ ] State 读取面与写入面分离：读只经 read view，写只经框架写路径；不存在第二条 State 写路径
- [ ] 落盘失败语义明确记为 best-effort：命令反馈与同进程读取以内存当前值为准，不承诺 durability，也不作为通过证据（N3）
- [ ] 两个不同 owner 的 State 互不污染；进程级标签不被用作 owner 身份（C2）
