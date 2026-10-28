import { expect, test } from "bun:test";
import { nodeDock, toolText } from "./support/node-dock";

// S1/P16: literal backend save-failure response. A wrapper that drops the non-2xx body or
// claims a report exists cannot pass. The real HTTP exchange remains in the exercised path.
test("P16 saving failure remains unsaved with notification not attempted and no automatic resubmission", async () => {
	let requests = 0;
	const failure = { code: "report-save-failed", saved: false, error: "messages.jsonl: access denied", notification: { status: "not-attempted" } };
	const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch() { requests++; return Response.json(failure, { status: 500 }); } });
	const dock = await nodeDock(`http://127.0.0.1:${server.port}`, "交接在 E:/result；禁止生产使用。");
	try {
		expect((await dock.session.prompt("提交交接正文一次")).status).toBe("completed");
		expect(JSON.parse(toolText(dock))).toEqual(failure);
		// Bounded external-process retry observation; fake clocks cannot advance the actual OMP child.
		await Bun.sleep(150);
		expect(requests).toBe(1);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
