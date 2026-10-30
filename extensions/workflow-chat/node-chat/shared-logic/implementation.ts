import { defineImplementation } from "../../../../framework/interface";
import { WorkflowRequests } from "../../common/requests";
import { NodeReports } from "./report";
import { NODE_TOOLS } from "./tools";

interface NodeState {
	readonly requests: WorkflowRequests;
	readonly operations: NodeReports;
}

export const NODE_IMPLEMENTATION = defineImplementation<NodeState>({
	create: context => {
		const requests = new WorkflowRequests(context);
		return { requests, operations: new NodeReports(requests) };
	},
	subscriptions: [{ scope: "owner", events: {
		session_start: (state, delivery) => state.requests.start(delivery.session.sessionId),
		session_end: (state, delivery) => state.requests.end(delivery.session.sessionId),
	} }],
	tools: NODE_TOOLS,
	cleanup: state => state.requests.close(),
});
