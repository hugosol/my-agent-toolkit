# 13: 能力与选项清单

**What to build:** `docs/framework-capabilities.md`：把 `defineExtension` 与 `ompAdapter` 的全部参数含义列全、指向源码、不写实现。它是人类与 agent 的能力入口索引——先找到入口，再读源码。交付时机是公共接口最后一次增补之后（票 10 的「必须语义缺失」上报形状），因此可与票 12 并行推进。

**Delivers:** P35（能力与选项清单部分）

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] 列全 `defineExtension` 的 `id` / `displayName` / `state` / `commands` / `prompts` / `marker` 含义与取值约束，含「v1 只支持 command toggle」的边界（C15）
- [ ] 列全 `ompAdapter(definition, options)` 的参数含义（含 `supportedVersions` 与必须语义上报），并指向源码
- [ ] 只写入口索引与参数含义，不写实现说明、不复述 spec
- [ ] 位置与命名可被 `README.md` 的文档索引引用
