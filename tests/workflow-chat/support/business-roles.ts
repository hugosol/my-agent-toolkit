import { defineExtension } from "../../../framework/interface";
import { WorkflowRequests } from "../../../extensions/workflow-chat/common/requests";
import { ManagerActions } from "../../../extensions/workflow-chat/manager-chat/shared-logic/actions";
import { NodeReports } from "../../../extensions/workflow-chat/node-chat/shared-logic/report";
import { portDouble } from "../../framework/support/harness-port-double";

let fixtureId = 0;

/** Real framework configuration and Session observations, without any native tool schema. */
export function businessRoles(endpoint: string) {
	const port = portDouble();
	let requests: WorkflowRequests | undefined;
	const binding = port.bind(defineExtension({
		id: `workflow-business-${++fixtureId}`,
		displayName: "Workflow business behavior",
		config: { fields: { endpoint: "non-empty-string", requestTimeoutMs: "milliseconds", collectTimeoutMs: "milliseconds" } },
	}), {
		config: { reader: () => `endpoint: ${JSON.stringify(endpoint)}\nrequestTimeoutMs: 2000\ncollectTimeoutMs: 3000\n` },
		factory: context => {
			requests = new WorkflowRequests(context);
			return {};
		},
	});
	if (!binding.bound || !requests) throw new Error(`Business fixture binding failed: ${port.diagnostics.join("; ")}`);
	const sessionId = "business-native-session";
	port.deliverSession({ kind: "owner", key: "main:workflow-business" }, {
		session: { sessionId, kind: "main", unavailable: [] },
	});
	requests.start(sessionId);
	return {
		sessionId,
		manager: new ManagerActions(requests),
		node: new NodeReports(requests),
		close: () => requests!.close(),
	};
}
