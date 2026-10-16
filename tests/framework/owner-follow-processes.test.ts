/**
 * The followed State read across two real processes (S2; contract P14, P15, P16).
 *
 * A subagent session a harness ran elsewhere is a real second process, and whether it reaches the
 * Owner that holds the value is a fact about the process that serves that Owner, the carrier
 * between them and the framework's own reading half — none of which an in-memory stand-in can
 * establish. This suite therefore starts two: `local-access-child.ts` serves one seat through the
 * framework's `StateStore` and its published access, and `followed-owner-child.ts` follows it
 * through the extension's own public consumption (the prompt a run initiation contributes, the
 * value a session delivery reads, the line the marker projects).
 *
 * What the suite drives is the sequence the acceptance asks for: the follower reads what the Owner
 * holds, the Owner changes it after the follower started, the Owner goes away and the follower
 * keeps working on the declared default, and the Owner is served again and the follower reads it
 * once more. Every report is the child's own answer on stdout, so nothing here waits on a guessed
 * duration; only the events that belong to the other process are waited for, and each wait is
 * bounded by the condition itself.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
	startFollowedOwnerChild,
	type FollowedOwnerChildReport,
	type RunningFollowedOwnerChild,
} from "./support/followed-owner-child-runner";
import { startLocalAccessChild } from "./support/local-access-child-runner";

/** One temporary directory that stands in for the repository: a shared configuration and its runtime dir. */
interface Workspace {
	readonly root: string;
	readonly configPath: string;
	readonly runtimeDirectory: string;
	dispose(): void;
}

function workspace(): Workspace {
	const root = mkdtempSync(path.join(tmpdir(), "framework-owner-follow-"));
	const directory = path.join(root, "framework");
	mkdirSync(directory, { recursive: true });
	const configPath = path.join(directory, "config.yaml");
	writeFileSync(configPath, 'runtimeDir: ".runtime"\n', "utf8");
	return {
		root,
		configPath,
		runtimeDirectory: path.join(directory, ".runtime"),
		dispose: () => rmSync(root, { recursive: true, force: true }),
	};
}

/** One empty temporary directory: the working directory a real process is started in. */
function elsewhere(): { readonly directory: string; dispose(): void } {
	const directory = mkdtempSync(path.join(tmpdir(), "framework-owner-follow-cwd-"));
	return { directory, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

/** One process serving a seat, over a working directory of its own. */
function serving(ws: Workspace, extension: string, owner: string, initial: boolean) {
	const cwd = elsewhere();
	const child = startLocalAccessChild(
		{ extension, owner, initial, resultPath: path.join(ws.root, "serving-result.json"), configPath: ws.configPath },
		{ cwd: cwd.directory },
	);
	return {
		child,
		async stop(): Promise<void> {
			await child.finish();
			cwd.dispose();
		},
	};
}

/** One process following that seat, over a working directory of its own. */
function following(ws: Workspace, extension: string, owner: string): {
	readonly child: RunningFollowedOwnerChild;
	stop(): Promise<void>;
} {
	const cwd = elsewhere();
	const child = startFollowedOwnerChild(
		{ extension, owner, configPath: ws.configPath, resultPath: path.join(ws.root, "following-result.json") },
		{ cwd: cwd.directory },
	);
	return {
		child,
		async stop(): Promise<void> {
			await child.finish();
			cwd.dispose();
		},
	};
}

/** Waits until a read answers what the case expects, or reports what it kept answering instead. */
async function readUntil(
	child: RunningFollowedOwnerChild,
	expected: boolean,
	what: string,
	timeoutMs = 15000,
): Promise<FollowedOwnerChildReport> {
	const deadline = Date.now() + timeoutMs;
	let last: FollowedOwnerChildReport | undefined;
	while (Date.now() < deadline) {
		last = await child.read();
		if (last.active === expected) return last;
		// The event being waited for belongs to the other process — a record appearing, a change
		// arriving, an access being reached — so there is no clock to advance for it. The wait is
		// bounded by the condition and the budget is the framework's own.
		await Bun.sleep(25);
	}
	throw new Error(`the follower never read ${what}: ${JSON.stringify(last)}`);
}

/** Every location record under a runtime directory, as a case can read the files. */
function recordsIn(runtimeDirectory: string): readonly string[] {
	if (!existsSync(runtimeDirectory)) return [];
	return readdirSync(runtimeDirectory).filter(name => name.startsWith("owner-access-"));
}

describe("a session another process runs reads the Owner's current value (P14, P15)", () => {
	test("the follower reads what the serving process holds, then follows its change", async () => {
		const ws = workspace();
		const extension = "followed-probe";
		const owner = "main:owner-session";
		const server = serving(ws, extension, owner, true);
		const follower = following(ws, extension, owner);
		try {
			await Promise.all([server.child.ready(), follower.child.ready()]);

			// The read that establishes the access answers the declared default — the framework's
			// semantic use point never waits for another process — and the run after it is the Owner's
			// own value.
			const first = await follower.child.read();
			expect(first.active).toBe(false);
			const reached = await readUntil(follower.child, true, "the value the serving process holds");
			expect(reached.markers).toEqual(["◈ followedOwnerProbe"]);

			// The same value is what a session delivery this process receives reads, and the follow
			// records nothing in this process's own persistence medium: the value belongs to the Owner.
			const delivery = await follower.child.deliver();
			expect(delivery.active).toBe(true);
			expect(delivery.persisted).toBe(0);

			// The Owner changes after the follower started: the change is pushed over the access, so
			// the follower's next read is the new value rather than the one it first reached.
			server.child.send({ t: "set", value: false });
			const changed = await readUntil(follower.child, false, "the Owner's new value");
			expect(changed.markers).toEqual([]);

			// And back again, so the reading follows both directions.
			server.child.send({ t: "set", value: true });
			await readUntil(follower.child, true, "the Owner's value after it turned back on");
		} finally {
			await follower.stop();
			await server.stop();
			ws.dispose();
		}
	});

	test("the Owner going away leaves the follower on the declared default, and serving it again brings the value back", async () => {
		const ws = workspace();
		const extension = "followed-recovery-probe";
		const owner = "main:recovering-owner";
		const server = serving(ws, extension, owner, true);
		const follower = following(ws, extension, owner);
		try {
			await Promise.all([server.child.ready(), follower.child.ready()]);
			await readUntil(follower.child, true, "the value the serving process holds");

			// The seat is withdrawn — the Owner's own life ended, as a disposed session ends it. The
			// follower keeps working on the declared default, which is what a subagent that cannot
			// reach its Owner's State does: no failure and no unbounded wait, and the value that was
			// there is not kept as if it were still true.
			server.child.send({ t: "end" });
			await readUntil(follower.child, false, "the declared default after the seat was withdrawn");

			// A process serves the same seat again, and the follower reads it once more: recovery is
			// what happens to the reads after it, and the deliveries it already saw are not replayed.
			const second = serving(ws, extension, owner, true);
			try {
				await second.child.ready();
				await readUntil(follower.child, true, "the value once the seat was served again");
			} finally {
				await second.stop();
			}
		} finally {
			await follower.stop();
			await server.stop();
			ws.dispose();
		}
	});

	test("a disposed follower stops reading, and holds no seat open", async () => {
		const ws = workspace();
		const extension = "followed-dispose-probe";
		const owner = "main:disposing-owner";
		const server = serving(ws, extension, owner, true);
		const follower = following(ws, extension, owner);
		try {
			await Promise.all([server.child.ready(), follower.child.ready()]);
			await readUntil(follower.child, true, "the value the serving process holds");
			expect(recordsIn(ws.runtimeDirectory)).toHaveLength(1);

			// The access this process read through is released with the session that made it: no later
			// read opens one again, whatever the serving process does next.
			follower.child.dispose();
			await follower.child.read();
			server.child.send({ t: "set", value: true });
			const after = await follower.child.read();
			expect(after.active).toBe(false);
			expect(after.markers).toEqual([]);
		} finally {
			await follower.stop();
			await server.stop();
			ws.dispose();
		}
	});
});
