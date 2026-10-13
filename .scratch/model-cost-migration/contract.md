# Contract — model-cost 完整迁移

Source: [model-cost 完整迁移规格](spec.md)
Acceptance mode: Rapid iteration
Approval: Approved

批准来源：本次合同讨论中，用户分别对五个外部 seams 提案和六面审视方向回答「同意」，并在验收模式选择中明确选择「快速迭代＋上述分工」。此批准针对承诺、观测 seams 与验收责任，不代表实现、测试或人工验收已完成，不扩大正式环境操作权限。

继承决定作为事实：以[Implementation Decisions](spec.md#implementation-decisions)及其原 Lighthouse／ADR 为准，公共语义／adapter／shared logic 分层、唯一自身聚合、轻量 Round、单账号、失败与并发取舍均不重议。来源中的 story 数字指向规格的编号，不复制故事叙述。

预期结果须来自承诺、独立字面值、手算例子或原规格，不以调用被测实现重新计算预期。每条承诺完成与否由 delivering tickets 完成情况、全部必需检查及人工确认共同派生；不手工维护状态列。/to-tickets 在对应承诺关联 delivering work，不改变承诺。

**Complete implementation and all assigned automated checks before the human-led acceptance round. Planned human-led checks do not pause otherwise executable work. At the final handoff, report the remaining checks together with their prepared evidence; they remain unverified until the user confirms them. Report genuine blockers when encountered.**

Coverage 中自动业务测试的网络用 mock；真实本地传输贯通是隔离 smoke，不混入永久网络 test cases，也不是 provider 最终认证。文件安全与正常多进程共享用真实本地文件及独立进程观察。真实 TUI／provider 最终检查分别记 H1／H2；仅这些判断转给人工，实现、自动测试和有用接线检查仍由代理承担。

## Promises

|#|Promise (one observable result)|Coverage|Source|Seam|
|---|---|---|---|---|
|P1|请求费用固定为请求开始时的实际模型与峰谷／holiday价格，后续变化不重价|自动：峰／谷／holiday含端点、跨时段与模型切换；使用自造价格和独立手算金额，真实请求开始事实贯通。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 2, 8, 9](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P2|可靠失败／取消usage进入自身累计，无可靠usage仅提示不造零|自动：完成／失败／取消、缺usage、真零与默认零不可靠区分；反馈与保存累计，不把跳过当免费。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 3, 7](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P3|工具返回与Round结束不增加消费，真实后续请求增加一次消费|自动：工具续跑贯通与独立总值 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 4](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P4|相同Turn重复完成只计一次，内容相同的新Turn独立计入|自动：重复结束跨Round仍不重计，缺usage已处理也不补账；新身份正常计；实例销毁后旧回调隔离。|[stories 5, 6](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S1|
|P5|缺价只跳过金额且保留token，不补算或删除已累计费用|自动：缺价及catalog变化前后字面累计|[stories 7, 11](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2|
|P6|provider加精确模型决定计价／token-only／hidden，不模糊匹配|自动：自造名单证明精确匹配规则；批准实际名单／价格以规格独立核对并隔离冒烟，不将频繁业务常量固定进算法测试。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 8, 17, 18, 65](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P7|Codex Ref与人民币Cost独立显示和累计，不混币种|自动：混合树独立字面Cost／Ref|[stories 11, 19, 32](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2|
|P8|token-only只提供批准的usage展示，不产生自身金额或订阅额度|自动：对应模式结果及出站请求捕获 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 17](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P9|hidden不创建用量widget且不阻止模型执行|自动：实际宿主hidden执行及widget结果 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 18](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S5|
|P10|固定预算只告警不改变宿主执行|自动：预算结果与实际出站请求／执行对照 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 20](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P11|显示实际Effort，无法取得为问号而不借用配置或主会话|自动：配置意图与实际事实不同、主／子值不同、未知为?。H1人工：真实目标Effort可见性；准备冻结artifact、切换步骤和自动事实结果。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 21, 36](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S2, S5|
|P12|自身消费只进入实际发起Session桶，不按Owner或查看目标归属|自动：主／子／孙／兄弟、异构模型及在途时切查看，核对独立期望桶和身份／直接父事实。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 22, 30](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S2, S5|
|P13|父树Inclusive session totals每份自身贡献只汇总一次|自动：异构嵌套树的独立token／Cost／Ref总值|[stories 23](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2|
|P14|Round totals只有本实际Session自身消费|自动：父子活动及迟到子消费对照 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 24](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P15|正常连续对话提供最近一Round自身累计（进行中或刚结束）|自动：普通连续活动／工具／已知自动续跑仍同轮，结束候选下一任务复查后正常终轮；最近一轮差分独立预期；截断不当正常结束证据。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 25](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S2, S5|
|P16|resume恢复当前周期已保存自身聚合与版本，不重算历史|自动：正常保存后独立重启，版本连续；不扫描历史或合并归档。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 26](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P17|tree不回滚已发生Session消费|自动：历史位置往返、继续执行前后字面累计保持；文件差值不冒充历史Round。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 27](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P18|缺少可靠运行期快照时不展示伪历史Round|自动：重启／tree缺数据降级 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 28](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P19|fork新实际Session从零且不修改原Session累计|自动：fork复制消息但无新请求的对照 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 29](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P20|普通视图变化保留CLI业务实例、缓存和detail|自动：切换前后请求计数与偏好 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 30, 40](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P21|Total当前模型字段只取Viewed session自身当前模型|自动：与整树预期故意不同的多模型数据 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 31, 36](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P22|Total的Sum／Cost／Ref保持原主树全部模型范围|自动：查看子代理不丢父或兄弟 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 31, 37](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P23|主detail保留Total并显示静态代理树与根模型行，不显示Round行|自动：自造异构主／子／孙验证字段范围。H1人工：静态树根模型行、缩进、适用字段和Round隐藏；准备场景及期望树与可获得截图。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 33](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P24|名称按实际身份持续更新，消费文件只随下次正常保存更新|自动：未查看子／孙改名；保存前后文件及次数 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 34](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S2, S5|
|P25|结构参考占比由该范围对应模型当前价格派生，不重价已算金额|自动：独立比例例子，缺价／全零／非当前模型|[stories 35](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2|
|P26|子代理查看使用自身context和Round且固定brief，返回恢复主偏好|自动：可控Viewed session结果及来回查看。H1人工：实际子context／自身Round／固定brief，返回主detail；准备隔离切换步骤及自动字段对照。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 36, 37, 40](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P27|唯一Marker area投影Viewed session有效State且不扩大Owner权限|自动：follow／none有效投影、查看不授写权限及进程唯一性。H1人工：主／子实际marker切换；准备State场景、预期标记与自动结果。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 38](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S5|
|P28|budget空参帮助，合法动作完整匹配，非法参数拒绝不执行|自动：大小写／空白／缩写／多参数对照 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 39](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S5|
|P29|detail立即切入口偏好，不要求provider／idle／保存完成|自动：hidden／headless／busy动作与反馈 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 40](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P30|首次holiday提交新周期true并归档全部已保存消费|自动：真实新活动和归档独立读回，跨provider整文件且首次直接true、不先发布false；无新数据也归档。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 41](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P31|已开启holiday重复动作不切周期也不查询余额|自动：请求捕获及periodId不变 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 42](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P32|clear提交新周期false并归档完整已保存消费，零消费同流程|自动：先归档后活动发布；仅已保存数据、零消费归档、旧period拒绝；不清真实活动或Owner。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 43](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P33|周期reset不清已有归档、独立estimate或detail|自动：reset前后独立资料对照 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 44](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P34|周期动作只在当前DeepSeek入口可靠idle且保存收口时执行|自动：busy／unknown／pending-save拒绝且以后不迟到执行 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 45](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P35|命令等待真实完成，阶段失败如实反馈一次且不报告成功|自动：同步抛错／异步拒绝只报告一次；归档已生成而新活动失败保留阶段信息，活动实际提交前不通知成功。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 46](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S2, S5|
|P36|边界余额锁外仅尝试一次，失败省略起止值仍可reset|自动：可控目标捕获单次查询及锁外次序，失败／超时省略两字段仍操作；无旧缓存替代。H2人工：真实可靠余额贯通；准备少量脱敏结果／跳过原因、边界读数和归档检查步骤。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 47](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S4, S5|
|P37|启动已配置两源并行预取且首请求前有限收口，失败不阻断|自动：配置两源并行、缺源不查、首模型请求前完成成功／失败／超时；同CLI子共用及独立CLI分开。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 48](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S2, S5|
|P38|DeepSeek usage按成功TTL合并在途查询，失败不续TTL不补发|自动：可控时间验证成功30000ms TTL、在途合并、失败时间不变、无轮询或补发。H2人工：真实DeepSeek余额最终效果；准备少量脱敏冒烟／跳过原因和正常usage观察方法。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 49](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P39|Codex运行期仅headers更新，无API兜底／轮询|自动：可控headers事实、缺失后保留、出站计数证明无runtime API／切换额外查询。H2人工：实际Codex响应headers接入；准备脱敏来源／窗口结果或跳过原因与正常使用步骤。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 50](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P40|运行期查询不阻塞模型／工具／idle／退出，旧实例结果不再接纳|自动：悬挂远端不阻下一请求／工具／idle／退出；切换不丢有效实例缓存、销毁后迟到结果不反馈／重绘。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 51](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S2, S5|
|P41|每CLI UI单一峰谷边界timer重绘当前目标，无headless绘制timer|自动：可控时钟证明单timer、端点后、目标切换／销毁及休眠后纠正。H1人工：真实TUI当前目标边界重绘；准备隔离场景、预期时段与可获得证据。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 52](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P42|headless使用相同观察、统计、保存及远端调度而无widget|自动：RPC真实数据和请求捕获 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 53](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P43|反馈保持级别与单次错误，headless送stderr且不进入模型上下文|自动：info／warning／error按原级别，UI网络错仅widget；其他错公共反馈。stderr、Session日志及出站模型内容证明不污染请求。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 54](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S5|
|P44|独立Session同机共享文件正常并发不覆盖已提交记录|自动：临时真实本地目录、多独立进程并发保存并独立读回各Session与父关系；不得用内存锁模拟替代。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 55](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S4, S5|
|P45|旧周期／旧版本拒绝，同版本同内容幂等，不同内容冲突|自动：独立磁盘baseline、旧周期／旧版拒绝、同版同内容幂等、同版不同内容冲突；比较业务内容而非排版，保存不复活旧值。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 56](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S4, S5|
|P46|普通保存失败丢弃未保存段并从有效磁盘恢复，不阻断模型|自动：故障后磁盘有效baseline不置零，丢弃未保存段、版本恢复、去重不清；真实模型继续且不自动重交。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 57](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P47|无有效存储基线暂停统计而不猜零覆盖，下一正常初始化再加载|自动：损坏／不兼容／无有效baseline不覆盖不猜零；反馈和暂停，仅下一正常初始化再加载；provider测量仍可继续。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 58](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S4, S5|
|P48|失效锁可恢复且单次失败不阻断后续正常写入，不仅凭年龄抢活锁|自动：真实进程存活／退出及后续提交可写；不能仅凭年龄抢活锁，不把未知活性本次失败升级为自动强抢或无限恢复SLA。|[stories 59](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S4|
|P49|同键FIFO、权限内重读、原子发布使读者只见完整旧或新文档|自动：真实文件并发、同键顺序、别名协调和独立文件进展；失败后队列继续、读者只见完整文档；更新函数的输入须是权限内最新值。|[stories 55, 62](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S4|
|P50|等待超时／取消不迟到写入，更新开始后返回真实结果|自动：受控占锁／排队验证15秒默认或覆盖预算与取消、失败后权限释放不迟到写；更新开始后等真实结果，损坏时不调用更新。|[stories 59, 62](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S4|
|P51|存储根按既定规则解析并使用固定组织，不随cwd迁移数据|自动：不同cwd、绝对／相对／字段局部~/、配置重启、不同根不搬迁与同目录别名共享；实际文件位置读回。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 60](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P52|持久文档只含批准Session schema与独立estimate，不增加账本|自动：生产写出与独立schema检查、重启恢复；根/Session/自身四桶/币种/版本、直接父未先保存、归档唯一拒覆盖、独立estimate保护；禁止账本和重复权威总数。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 26, 60](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P53|当次凭据用于当次操作，访问失败局部收口且秘密不入可见输出|自动：合成秘密哨兵验证正确目标鉴权、当次固定、局部失败和无跨凭据借用；错误／日志／模型内容／文件／证据脱敏，不读取真实秘密进入对话。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 61](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S3, S5|
|P54|HTTP请求显式路径被兑现，命名代理缺配置／失败不回退直连|自动：永久网络测试mock；隔离本地目标／HTTP与HTTPS代理实接smoke证明选择、连接协议、配置错误和失败无直连重发；不触碰宿主推理／OAuth网络。|[stories 62](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S3|
|P55|HTTP保留response与非2xx、传输拒绝和正文预算语义|自动：mock验证结果语义；隔离本地延迟响应头／正文smoke证明超时覆盖正文、非2xx返回和读取失败；请求→共享→30000ms优先级、非法值拒绝。|[stories 62](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S3|
|P56|公共工厂在配置有效后创建、初始化一次并完整清理|自动：公共配置校验→工厂→认证可读初始化顺序，失败清理／卸载／结束只清一次、订阅与访问失效；一般异步保存不成为后续事件屏障。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 62](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S5|
|P57|逐实际Session观察不被Owner过滤，Owner效果仍不被子事件驱动|自动：同事实分别驱动Owner和实际Session组；主／子／孙正常Turn身份／关联／结束及异步错误承接，子不驱主效果且不漏消费。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 63](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S5|
|P58|受影响消费者迁移后原协议、State、prompt、历史和效果不变|自动：真实loader／RPC／请求捕获验证connect-bot注册、心跳、失败预算、状态／Owner效果和codebase-tools prompt／历史／State；保留有效行为场景，不重钉内部旧形状。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 1, 64](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S5|
|P59|模型和价格显式集中维护，运行期不发现、不热更新或补算|自动：自造数据维护例子及实际运行出站对照 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 65](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P60|独立验证给出精确artifact和范围，不成为启动门禁或自动支持声明|自动：运行独立验证，精确宿主revision／artifact、源码revision、依赖与环境记录；正常启动无版本／shape／报告门禁，必要配置／业务错误仍处理；不自动扩大支持。|[stories 66](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S5|
|P61|验证不写入或驱动正式OMP环境|自动：检查隔离安装、配置、Session、工作与数据根；获准凭证只供隔离鉴权不正式写回；正式环境无验证命令／重启／配置更改。|[stories 67](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S5|
|P62|真实服务与视觉最终证明不能由mock／RPC替代|自动：核对证据类别和必需人工确认，不用mock／RPC／发现结果认证真实效果。H1/H2具体场景和准备证据由P11/P23/P26/P27/P36/P38/P39/P41/P65/P66/P67 Coverage持有，不新增实现豁免。|[stories 68](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S5|
|P63|交付手动互斥切换与回退清单，不自动处理旧数据|自动：交付手动停机／备份／清空准备／互斥加载／启动／失败保留新数据并恢复旧配置备份的检查清单；隔离演练不动正式数据。正式切换／回退仅用户执行，不算代理待实现动作。|[stories 69](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S5|
|P64|具体缺口报告未决，不静默缩范围或将缺证据判为通过|自动：验收记录区分通过／失败／跳过／待人工，具体新缺口带证据请求裁决；不得重开已決原则以假想机制扩范围。|[stories 70](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S5|
|P65|Codex有效窗口独立更新，缺失保留原成功值和原时间|自动：±5%报告时长、换primary位置、仅有效单窗独立更新、缺失保留旧时间、未知／过期／无效reset独立预期。H2人工：真实5h／7d最终效果；准备脱敏报告／跳过原因与正常使用观察步骤。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 12, 13, 14](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P66|ratio／left仅合格同报告双窗口采样，估计独立保存且无值显示estimating|自动：同报告配对、50pp/正增/未饱和门槛、rollover/过期/时间异常、baseline即时/ratio分钟节流、新baseline优先/已知ratio不降null、独立真实文件合并。H2人工：ratio／left正常使用最终效果；准备自造序列独立预期和脱敏已有读数，不额外消耗额度制造样本，无足够样本如实待确认。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 15, 16](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P67|批准视觉、告警与窄宽降级保持而非只展示正确数字|自动：自动验证对应字段、金额单位、阈值和降级内容。H1人工：全部适用模式的原风格、色彩、条形、告警、主/子查看及窄宽布局；准备精确artifact、隔离方法、各场景预期、自动结果与必要的可获得截图／录屏。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|[stories 10, 12, 68](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S2, S5|
|P68|架构维持公共语义／adapter／shared logic职责且无旧生产双轨|自动：公共调用方复用行为验证＋既有native import责任检查；无额外注册／配置／通用业务State、无native泄漏、无旧生产装配／派发／传输双轨。|[stories 1, 62, 64](spec.md#user-stories)；[已定细节](spec.md#implementation-decisions)|S1, S3, S4, S5|
|P69|headless反馈不向RPC stdout插入非协议文本，控制帧仍可正确解析|自动：隔离真实RPC触发业务错误后继续请求并解析控制帧，stderr有错误且stdout仅协议，Session／出站请求无反馈。 H3条件性：仅本条真实OMP脚本多次失败或成本明显过高才可转人工；永久test cases仍完成，准备具体场景／尝试与原因／步骤／独立预期及自动结果，无转交则无此人工项；未经用户确认不算通过。|inferred — required to fulfill [stories 54, 67](spec.md#user-stories)及既有RPC Interface；非新行为|S5|

## Seam decisions

|Seam|Exposes|Hides|Alternatives considered|Reversibility|
|---|---|---|---|---|
|S1 — Framework 公共绑定与事实 Interface|同一公共声明／工厂／绑定及订阅所交付的命令完成、初始化／清理、实际Session／Turn／Round、当前查看事实和反馈。事实输入由实际OMP adapter与测试adapter变换；不暴露内部派发入口。|原生订阅／可靠关联／候选复查的实现、内部State存储与资源组合。公共处理必须能被调用方与测试通过同一Interface观察。|复用现有公共声明／绑定模式并落实已批准补充；不选独立测试专用dispatcher，避免接口变为内部实现清单；不恢复Owner-only blanket gate。|公共调用方与有效行为测试需一起迁移，影响范围有实质成本；未来Harness添加事实adapter而不复制公共语义，未知能力变化先修合同。|
|S2 — model-cost 只读展示 Interface＋更新订阅|当前目标的只读业务结果与变化通知；同一生产业务入口接公共事实／命令，前端和测试读取同一结果。不同Session、模型、价格和依赖结果在此可观察；纯计算属In-process，不为测试发明额外adapter。|计价／去重／自身聚合／保存／缓存／估计／调度的内部组合，不以私有字段或debug dump作为测试面。|落实上游已批准共享后端／宿主前端seam；不选逐helper测试或第二套累计，不增只供测试的业务控制Interface。|内部组合可改且消费者不变；公开结果含义变化必须修改合同。未来专属前端复用同一业务Interface，本次不实现pi。|
|S3 — Framework 公共 HTTP Interface|调用方实际使用的request及response／reject、配置、代理选择与有限正文超时。生产传输及mock adapter分别满足同一Interface；真实本地目标／代理贯通用于证明兑现传输承诺。|代理解析、底层连接／超时机制；没有provider业务、额外业务envelope、Owner绑定或主动取消。|选已批准单一request，不选raw fetch双轨、参数转发断言或provider专用wrapper；不以mock证明实际代理连接。|实现与底层传输可替换；代理配置／响应／失败语义是调用方承诺，改变时修合同。|
|S4 — Framework 公共安全文件更新 Interface|生产调用方提交的绝对目标／更新函数，取得的当前文档、实际结果及目标文件的完整发布；真实本地文件与多进程竞争观察协调／失败／后续可写。|FIFO尾链、锁元数据、退出确认和临时发布的具体实现；框架不理解消费schema／版本或业务归档。|选已批准单一异步协调读改发布，不选私有锁helpers或内存模拟作安全证明，不把最终rename单独当全部承诺。|内部机制可变；发布及失败语义维持。跨机器协调是规格范围外，不为未来分布式用途扩大Interface。|
|S5 — 隔离OMP的操作者入口与输出|真实加载后的CLI命令／RPC、stderr、模型出站／Session记录、生产消费文档、TUI及独立验证／交付记录；跨真实宿主与受控事实adapter的差异通过同一生产操作者入口验证。既有Harness dock驱动这些入口，不是新增业务Module。|扩展／adapter内部组织、脚本驱动细节；不公开内部controller或helpers，不以执行日志代替视觉／真实provider最终确认。|复用隔离Harness dock／真实操作者入口，不另建验证框架，不选全mock或单widget作为唯一seam：它们不能证明真实接线、数据口径、传输和并发。|验证驱动可更新而用户行为合同保持；宿主公共查看出口由已批准前置补齐，精确artifact为实施输出而非提前捏造的支持声明。|

选择记录：用户批准上述五个外部seams；不采用单一widget观测全部承诺，因为其无法区分身份错配、偷偷直连或磁盘覆盖。也不把内部Modules／helpers列入合同，它们是内部seams，由实现处理。无新增高影响取舍需要新ADR；既定架构与聚合取舍仍由规格所引用原ADR持有。

验收模式选择记录：用户选择Rapid iteration及H1/H2/H3分工。Full automation未采用，因为当前真实服务／视觉最终人工判断及有条件脚本转交是已批准要求，不能无显式上游修订地自动覆盖。少量真实接口冒烟保留原权限／秘密规则，不循环调用，不为达到额度采样门槛制造真实消费。正式切换与回退由用户手动，不能当代理获准执行的验收动作。

六面审视记录（均适用）：入口—S1/S2/S5的命令／查看／loader；数据与State—S1/S2/S4/S5的schema、周期、恢复和有效State；外部依赖—S1/S3/S4/S5；失败—各Interface结果、阶段失败与等待承接；输出—S1/S2/S5的显示、stderr、RPC、文件和报告；资源并发—实例／Owner／timer／网络预算／真实进程文件安全，附在相关seams，不新增资源seam。

依赖分类：计算和受控时间是In-process；本地文件、隔离宿主及目标／代理可用本地验证替代，属Local-substitutable，但真实多进程和底层传输保证不能靠内存替代证明；connect-bot自有panel是Remote but owned，复用生产及受控测试adapter；DeepSeek／Codex是True external (Mock)，永久测试mock、真实最终效果人工。时钟和随机归档身份不预建外部port，按可控输入／独立实际结果验证，随机身份只承诺唯一且拒覆盖，不冻结具体值。

已批准审视发现：P69为RPC反馈约束的必要推导，非新行为；显示正确与实际保存是不同证据；mock、真实本地IO和真实provider证据不互换；失效锁正常恢复不升级为所有未知故障自动修复或硬恢复SLA。用户对此方向明确「同意」，无新行为／范围冲突未决。

## Not yet specified

- 无阻塞合同批准的决定，无已识别待定seam；69条承诺全部有观测位置。
- 延后的执行信息：实际patched artifact／精确revision在实施与独立验证记录；H3最终有哪些具体脚本转人工项须由执行证据列明，没有则无。它们不改变承诺，不是提前免责或当前批准阻塞项。
- 实施若推翻seam或暴露真实需求冲突，先按证据修改合同／必要时修原权威，再重开受影响implementation tickets；不由代码现状静默变更合同。

## Out of scope

完整继承[规格Out of Scope](spec.md#out-of-scope)，本合同不新增排除、不复制范围清单。H1/H2/H3只分配验证责任，不缩减实现或质量；正式环境操作权限与其他范围限制不因合同批准扩大。
