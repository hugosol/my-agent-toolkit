import { defineImplementation } from "../../../../framework/interface";
import { WorkflowRequests } from "../../common/requests";
import { ManagerActions } from "./actions";
import { MANAGER_TOOLS } from "./tools";

interface ManagerState {
	readonly requests: WorkflowRequests;
	readonly operations: ManagerActions;
}

export const MANAGER_IMPLEMENTATION = defineImplementation<ManagerState>({
	create: context => {
		const requests = new WorkflowRequests(context);
		return { requests, operations: new ManagerActions(requests) };
	},
	subscriptions: [{ scope: "owner", events: {
		session_start: (state, delivery) => state.requests.start(delivery.session.sessionId),
		session_end: (state, delivery) => state.requests.end(delivery.session.sessionId),
	} }],
	tools: MANAGER_TOOLS,
	cleanup: state => state.requests.close(),
});
