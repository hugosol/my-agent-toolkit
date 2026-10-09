# 什么证据才算完整迁移，如何安全验收并切换？

Type: grilling
Status: open
Assignee:
Blocked by: 10
Prerequisites: [确定的新能力与 model-cost 如何组织、声明和装配？](10-assembly-layout.md)
Parent: [model-cost 完整迁移：通用能力分层与 OMP 适配](../map.md)

## Question

定义完整迁移的可观察验收：真实宿主请求／响应／多 Turn／工具执行／Round 事件关联、计价边界、模型切换、各模式命令、headless 更新、renderer 无业务副作用、跨进程存储、安全失败、真实余额／Codex 额度与视觉 TUI。

明确使用框架当前 18.5.0 基线还是显式选择其他版本；不能把当前安装版本或源码检查当验证。哪些自动 smoke、哪些需要凭据或用户交互？如何分离框架升级报警与扩展业务回归，并处理旧测试中实现细节断言？

确定新统计从空开始的验收、保留旧文件、原新实现加载互斥、正式配置与进程重启的用户动作、切换失败回退及完成记录。图外实施必须完整交付，不以 scaffold／测试 green 宣称完成。此票输出验收与切换标准，不修改正式配置或执行切换。

## Trace handoff

来源：[行为契约决议](../lighthouse/01-behavior-contract.md)。验收必须区分逐响应计价正确与统一 Round 边界正确。覆盖工具指令／工具结果输入、自动续跑、跨峰谷费用求和与恢复信息不足；对照冻结 source oracle 验证保留行为与每项用户确认的有意改变。覆盖 Codex 双窗口、ratio／left、命令／累计／分段条基线，不把无 UI 远端刷新策略或最新模型名单视作既定规则。

