# 命令决策本轮确认来源与事实边界

来源：本轮 `/budget 的参数、操作与状态如何在新框架表达？` 的 live HITL 讨论（2026-10-12）。以下引用为可恢复的确认来源，不代替各 Lighthouse 的政策权威。生产迁移未实施。

## 命令与通用能力

- Q1：用户「我想继续沿用budget，因为cost在输入命令时前缀匹配会和很多单词碰上，非常不方便」。不新增 `/cost` 或别名。
- Q5／Q6：用户「你推荐的方案已经很好地概括了我的需求，可以按这个思路设计」「Q5 同意」「Q6 可以，框架只负责路由到action的入口，具体逻辑全部交给share-logic即可」。方案为纯数据 `type: actions`／命令名／一层命名动作与说明，另注入 shared logic 动作实现表；不借 directed.unrecognized，不为业务升级通用 State。
- Q7／Q8：用户「Q7 同意」「Q8 可以」。匹配去首尾空白、忽略大小写、完整一层动作名；空参数帮助、其他输入错误并帮助；不缩写、不接受额外参数、不配置默认动作。
- Q9a：在澄清“等待 action 完成后才返回，不提供后台模式；同步函数或 Promise 都统一等待，无 async 配置”后，用户「Q9a 同意」。不是阻塞式文件 I/O；保留已定异步文件能力。
- Q10：用户「补齐，按需扩展框架原有功能，抽象通用设计，正是我们开发的方式」。公共反馈补齐 warning。
- Q11：用户「同意，这似乎已经成为框架一项通用能力？有一个打印错误的模块，我们优先考虑把错误抛到框架层，extension就不再需要各自实现打印逻辑」。复用公共反馈／诊断，不新增打印系统；最外层捕获同步／异步失败，不重试、不回滚、不自动成功通知。业务清理可在 shared logic 做，报告交框架，避免报告后再抛造成重复。
- Q2：用户「detail切换即可，用户可以少记一个命令」。入口偏好只用 `/budget detail` 在 brief/detail 间切换。

## 单账号与整文件 clear 的批准修订

- Q12：用户「我想简化整体设计，重点考虑最常见的场景：用户只有一个DeepSeek账户/API Key，超出这个范围之外的场景，如果需要写额外代码适配，就放弃该功能」「不再区分不同用户」「只支持一个账号」。旧政策并未要求写 API Key 原文，而是非秘密标识；此次仍批准进一步取消统计身份识别，不需要标识构造或账号分区。
- Q13：用户「Q13 同意」。明确旧 → 新：原单账号支持但按账号／凭据身份隔离且替换自动分区，改为 provider 单一统计范围、不识别或持久化账号身份、不自动处理替换；消费 clear 整份活动 JSON 归档和重置，独立 Codex estimate、旧归档、detail 保留。换账号不能承诺自动隔离旧消费／holiday／estimate，需用户自行开始新数据。
- Q14：用户「我希望上升到framework层面，我刚刚描述的就是framwork层面的约束」。每 provider 单账号是 framework 支持约束，不仅 model-cost 业务限制；framework/adapter 只提供当前认证访问资料，不建设多账号列表、选择、轮换或身份隔离管理能力。运行期认证协议必须的账号字段不因此删除。
- Q15：用户「同意」，随后要求查实宿主进程模型。支持前提为共享统计目录的实例使用同一 provider 账号，不新增全局账号检测／跨进程登记。
- 进程调查后，用户「我们最常见的场景还是在不同的cli里启动多个agent，这样看的话似乎不能简化为单进程的模型」。保留同机多进程协调、周期／版本拒绝旧提交；账号只有一个不意味着进程只有一个。
- Q16：用户「我希望还是限制为provider为DeepSeek时使用，因为其他provider和这个功能没有关系，如果实现不复杂的话，我想加上这个限制」。clear 限当前 DeepSeek provider，不是目标账号选择；holiday 既定 DeepSeek 限制保留。
- Q17：用户先授权「不允许是否能简化我们对边界的处理，是的话就直接不允许即可」，澄清不是整个 Session 禁止，而是当前 Round 未结束或保存未收口禁止，随后用户「Q17符合预期，请继续」。holiday/clear 不排队；已 idle 且保存完成的历史会话可操作，刚启动可靠 idle 也可操作；不要求所有进程 idle。
- Q18：用户「同意」。非 DeepSeek／工作中或保存未收口 warning 拒绝；活动未知 error 拒绝；holiday 已 ON info 不反转；文件错误抛框架；实际提交才通知成功。clear 归档成功而重置失败，明确报告两者状态，不自动补做。
- Q19：用户「我想参考旧extension的实现，如果旧extension的回答也是yes，我们可以跟随」。已核对旧 `index.ts:562-566` 无 provider 门控，DeepSeek／Codex／token-only renderer 使用 detailMode，hidden 返回空 widget；因此只确认入口偏好不限制 provider，不承诺所有 provider 新增 usage UI。展示及无 UI 完整调度仍由展示／刷新票持有。
- Q20：用户「可以，用最简单的实现即可」。有效数据即使零消费也统一归档／重置／关闭 holiday，不增加空则跳过归档分支；损坏或读失败不是零消费。

## 源码与实际验证

- 旧命令：[index.ts](../../../../my-omp-toolkit/extensions/model-cost/index.ts)，detail 562–566、holiday 570–591；DeepSeek/token-only 展示 247–342，Codex detail 使用 201–209。
- 公共命令机制：framework/core/definition.ts 的 toggle/directed 声明，framework/behaviors/control.ts 的语义，framework/behaviors/binding.ts 的装配，framework/adapters/omp.ts 的原生注册；公共 FeedbackTransport 与 publishNotice 已存在，新 actions／Promise 等待与捕获并未实现。
- [OMP 进程调查](omp-session-process-model.md)：18.8.6 JS 配临时借用 18.10.0 native addon，隔离 RPC 两实例 PID 不同，同实例 new_session PID 不变。
- [pi 进程调查](pi-session-process-model.md)：源码 checkout 与发行版 1.0.2 运行分别注明；隔离 RPC 两实例同时存活，同进程 SDK 会话替换。
- 未发模型请求，不使用正式认证／统计；调查不是 framework actions、反馈、文件协调或 UI 的生产验收。支持基线仍为 18.5.0，不自动改为调查版本。

## Q21 定点重审授权

用户在获得“仅重审存储原 Q25 的无账号键物理布局，不重开锁、异步更新或失败政策，不在本会话解决第二张非 research 票”的范围说明后，明确回答“Q21 可以”。据此存储源票仅恢复此问题为 open、未认领；命令决策结案，具体替代 schema 仍未批准，在后续独立会话认领后处理。命令范围的先决语义已有原权威，字段编码跟进不被当作命令语法／效果仍待决定。

## 尚未确认的物理细节

单账号与整文件操作已经批准，但取消 accounts/providerAccountId 后的具体物理布局（provider 分桶、periodId/holiday 的位置，以及整文件 reset 与 Codex 会话聚合的具体表示）不由示例配置或这些确认隐式冻结。若装配前仍需决策，应通过原存储权威追踪，不能以未批准 schema 冒充用户选择。
