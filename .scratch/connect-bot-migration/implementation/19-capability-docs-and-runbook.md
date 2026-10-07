# 19: 能力文档与 cutover runbook 收口

**What to build:** 公开符号与能力差异在文档里可见且与实现一致：能力索引逐符号引源码行、OMP-qualified 能力差异表同步、subagent State inheritance 表述对齐 per-field 默认，README §H3 扩写 connect-bot 的新旧切换与回退步骤。本票不建机械完整性测试；各处符号票已随实现同步各自条目，本票负责收口与查漏。

**Delivers:** P44

**Test owner for:** P44

**Blocked by:** 02、03、04、05、06、07、08、09、10、11、12、13、14、15、16、17、18（全部实施票，它们落地公开符号与扩展模块）

**Status:** ready-for-agent

- [ ] 能力索引覆盖本次新增全部公开符号，每条引源码行；无未实现符号被写成已实现
- [ ] `ConfigurationViolationKind` 新成员入索引；`ConfigurationViolation` / `"configuration"` 注释已从「竞争性声明」泛化为「配置规则（声明 + 文件）」
- [ ] OMP-qualified 能力差异表同步（managed timer、真实 sessionId/cwd/model、async job snapshot、agent identity/子代理 gate）；真实运行时验证未落地前保持 `source-inspected; not runtime-exercised`，落地后更新为已验证
- [ ] subagent State inheritance 的文档表述与 per-field 默认 `none` + codebase-tools 显式 `follow` 一致
- [ ] README §H3 含 connect-bot 的切换步骤、回退修订与 cutover 冒烟清单：移除旧发现入口、加入新根、整进程重启、endpoint 手工搬运、旧行 30s 过期、建议先 `/connect-bot off`
- [ ] 抽查三处文档与实际符号/行为一致；不引入文档完整性测试

**来源:** contract P44；spec §10、故事 93/94；lighthouse 05、06 §9、08
