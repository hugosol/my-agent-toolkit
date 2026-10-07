# 11: connect-bot 接入骨架（配置 + arm + marker）

**What to build:** 用户在 OMP 会话里执行 `/connect-bot`（空参）时，当前 main 会话被注册到 omp-bot 面板并回带在线会话数，marker 区出现 `◈ connectBot`。扩展自带 `config.yaml`（默认 endpoint、声明 `endpoint: non-empty-string`），端点唯一来源是文件；共享逻辑不 import 原生类型，真实 sessionId/cwd/model 由 OMP assembly 以纯数据注入。命令、marker、反馈三处都走框架新接缝。

**Delivers:** P21, P23, P27, P38, P39（sessionId/cwd/model 注入部分）, P40（arm 建记录部分）, P36（出现部分）, P26（从未接入的零动作部分）, P6（只声明 `enabled`，配合 03）

**Test owner for:** P27、P38、P39（事实注入部分）

**Blocked by:** 02、03、05、10

**Status:** ready-for-agent

- [ ] 扩展目录提交 `config.yaml`（默认 endpoint）+ definition 声明 `endpoint: "non-empty-string"`；无代码级默认值/回退
- [ ] `/connect-bot`（空参）在面板可达时注册当前 main 会话并回带在线会话数，marker 出现
- [ ] 只有 main 且 `hasUI === true` 可执行（含后续的 off）；子代理静默拒绝、无 UI 走 stderr；被拒绝时不改状态、不发请求
- [ ] 面板协议不变：固定事件路径 + `{proxy:false}` + `{sessionId,kind,data}` 信封；register 超时 ≤1s；404/非 2xx 按失败计
- [ ] 从未接入的会话零动作：无请求、无 timer、无状态写
- [ ] 扩展自持 owner-scoped 记录在 arm 时建立；框架 State 只进 `enabled` 一个声明值
- [ ] 真实 sessionId/cwd/model 由 assembly 原生读取并以纯数据注入共享逻辑；共享源仍无原生类型
- [ ] 扩展有薄入口：只 re-export OMP 装配、无逻辑；装配声明支持版本 OMP 18.5.0
- [ ] E 层测试：命令解析（空参）、main+hasUI 门槛（subagent / no-UI 两条）、成功接入与回带计数、信封与失败判定、从未接入零动作
- [ ] 能力文档同步

**来源:** contract P21、P23、P26、P27、P36、P38、P39、P40；spec §8/§9、故事 39/61/62/65/66/70/79/80；lighthouse 01、04、05
