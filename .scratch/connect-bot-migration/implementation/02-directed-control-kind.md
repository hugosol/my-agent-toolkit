# 02: `directed` 控制类别与 runtime-neutral 测试基线

**What to build:** 扩展作者能声明一个“定向命令”：空参 = on、`off` = off，每次执行都重复执行动作——框架不去重、不短路、不自动串行化，幂等由扩展保证。声明仍是纯数据，动作实现由 OMP assembly 注入。同时建立 framework 层测试基线（runtime-neutral port double + binding），供后续所有框架票复用。

**Delivers:** P2

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] definition 新增 `directed` 控制类别并进入封闭联合；声明保持纯数据（无函数、无运行时类型）
- [ ] 空参执行与 `off` 执行各自触发一次动作；重复执行每次都触发（无去重、无短路、无自动串行化）
- [ ] 定向命令不产生框架自动文案；反馈文案完全归扩展
- [ ] binding 时检查声明与注入动作配对：声明了定向命令却未注入动作 → 确定性失败，不静默注册一个无动作命令
- [ ] 未识别参数不执行动作、不改状态（其报错路径见 13）
- [ ] F 层测试（runtime-neutral port double）覆盖：空参、`off`、重复执行、无自动文案、未识别参数不变状态
- [ ] 共享源 import 图仍不含 Agent 运行时类型（import-boundary 保持绿）
- [ ] `docs/framework-capabilities.md` 补新符号索引并引源码行

**来源:** contract P2；spec §2、故事 4/62/63/69；lighthouse 02
