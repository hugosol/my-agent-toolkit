import { expect, test } from "bun:test";
import { customMessages } from "./session-log";
import { promptDock, providerMessages, roleGuidance } from "../workflow-chat/support/prompt-dock";

// S3: the manager must load the same chief handoff instructions as the actual
// independent report entry; loading only the chief tools is insufficient.
test("manager includes the tool guidance loaded by the standalone chief-report entry", async () => {
	const standalone = await promptDock("chief-report");
	try {
		expect((await standalone.session.prompt("Inspect available chief reporting tools.")).status).toBe("completed");
		const guidance = providerMessages(standalone.capture.requests()[0]!)
			.filter(message => message.role !== "system" && message.content.includes("chief_resend_report"));
		expect(guidance).toHaveLength(1);
		const standaloneGuide = guidance[0]!.content;
		const manager = await promptDock("manager");
		try {
			expect((await manager.session.prompt("Inspect available manager tools.")).status).toBe("completed");
			const guide = roleGuidance(manager.capture.requests()[0]!, "manager");
			expect(guide).toContain("当本次工作由 chief 实际委派时，使用 chief 报告工具交接结果；具体资格由后端确认。");
			expect(guide).toContain(standaloneGuide.trim());
		} finally { await manager.close(); }
	} finally { await standalone.close(); }
}, 300_000);

// Approved S1; P26's independent source is the existing first-enabled-run contract:
// identity = extensionId:tag, append-only history, no repeat and no switch reset.
// Violation: reinjecting on every ordinary round or forgetting history on a switch.
for (const role of ["manager", "node"] as const) {
	test(`P26 ${role} Prompt identity is persisted once and ordinary rounds and switches do not reset it`, async () => {
		const dock = await promptDock(role);
		try {
			expect((await dock.session.prompt("FIRST-ENABLED-WORK-26")).status).toBe("completed");
			const guide = roleGuidance(dock.capture.requests()[0]!, role);
			const firstLog = dock.session.sessionLog();
			const identity = `${role}-chat:tools`;
			const first = customMessages(firstLog.entries, identity);
			expect(first).toHaveLength(1);
			expect(first[0]).toMatchObject({ content: guide, display: false });
			expect((await dock.session.prompt("ORDINARY-WORK-26")).status).toBe("completed");
			expect(customMessages(dock.session.sessionLog(firstLog.file).entries, identity)).toEqual(first);
			expect(providerMessages(dock.capture.requests()[dock.capture.requests().length - 1]!).filter(message => message.content === guide)).toHaveLength(1);
			// Public startup policy is once per process; switching to a new owner does not
			// enable a second owner automatically, and switching back cannot spend init again.
			expect((await dock.session.request({ type: "new_session" })).success).toBe(true);
			expect((await dock.session.prompt("OTHER-OWNER-WORK-26")).status).toBe("completed");
			expect(customMessages(dock.session.sessionLog().entries, identity)).toHaveLength(0);
			expect(providerMessages(dock.capture.requests()[dock.capture.requests().length - 1]!).some(message => message.content === guide)).toBe(false);
			expect((await dock.session.request({ type: "switch_session", sessionPath: firstLog.file })).success).toBe(true);
			expect((await dock.session.prompt("RETURNED-OWNER-WORK-26")).status).toBe("completed");
			expect(customMessages(dock.session.sessionLog(firstLog.file).entries, identity)).toEqual(first);
			expect(providerMessages(dock.capture.requests()[dock.capture.requests().length - 1]!).filter(message => message.content === guide)).toHaveLength(1);
		} finally { await dock.close(); }
	}, 300_000);
}
