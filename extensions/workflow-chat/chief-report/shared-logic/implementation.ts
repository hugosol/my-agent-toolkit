import { defineImplementation } from "../../../../framework/interface";
import { WorkflowRequests } from "../../common/requests";
import { CHIEF_REPORT_TOOL, CHIEF_RESEND_REPORT_TOOL } from "../../common/chief-report";

interface ReportState { readonly requests: WorkflowRequests; }

export const CHIEF_REPORT_IMPLEMENTATION = defineImplementation<ReportState>({
	create: context => ({ requests: new WorkflowRequests(context) }),
	subscriptions: [{ scope: "owner", events: {
		session_start: (state, delivery) => state.requests.start(delivery.session.sessionId),
		session_end: (state, delivery) => state.requests.end(delivery.session.sessionId),
	} }],
	tools: [CHIEF_REPORT_TOOL, CHIEF_RESEND_REPORT_TOOL],
	cleanup: state => state.requests.close(),
});