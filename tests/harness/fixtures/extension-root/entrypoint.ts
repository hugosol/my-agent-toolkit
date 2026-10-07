/**
 * Harness fixture extension: one command that persists a non-LLM custom entry, one that
 * navigates the session tree to a given entry, and one hidden persisted contribution
 * appended on every agent-run initiation.
 *
 * Both effects are observable through consumer-visible surfaces a controlled session
 * already exposes (session JSONL, captured outbound request), so the harness test can
 * verify start / command / turn / read-back without any framework code existing yet.
 */
export const FIXTURE_EXTENSION_LABEL = "harness-fixture";
export const FIXTURE_COMMAND = "harness-probe";
export const FIXTURE_COMMAND_ENTRY_TYPE = "harness-probe:command";
export const FIXTURE_TREE_COMMAND = "harness-tree";
export const FIXTURE_TREE_ENTRY_TYPE = "harness-probe:tree";
export const FIXTURE_INJECTION_TYPE = "harness-probe:injection";
export const FIXTURE_INJECTION_TEXT = "harness-fixture-injection";

interface FixtureContext {
	agent?: { kind?: string; id?: string };
	/** Present on the command context: the runtime's own session-tree navigation. */
	navigateTree?(targetId: string): Promise<{ cancelled: boolean }>;
}

interface FixtureExtensionApi {
	setLabel(label: string): void;
	registerCommand(
		name: string,
		options: { description?: string; handler: (args: string, ctx: FixtureContext) => void | Promise<void> },
	): void;
	appendEntry(customType: string, data: unknown): void;
	on(
		event: "before_agent_start",
		handler: (event: unknown, ctx: FixtureContext) => { message: Record<string, unknown> } | undefined,
	): void;
}

export default function harnessFixtureExtension(pi: FixtureExtensionApi): void {
	pi.setLabel(FIXTURE_EXTENSION_LABEL);
	pi.registerCommand(FIXTURE_COMMAND, {
		description: "Harness fixture command: persist one non-LLM custom entry",
		handler: (args, ctx) => {
			pi.appendEntry(FIXTURE_COMMAND_ENTRY_TYPE, { args, agentKind: ctx?.agent?.kind ?? null });
		},
	});
	pi.registerCommand(FIXTURE_TREE_COMMAND, {
		description: "Harness fixture command: navigate the session tree to an entry id",
		handler: async (args, ctx) => {
			const targetId = args.trim();
			if (targetId.length === 0) throw new Error(`${FIXTURE_TREE_COMMAND} requires an entry id`);
			if (!ctx.navigateTree) throw new Error(`${FIXTURE_TREE_COMMAND}: this session has no tree navigation`);
			const result = await ctx.navigateTree(targetId);
			pi.appendEntry(FIXTURE_TREE_ENTRY_TYPE, { targetId, cancelled: result.cancelled });
		},
	});
	pi.on("before_agent_start", () => ({
		message: {
			customType: FIXTURE_INJECTION_TYPE,
			content: FIXTURE_INJECTION_TEXT,
			display: false,
			attribution: "agent",
		},
	}));
}
