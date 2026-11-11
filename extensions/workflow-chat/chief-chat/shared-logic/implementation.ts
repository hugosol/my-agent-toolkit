import { defineImplementation } from "../../../../framework/interface";
import { WorkflowRequests } from "../../common/requests";
import { CHIEF_TOOLS } from "./tools";

interface ChiefState { readonly requests: WorkflowRequests; }

export const CHIEF_IMPLEMENTATION = defineImplementation<ChiefState>({
	create: context => ({ requests: new WorkflowRequests(context) }),
	subscriptions: [{ scope: "owner", events: {
		session_start: (state, delivery) => state.requests.start(delivery.session.sessionId),
		session_end: (state, delivery) => state.requests.end(delivery.session.sessionId),
	} }],
	tools: CHIEF_TOOLS,
	cleanup: state => state.requests.close(),
});
