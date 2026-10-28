import { expect, test } from "bun:test";
import { promptDock } from "../workflow-chat/support/prompt-dock";

// S1/P8. Independent outcome: explicit binding/configuration failure, not an empty
// tool set treated as success. Violation: fall back to valid cwd/ID-derived config.
// Each deployment has a valid tempting fallback endpoint; observe both the actual
// host diagnostic and zero HTTP calls, for both independent role IDs.
for (const role of ["manager", "node"] as const) {
	for (const failure of ["missing", "yaml", "business"] as const) {
		test(`P8 ${role} ${failure} configuration fails recognizably without a fallback request`, async () => {
			const calls: string[] = [];
			const fallback = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(request) {
				calls.push(request.url); return Response.json({ forbiddenFallback: true });
			} });
			const endpoint = `http://127.0.0.1:${fallback.port}`;
			const valid = `endpoint: ${endpoint}\nrequestTimeoutMs: 3000\ncollectTimeoutMs: 6000\n`;
			const config = failure === "missing" ? null : failure === "yaml" ? "endpoint: [unterminated\n" : `endpoint: ${endpoint}\nrequestTimeoutMs: 0\ncollectTimeoutMs: 6000\n`;
			try {
				const dock = await promptDock(role, { config, misleadingConfig: valid });
				try {
					expect((await dock.session.prompt("CONFIGURATION-FAILURE-ACCEPTANCE")).status).toBe("completed");
					const diagnostics = `${dock.session.stderr()}\n${JSON.stringify(dock.session.frames())}`;
					expect(diagnostics).toContain(`${role}-chat`);
					expect(diagnostics).toContain("configuration");
					expect(diagnostics).toContain("extensions");
					expect(diagnostics).toContain("workflow-chat");
					expect(diagnostics).toContain(failure === "missing" ? "does not exist" : failure === "yaml" ? "not valid YAML" : 'requestTimeoutMs');
					if (failure === "business") expect(diagnostics).toContain("milliseconds");
					const first = dock.capture.requests()[0]!.json as { tools: { function: { name: string } }[] };
					for (const name of ["run", "collect", "report"]) expect(first.tools.some(tool => tool.function.name === name)).toBe(false);
					expect(calls).toEqual([]);
					console.log(JSON.stringify({ promise: "P8", role, failure, diagnostic: dock.session.stderr(), fallbackRequests: calls.length }));
				} finally { await dock.close(); }
			} finally { fallback.stop(true); }
		}, 300_000);
	}
}
