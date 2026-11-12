import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { headlessTool } from "../workflow-chat/support/headless-tool";

// Approved S3 seam: actual installed non-UI hosts. The provider and HTTP peer
// below are explicitly controlled mechanical conditions, not routing/model proof.
// Violation: a valid Map preview launches despite no native approval capability.
for (const host of ["omp", "pi"] as const) {
	if (process.env.CHIEF_MAP_UNAVAILABLE_HOST && process.env.CHIEF_MAP_UNAVAILABLE_HOST !== host) continue;
	test(`${host} Map without native confirmation never commits its complete preview`, async () => {
		const requests: { route: string; body: unknown }[] = [];
		const input = { botId: "map-unavailable-13", zoneId: "accept/manager", managerTaskId: "explicit-manager-13",
			input: "Read only the corrected CSV; retain separate internal node management.",
			materials: [{ id: "source", zoneId: "accept/materials", path: "corrected.csv" }] };
		const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
			const route = new URL(request.url).pathname;
			const body = await request.json();
			requests.push({ route, body });
			return Response.json({ previewId: "unavailable-map-preview-13", facts: { request: body,
				bot: { id: input.botId, map_file: "review-13.json" }, task: { id: input.managerTaskId },
				cwd: "C:/owned/manager", name: "Owned Map manager", materials: [{ id: "source", zoneId: "accept/materials", path: "C:/owned/materials/corrected.csv" }],
				map: { file: "review-13.json", zoneBindings: { "accept/node": "C:/owned/node" } }, prompt: input.input } });
		} });
		try {
			const ompPackage = process.env.CHIEF_MAP_UNAVAILABLE_OMP_PACKAGE;
			const result = await headlessTool(host, server.url.origin, "chief", input, ompPackage ? { ompPackage } : {});
			expect(result).toMatchObject({ details: { body: { sent: false,
				reason: expect.stringMatching(/^confirmation-(unavailable|not-approved)$/) } } });
			expect(requests).toHaveLength(1);
			expect(requests[0]?.route).toBe("/api/chief/delegations/preview");
			expect(requests[0]?.body).toMatchObject(input);
			// Child-process platform timers cannot be driven by this test's fake
			// clock. Observe the actual 2000ms budgets after awaited host exit;
			// a late approval cannot revive a commit.
			await Bun.sleep(2100);
			expect(requests).toHaveLength(1);
			const evidence = { verified: true, host, scope: "controlled-protocol-only; real installed no-UI host",
				requestMs: 2000, confirmationMs: 2000, observationMs: 2100, requests, result };
			if (process.env.CHIEF_MAP_UNAVAILABLE_EVIDENCE) writeFileSync(process.env.CHIEF_MAP_UNAVAILABLE_EVIDENCE, JSON.stringify(evidence, null, 2));
		} finally { server.stop(true); }
	}, 300000);
}
