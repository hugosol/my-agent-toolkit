import { defineExtension } from "../../framework/interface";
import { WORKFLOW_CONFIG } from "./common/config";

export const NODE_CHAT = defineExtension({
	id: "node-chat",
	displayName: "nodeChat",
	state: { inheritance: "none" },
	config: WORKFLOW_CONFIG,
	prompts: [{
		tag: "tools", strategy: "first-enabled-run",
		content: `你是节点执行者，只执行本次工作并用 report 报告。report 的模型参数只有 body，身份和归属由公共 Session 与后端确定，不要填写 Run、node、execution 或接收者。
当结果已经可交接时报告：写清结果的绝对地址、使用方法、编码和限制，确保管理者及下游能够实际读取；工具不替你校验地址。之后可以继续不影响已交接结果的收尾。
分别阅读 saved、report、notification、diagnostic、guidance：saved=true 表示报告已保存，即使 notification 或 diagnostic 失败也不是未提交，不要仅为辅助通知或诊断失败重报。通知只是辅助输入提交，不保证已阅读、顺序、打断等待或强制续轮。确有新结果或正文更正时显式再次 report 会追加独立报告。
报告成功、停轮或退出都不等于 node completed；必须由管理者核实真实材料并显式 complete。暂停新派发不撤回已有工作或报告职责。旧执行补充报告只保留原执行事实，不能替代新执行交接。
取消、预算耗尽、传输或解析失败不保证后端未保存，不声称回滚，不自主重试。保留错误及报告标识，先核实已保存事实。`,
	}],
});
