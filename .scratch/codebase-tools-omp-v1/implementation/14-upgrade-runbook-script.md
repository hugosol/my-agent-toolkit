# 14: 支持记录、升级 runbook 与升级脚本

**What to build:** `docs/agent-runtime-support.md` 用统一四状态（verified-supported / verified-unlisted / unverified / unsupported）记录支持组合、证据、条件与升级标准，明确长期升级标准只覆盖框架能力、具体扩展能力由扩展套件与用户验收负责；`README.md` 提供文档索引与升级 runbook（隔离安装候选 → 框架套件 → 扩展套件 → 触及扩展可见面时人工 TUI 抽查 → 维护者显式替换单一支持版本 + 重启）；`scripts/` 提供升级脚本：候选版本经运行期参数（`OMP_TEST_VERSION=<v>`）在隔离前缀精确安装并跑框架套件、记录结果。默认/CI 只跑固定 18.5.0；绿灯只作回归警报。

**Delivers:** P34；P35（四状态支持记录、文档索引与升级 runbook、升级脚本部分）

**Blocked by:** 12、13

**Status:** ready-for-agent

- [ ] `docs/agent-runtime-support.md` 用四状态记录支持集、证据与条件；`verified-supported` 以票 12 的套件结果为依据，未验证项不得当通过证据
- [ ] 支持组合（18.5.0 + Windows x64 + Bun 1.4.2）与修订锚点 / 运行验收产物的对应关系记在权威文档里
- [ ] 角色证据按 provider 路径记入：deepseek 已观察、openai-codex 层1 shape-only、层2 待人提供或在不可得时记 unverified
- [ ] 长期升级标准只覆盖框架能力；具体 extension 能力不入长期标准
- [ ] 候选版本可经运行期参数隔离安装并跑框架套件，结果记录可核对（P34）
- [ ] 默认路径只跑 18.5.0；候选验证不触碰默认全局安装、正式配置与运行中 agent
- [ ] 明确记录：绿灯不自动认证；替换支持版本是维护者的显式动作（改 `supportedVersions` + 更新支持记录 + 重启）
- [ ] runbook 写清触发条件：升级触及扩展可见面时追加一次人工 TUI 抽查
- [ ] `README.md` 的文档索引与 runbook 可被人类或 agent 直接照做
