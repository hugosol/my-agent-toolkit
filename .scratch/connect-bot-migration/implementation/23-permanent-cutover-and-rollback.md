# 23: 永久切换与回退执行

**What to build:** 用户在自己的真实安装上执行永久切换：移除旧发现入口、加入新根、整进程重启、endpoint 值手工从旧 `config.json` 搬到 `config.yaml`（无自动转换、无状态迁移）、切换前建议 `/connect-bot off`、旧行按面板 30s 过期保留；失败时按回退修订对称回退。

**Delivers:** P47

**Blocked by:** 19（runbook）、22

**Status:** ready-for-human

- [ ] 切换按 README §H3 执行：旧发现入口移除 + 新根加入 + 整进程重启（无热重载假设、不做进程内 discovery-root 交换）
- [ ] endpoint 手工搬运，无自动转换；搬运后重新执行 `/connect-bot` 成功接入
- [ ] 切换前旧行与切换后行为符合预期（旧行 30–35s 过期并保留，新接入行正常）
- [ ] 回退步骤可执行且已冒烟（回退后旧实现可接入）
- [ ] 切换与回退结果记入 run record；期间观察到的差异逐条登记交用户判断

**来源:** contract P47；spec §11、故事 83/84；lighthouse 05、06 §6 步骤 L/M
