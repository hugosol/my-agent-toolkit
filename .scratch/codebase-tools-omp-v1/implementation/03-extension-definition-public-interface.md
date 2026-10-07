# 03: 声明式 extension definition 与公共接口

**What to build:** 把框架公共面收敛为两个入口：定义入口（`defineExtension` + 配置类型）与 OMP 装配入口（`ompAdapter(definition, { supportedVersions })`）；声明是纯数据对象，不用 builder。definition 覆盖 `id`、`displayName`、`state`、`commands`、`prompts`、`marker`；v1 控制面只有 command toggle，控制 `type` 为封闭判别联合。启动期校验配置冲突：同名命令、同一 State 字段的第二个声明写者、同一注入槽位多于一规则 → 非模型通道的显式配置错误，该扩展不被绑定、不留部分注册、运行时继续可用；初始化失败同样放弃 binding。共享语义核心与行为库的 import 图不得含 Agent 运行时类型。

**Delivers:** P1、P2、P16、P17

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] codebase-tools 的全部行为能用一份纯数据 definition 表达：`id="codebase-tools"`、`displayName="codeBaseTools"`、State 用默认 `enabled`、一个 toggle 命令、两个注入槽位、marker 文本
- [ ] import-boundary 检查证明语义核心/行为库不 import Agent 运行时类型；原生 escape hatch 只出现在 OMP adapter 与扩展 runtime assembly（C1）
- [ ] 三类配置冲突各自产生一次显式启动错误（非模型通道），该扩展后续命令与贡献一律不可用，运行时不中断（N6）
- [ ] 初始化/绑定失败不留部分注册，也不维护进程级可变注册表（N7）
- [ ] 公共接口之外不引入 builder、插件总线、scheduler 或 raw handler 后门
- [ ] `type` 为封闭判别联合：新增 control kind 属增量扩展，不在本版实现
