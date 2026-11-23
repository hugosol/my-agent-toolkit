# pstack Suite：待迁移与参考事项

本文记录设计讨论中暂缓的能力，不代表已经迁移、永久删除或已授权接入外部系统。当前目标为仅 OMP 的 pstack 专用 Suite；上游内容通过快照与映射生成，持续模式复用 toolkit 框架。

上游参考：[cursor/plugins 的固定 pstack 源树](https://github.com/cursor/plugins/tree/aaeb0ea3a0584995aa8f55ce44c6c5259414b896/pstack)，版本 `0.15.46`。以下源路径均相对该目录。本文是来源说明，不是命令目录；这些专题没有默认路由或 pstack 占位技能。OMP 中没有对应的本包技能附件，普通模型回复也不表示已执行。当前入口见[生成的帮助](generated/skills/poteto-help/SKILL.md)与[核心路由](generated/skills/poteto-mode/SKILL.md)。

## 1. Benny：Slack 问题自动分流与修复

来源：`automations/benny/FOR_AGENTS.md` 及其内部 skills/templates。

- 接收 Slack 新根帖，读取线程和附件，分类、判断归属、tracker 去重及必要建票。
- 原线程回复可信分流标记；后续流程核实修复归属和已有 PR，真实 UI 两次复现、一次有界修复、验证后创建 draft PR。
- 不 merge/deploy；线程身份固定，仅协调者可写 Slack，子代理不得持有 Slack 密钥。

后续专题：事件接入、tracker、目标应用控制适配器、凭据隔离、重复事件与副作用、结果回传。可以参考 herdr Map/Bot/Task，但现有工作流不是现成 Benny。

## 2. 云端并行执行环境

来源：`skills/swarm/SKILL.md`、`skills/poteto-mode/playbooks/autopilot-full.md`、`skills/poteto-mode/playbooks/shipping.md`。

暂缓 Cursor 云 VM 的供应、远端执行、云 agent URL、机器生命周期等集成。[swarm](generated/skills/swarm/SKILL.md)、[arena](generated/skills/arena/SKILL.md)、[interrogate](generated/skills/interrogate/SKILL.md)、[Shipping](generated/skills/poteto-mode/playbooks/shipping.md) 与 [Autopilot-full](generated/skills/poteto-mode/playbooks/autopilot-full.md) 的本地流程使用 OMP task；独立 checkout 不等于 VM 或安全沙箱，也不保证宿主退出后继续工作。

后续专题：远端部署与资源供应、环境和凭据隔离、产物取回、进程故障与恢复。herdr 后端重启后旧 Run 不自动接管，不能视为现成持久执行队列。

## 3. Slack/Grok 事件驱动自动化

来源：`skills/make-bot-ui/SKILL.md` 及 Benny 的事件入口。

原方法为 UI/Slack 等外部事件触发服务，服务保管密钥并调用 webhook routine，唤醒 agent 后处理事件并回传结果。它不是 pstack 随附的常驻服务。

后续专题：认证/签名、去重、线程或事件关联、授权、接收与处理状态、重启与投递不确定性。常驻接收器不依赖某个 OMP Chat 已经开启；不得把外部 payload 当系统指令。herdr 页面手动发起不是外部事件接入的等价实现。

## 4. 历史与学习增强

来源：`skills/recall/`、`skills/automate-me/`、`skills/reflect/`、`skills/correct/`。

- recall：从当前项目历史会话及外部记录恢复背景。
- automate-me：提炼反复出现的工作习惯并生成个人模式。
- reflect：从本轮对话提炼经验，经批准修改技能。
- correct：从重复错误出发，以架构、类型、lint/CI 或测试固化约束；它并非依赖会话数据库的记忆服务。

这些不是核心调查、设计、实现、修复、验证的必经阶段，可独立展开。后续需确定 OMP 历史入口、项目范围与隐私边界、学习成果的归属及批准方式。生成资源不可直接手改，适配或学习变化应进入映射或明确的用户自有资源。

### 与核心交接的边界

- 暂缓范围不包含当前会话上下文、[决策日志](generated/skills/show-me-your-work/SKILL.md)、[安全暂停](generated/skills/poteto-mode/playbooks/pause-safely.md)、自有 `wip:` 提交或明确的交接笔记。
- 上游 `skills/poteto-mode/playbooks/session-pickup.md` 有 Cursor transcript/云 URL 读取分支；通用跨会话查找与云接管没有迁入默认路由。它们需要明确的数据范围、访问权限与可验证的会话定位。
- [本地续接](generated/skills/poteto-mode/playbooks/session-pickup.md) 读取明确提供的分支、WIP、日志或交接笔记并核实状态。这是可读方法，不是自动历史检索或宿主恢复机制的验收证明。

## 更新规则

每项另开讨论时，先确定真实需求与替代边界，再更新本文件。只有真实链路验证后才能改为已迁移；不得用 skill 文件存在、命令已注册或配置已保存作为端到端完成证明。
