# 展示访谈确认来源与证据限制

来源：本次“开始 ticket08”至 Q33 的同一用户会话。以下按访谈问题定位并保留用户原话；没有可用消息 URL，使用可恢复的原话，不编造消息时间。政策只在各 Lighthouse；本资产负责确认来源、替代链与证据。

## 确认与替代链

- Q1／Q2 用户提出“开辟一个新的分层，用于存放‘各harness的不同实现’”，并确认“对接方的改动之后影响我们的桥接代码，不需要修改整个extension”。Q3 展示文件名 10-assembly-layout.md 及分层内容，用户回答“同意”；授权仅部分发布，不认领／解决目标票。
- Q4 用户明确“视觉方案（布局，字体，颜色等）都照搬，但背后的逻辑需要走框架和share-logic”，旧界面 Turn 改为 Round；DeepSeek／Codex read/write/Cache 字段风格进入 shared logic，detail 另行重设计。
- Q5 用户确认后端在 shared logic 经 framework／adapter 接入；前端仅各 harness 自身实现。Q6 初步希望 detail 同处静态树、无新增交互与汇总；后续 Q8–Q10 明确修订范围。
- Q8 用户要求 brief Total 为总 cost，detail 隐藏原 Turn 行、显示代理树，“旧extension的detail设计舍弃”。Q9 确认主自身＋全部后代，Q10 确认“detail时也保留total行作为对比”。故“不展示汇总信息”仅为树内不新增汇总节点，不取消顶部 Total。
- Q11 用户要求树包含主会话；Q12 要求“保持和Total,round相同的展示字段…开头就用session名称标识不同的subagent”，否决缩为仅 cost＋token 的候选。
- Q13–Q16 曾探索混渠道只显示计费金额／纯 Codex 才显示参考金额，均不作为最终政策。Q17 用户赞同计费金额与额度参考费用各自累计同时显示：“很好，你给的方案更清晰”。两种金额不换算相加；纯 Codex 不强加无意义 Cost: ¥0。DeepSeek 金额是请求计价结果，不是 provider 实际扣款认证。
- Q18 token 占比替代费用占比被否决：“需要保留费用或者参考费用占比…用于调整agent行为的参考”。费用分项持久化只是未批准候选。Q19 最终确认固定相对权重的费用结构参考占比：“可以，这就是我想要的方式，不过我们要维护一份计价比例表，直接从这里取比例即可”。保留现有 JSON，不追溯历史单价；不把参考比例误称跨峰谷实际支出分项。
- Q20 展示文件名 13-model-catalog-policy.md 与来源／归属，用户确认“同意，这就是我想要的分层”：DeepSeek 扩展维护权重，Codex 从 framework 的宿主 catalog 单价派生，不额外查远端计价接口。覆盖／存放／更新／缺失仍未决。
- Q21–Q24 用户要求 CacheRead→CacheR、CacheWrite→CacheW；不添加当前模型标识；“cache input output等，不需要混入subagent指标一起统计，只显示当前会话的即可。total的sum cost ref则取累计值”。Q24 确认主根按 provider／model 拆行，subagent 单行自身累计；不恢复整棵树各节点逐模型展开。
- Q22 要求错误可见，公共能力无关扩展 enable 状态与加载数量。采用 UI 下余额／额度错误只在 widget、无 UI 走 framework feedback；其他统计／保存／命令反馈走公共通道。未批准退役 Owner handle 脱离生命周期继续产生效果。
- Q25 用户仅回答“无UI时也记账”，没有批准无 UI 全部远端刷新同 UI。完整无 UI 远端调度保留在刷新票；本轮不部分发布刷新 Lighthouse。
- Q26 原候选为查看子代理时 Total 与 detail 树转为子树。Q27 用户要求按需补接口并考虑通用分层；实际 OMP 原生出口及支持版本仍須验证，不能默认已有接口。
- Q28 用户收窄子代理界面：实际 Effort、context bar、有效扩展 enable 标记、Total／Round 的当前 Session／模型字段；其他信息保持。Q29 以文件名 10-assembly-layout.md 确认通用查看事实与 State／Marker area 归属，用户回答“同意”。
- Q30 最终确认“你的推断非常正确”：子代理 Total 的 Sum／Cost／Ref 保持主会话整棵树累计，Round 为子自身；替代 Q26 的 Total 子树候选。Q31 同意子代理固定 brief、返回恢复主会话模式，不新增 focused detail 路由。
- Q32 用户期望“轻量式round统计”，两次自身累计快照差值推断，不落盘 Round。已澄清任意两次文件读写不保证是 Round，需要对应边界与同周期同会话快照；不恢复历史、无数据隐藏而非造零。
- Q33 明示完整收口摘要及未实施／下游未决范围后，用户回答“同意”，授权结束 grilling、进入 Lighthouse 与 Backtracer 发布。

## 本轮实际证据

1. 读取旧 cost-calc.ts：现有 DeepSeek pro／flash 峰谷各项为 2 倍。Bun 计算得到相同 usage 峰／谷 Input:Output 均 25:75；跨峰 Input＋谷 Output 实际累计为 40:60，固定权重仍 25:75。证明两种比例区别，不是未来官方价格认证。
2. 读取 OMP SessionFocusController、ExtensionRunner.createContext、ExtensionContext／ExtensionUIContext 及 InputController focused 输入逻辑，用 LSP 查 focusedAgentId 引用。查看目标与 main Session 分开；检查到的扩展公开 context 没有查看焦点出口；focused 内置命令限制不包含 /budget。不能声称所有宿主接口已穷尽或新能力可立即上线。
3. 工作区源码直接导入聚焦控制器失败：缺少 pi_natives addon；没有复制 addon 或修改宿主工作树。改用安装的 OMP 18.9.2 真实 SessionFocusController，fixture Session／UI 隔离调用 focusAgent→unfocus 成功：聚焦后 mainSession=main、viewTarget=child、focusedAgent=child；返回后 mainSession=main、viewTarget=null、focusedAgent=null；statusTargets=[child,main]。不是完整 TUI、真实 subagent 对话或 18.5.0 基线认证。
4. 已有 18.5.0 子代理 Round 探针证明正常主／子／孙 start/end 与身份线索；仅复用事实与当前逐 Session 契约，不恢复旧资产的父 Round 分配政策。

发布核验：10 个相关文档的 195 条本地链接中，本轮新增／改变的 75 条链接及新锚点均通过；装配／模型计价票体 hash 核验未变。ADR 中 14 处既有缺失源文档引用保持原样，不在本轮修复无关历史。read 长行摘要曾导致一次基线误报，已按已核对的原段落修正；历史仅保存本轮涉及的 ADR 段落，不冒充完整原文。验证脚本为一次性文件，完成后清理。

未实施生产 widget、聚合后端、公共查看接口、模型比例表或 marker 重绑定；未运行真实模型／余额／额度 API、完整 TUI／headless 迁移验收。无永久探针文件或 native 构建产物；数学与控制器探针均为一次性 bun -e。
