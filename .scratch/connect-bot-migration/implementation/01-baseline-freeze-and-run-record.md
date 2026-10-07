# 01: 基线冻结与 run record 骨架

**What to build:** 迁移的每个验收结论都要能追溯到具体的源、运行时与面板修订。本票把行为基线（源仓库与其冻结修订、扩展唯一提交、面板修订）、支持基线（OMP 精确版本 + 平台 + Bun 版本）与框架侧修订一次记录成 run record 骨架，并写明如何重建隔离验收环境；后续每条验收票在录制时填入逐步结果、截图/日志位、执行者与日期。

**Delivers:** P41

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] run record 记录行为基线：源仓库分支 + commit、扩展唯一提交（connect-bot 只存在于一个提交）、面板 commit，并声明开发期冻结（原仓库不改）
- [ ] run record 记录支持基线：OMP 精确版本 + 平台 + Bun 版本，以及框架侧 commit + lockfile 与扩展 `config.yaml` 内容的填写位
- [ ] run record 含逐步结果、截图/日志位、执行者与日期字段
- [ ] 非 pinned 的 OMP 版本先跑候选版本校验脚本，或显式记 `verified-unlisted`，不默认等价
- [ ] 记录可重建：他人按记录用隔离精确安装复现验收环境，不改默认全局安装/正式配置/运行中 agent
- [ ] 基线记录来源与 spec §11、lighthouse 06 §7 一致
