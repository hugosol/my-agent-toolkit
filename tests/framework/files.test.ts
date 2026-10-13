/**
 * The framework's general safe-file module (P48, P49, P50): one public `updateFile` that reads a
 * document under real coordination, hands it to a business update function and publishes what
 * that function returns.
 *
 * The seam under test is S4, the framework's public safe-file Interface: the call `updateFile`
 * exports through `framework/public.ts`, observed as the document its update function is handed,
 * the value it resolves with, the target's real bytes, and the coordination an independent
 * process really meets. Nothing here is simulated: every case runs on a temporary local directory
 * of its own, cross-process cases drive real child processes through the same public entry, and
 * liveness and death are real processes with real process ids. An in-process lock simulation
 * could not stand in for that, so none is used.
 *
 * Expected values come from the contract's own terms (the default 15000ms budget, the failure
 * kinds, "readers see a complete old or new document") and from literals and counters written
 * here — never from the implementation under test.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { SafeFileUpdateError, updateFile } from "../../framework/public";

/** The child entry that performs one update in its own process. */
const CHILD = path.join(import.meta.dir, "support", "file-update-child.ts");

/** The isolated roots this suite made, removed once each case is over. */
const roots: string[] = [];

/** One temporary local root, untouched by any other case and never the real data directory. */
async function isolatedRoot(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "my-agent-toolkit-files-"));
	roots.push(root);
	return root;
}

afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/** One child process driving the public entry, and the events it reported. */
interface Child {
	readonly process: ChildProcess;
	readonly exited: Promise<void>;
	waitFor(event: string): Promise<Record<string, unknown>>;
	kill(): void;
}

/** Starts one child on the isolated root; the parent never shares a lock with a simulated one. */
function startChild(cwd: string, ...args: string[]): Child {
	const child = spawn(process.execPath, [CHILD, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
	const seen: Array<Record<string, unknown>> = [];
	const waiting: Array<{ readonly event: string; readonly resolve: (event: Record<string, unknown>) => void }> = [];
	let stderr = "";
	child.stderr?.on("data", (chunk: unknown) => {
		stderr += String(chunk);
	});
	createInterface({ input: child.stdout! }).on("line", line => {
		let event: Record<string, unknown>;
		try {
			event = JSON.parse(line) as Record<string, unknown>;
		} catch {
			return;
		}
		seen.push(event);
		for (let index = waiting.length - 1; index >= 0; index -= 1) {
			const waiter = waiting[index]!;
			if (waiter.event !== event.event) continue;
			waiting.splice(index, 1);
			waiter.resolve(event);
		}
	});
	return {
		process: child,
		exited: new Promise<void>(resolve => {
			child.on("exit", () => resolve());
		}),
		kill: () => {
			child.kill("SIGKILL");
		},
		waitFor: event => {
			const already = seen.find(entry => entry.event === event);
			if (already !== undefined) return Promise.resolve(already);
			const { promise, resolve, reject } = Promise.withResolvers<Record<string, unknown>>();
			waiting.push({ event, resolve });
			const expiry = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error(`the child never reported "${event}": ${JSON.stringify(seen)} ${stderr}`));
			}, 20000);
			return promise.finally(() => clearTimeout(expiry));
		},
	};
}

/** The outcome of one call, success or rejection, without a throw settling the case early. */
type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

async function outcomeOf<T>(call: Promise<T>): Promise<Outcome<T>> {
	try {
		return { ok: true, value: await call };
	} catch (error) {
		return { ok: false, error };
	}
}

/** The value one outcome carries, refused when a case expected a rejection. */
function valueOf<T>(outcome: Outcome<T>): T {
	if (!outcome.ok) throw new Error(`expected a value, got ${String(outcome.error)}`);
	return outcome.value;
}

/** The rejection one outcome carries, refused when a case expected a value. */
function errorOf(outcome: Outcome<unknown>): unknown {
	if (outcome.ok) throw new Error(`expected a rejection, got ${JSON.stringify(outcome.value)}`);
	return outcome.error;
}

/** The coordination failure one outcome carries, refused when a case expected one and got nothing else. */
function failureOf(outcome: Outcome<unknown>): SafeFileUpdateError {
	const error = errorOf(outcome);
	if (!(error instanceof SafeFileUpdateError)) throw new Error(`expected a SafeFileUpdateError, got ${String(error)}`);
	return error;
}

/** The count one counter document carries, as the cases below read the file back. */
function countOf(document: unknown): number {
	if (typeof document !== "object" || document === null || !("count" in document)) {
		throw new Error(`the document is not a counter: ${JSON.stringify(document)}`);
	}
	const count: unknown = document.count;
	if (typeof count !== "number") throw new Error(`the counter is not a number: ${String(count)}`);
	return count;
}

/** The document one target holds now, parsed. */
async function documentAt(target: string): Promise<unknown> {
	return JSON.parse(await readFile(target, "utf8")) as unknown;
}

/** The lock one target's coordination uses: the parent directory's realpath plus its name. */
function lockPathOf(target: string): string {
	return `${path.join(fs.realpathSync(path.dirname(target)), path.basename(target))}.lock`;
}

describe("the published entry", () => {
	test("hands the update function the current document and publishes what it returns, whatever its shape", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "consumption.json");
		const seen: unknown[] = [];
		const first = await updateFile(target, current => {
			seen.push(current);
			return { schemaVersion: 1, periodId: "7e9983ee", harnesses: { omp: { sessions: [] } } };
		});

		expect(seen).toEqual([undefined]);
		expect(first).toEqual({ schemaVersion: 1, periodId: "7e9983ee", harnesses: { omp: { sessions: [] } } });
		expect(await documentAt(target)).toEqual(first);

		// The module interprets nothing: a shape it has never seen is published as it stands, and
		// the next update is handed that same document.
		const second = await updateFile(target, current => {
			seen.push(current);
			return { anything: ["the caller", "means"], nothing: null };
		});
		expect(seen[1]).toEqual(first);
		expect(await documentAt(target)).toEqual({ anything: ["the caller", "means"], nothing: null });
		expect(second).toEqual({ anything: ["the caller", "means"], nothing: null });
	});

	test("refuses a target whose directory does not exist or whose path is not absolute", async () => {
		const root = await isolatedRoot();
		const absent = failureOf(await outcomeOf(updateFile(path.join(root, "absent", "doc.json"), () => ({}))));
		expect(absent.kind).toBe("io");

		const relative = failureOf(
			await outcomeOf(updateFile(path.join("relative", "doc.json"), () => ({}))),
		);
		expect(relative.kind).toBe("io");
	});
});

describe("one document in one process", () => {
	test("runs one update at a time in submission order, each seeing the previous document", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 0 }));
		const order: string[] = [];

		const results = await Promise.all(
			[1, 2, 3, 4].map(step =>
				updateFile(target, async current => {
					order.push(`enter ${step}`);
					// A real hold inside the update, so a second update that could run would really
					// interleave and lose one: the coordination under test is real time, which no fake
					// clock can drive.
					await Bun.sleep(20);
					order.push(`leave ${step}`);
					return { count: countOf(current) + 1 };
				}),
			),
		);

		expect(order).toEqual([
			"enter 1",
			"leave 1",
			"enter 2",
			"leave 2",
			"enter 3",
			"leave 3",
			"enter 4",
			"leave 4",
		]);
		expect(results).toEqual([{ count: 1 }, { count: 2 }, { count: 3 }, { count: 4 }]);
		expect(await documentAt(target)).toEqual({ count: 4 });
	});

	test("a refused update is the caller's own error, changes nothing, and the document stays usable", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 7 }));
		const refusal = new Error("the document's period is not this instance's period");

		const outcomes = await Promise.all([
			outcomeOf(updateFile(target, current => ({ count: countOf(current) + 1 }))),
			outcomeOf(updateFile(target, () => Promise.reject(refusal))),
			outcomeOf(updateFile(target, current => ({ count: countOf(current) + 1 }))),
		]);

		expect(outcomes[1]!.ok).toBe(false);
		expect(errorOf(outcomes[1]!)).toBe(refusal);
		expect(valueOf(outcomes[0]!)).toEqual({ count: 8 });
		expect(valueOf(outcomes[2]!)).toEqual({ count: 9 });
		expect(await documentAt(target)).toEqual({ count: 9 });
	});

	test("the budget covers the in-process queue, so a call that could not run in time never runs at all", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 0 }));
		const entered = Promise.withResolvers<void>();
		const finishSlow = Promise.withResolvers<void>();
		const slow = updateFile(target, async current => {
			entered.resolve();
			await finishSlow.promise;
			return { count: countOf(current) + 1 };
		});
		await entered.promise;
		const late: unknown[] = [];

		const queued = failureOf(
			await outcomeOf(
				updateFile(
					target,
					current => {
						late.push(current);
						return { count: 99 };
					},
					{ timeoutMs: 300 },
				),
			),
		);

		expect(queued.kind).toBe("timeout");
		expect(late).toEqual([]);
		finishSlow.resolve();
		await slow;
		expect(await documentAt(target)).toEqual({ count: 1 });
	});

	test("a signal aborted after the update began is not a cancellation: the call waits for the real result", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 0 }));
		const controller = new AbortController();
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();

		const call = updateFile(
			target,
			async current => {
				entered.resolve();
				await finish.promise;
				return { count: countOf(current) + 1 };
			},
			{ signal: controller.signal },
		);
		await entered.promise;
		controller.abort();
		finish.resolve();

		expect(await call).toEqual({ count: 1 });
		expect(await documentAt(target)).toEqual({ count: 1 });
	});

	test("a document being updated never holds another one", async () => {
		const root = await isolatedRoot();
		const held = path.join(root, "held.json");
		const free = path.join(root, "free.json");
		await writeFile(held, JSON.stringify({ owner: "holder" }));
		const holder = startChild(root, "hold", held, "4000", JSON.stringify({ owner: "holder" }));
		try {
			await holder.waitFor("locked");
			const started = Date.now();
			const value = await updateFile(free, () => ({ fresh: true }), { timeoutMs: 2000 });
			expect(value).toEqual({ fresh: true });
			expect(Date.now() - started).toBeLessThan(1500);
		} finally {
			holder.kill();
			await holder.exited;
		}
	});
});

describe("a document another process writes", () => {
	test("two independent processes updating it lose no update", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 0 }));
		const writers = [
			startChild(root, "increment", target, "10", "20"),
			startChild(root, "increment", target, "10", "20"),
		];
		try {
			await Promise.all(writers.map(writer => writer.waitFor("done")));
			expect(await documentAt(target)).toEqual({ count: 20 });
		} finally {
			for (const writer of writers) writer.kill();
			await Promise.all(writers.map(writer => writer.exited));
		}
	});

	test("two spellings of its directory are one document: they queue, and a live holder still stops them", async () => {
		const root = await isolatedRoot();
		const nested = path.join(root, "nested");
		await mkdir(nested);
		const target = path.join(root, "counter.json");
		// A different way to write the same directory: the key is the directory's realpath.
		const alias = `${nested}${path.sep}..${path.sep}counter.json`;
		await writeFile(target, JSON.stringify({ count: 0 }));

		const order: string[] = [];
		await Promise.all([
			updateFile(target, async current => {
				order.push("plain");
				await Bun.sleep(30);
				return { count: countOf(current) + 1 };
			}),
			updateFile(alias, async current => {
				order.push("alias");
				await Bun.sleep(30);
				return { count: countOf(current) + 1 };
			}),
		]);
		expect(order).toEqual(["plain", "alias"]);
		expect(await documentAt(target)).toEqual({ count: 2 });

		const holder = startChild(root, "hold", target, "4000", JSON.stringify({ count: 99 }));
		try {
			await holder.waitFor("locked");
			const blocked = failureOf(await outcomeOf(updateFile(alias, () => ({ count: 100 }), { timeoutMs: 400 })));
			expect(blocked.kind).toBe("timeout");
		} finally {
			holder.kill();
			await holder.exited;
		}
	});

	test("a live holder is never taken over, and the call that waited out its budget writes nothing", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 5 }));
		expect(fs.existsSync(lockPathOf(target))).toBe(false);
		const holder = startChild(root, "hold", target, "4000", JSON.stringify({ count: 6 }));
		try {
			await holder.waitFor("locked");
			expect(fs.existsSync(lockPathOf(target))).toBe(true);
			const late: unknown[] = [];
			const started = Date.now();

			const blocked = failureOf(
				await outcomeOf(
					updateFile(
						target,
						current => {
							late.push(current);
							return { count: 1000 };
						},
						{ timeoutMs: 500 },
					),
				),
			);
			const waited = Date.now() - started;

			expect(blocked.kind).toBe("timeout");
			expect(waited).toBeGreaterThanOrEqual(500);
			expect(waited).toBeLessThan(3000);
			expect(late).toEqual([]);
			await holder.waitFor("done");
			// The document after the holder published: the call that waited out its budget left no
			// trace, exactly as its never-called update function says it could not.
			expect(await documentAt(target)).toEqual({ count: 6 });
		} finally {
			holder.kill();
			await holder.exited;
		}
	});

	test("an aborted wait is cancelled, and never becomes a late write", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 5 }));
		const holder = startChild(root, "hold", target, "3000", JSON.stringify({ count: 6 }));
		try {
			await holder.waitFor("locked");
			const controller = new AbortController();
			const late: unknown[] = [];
			const started = Date.now();

			const call = updateFile(
				target,
				current => {
					late.push(current);
					return { count: 1000 };
				},
				{ signal: controller.signal },
			);
			// The caller's own abort, delivered while the call is still waiting: the holder keeps the
			// lock for 3000ms, so the abort cannot land after a lock was acquired.
			setTimeout(() => controller.abort(), 0);
			const cancelled = failureOf(await outcomeOf(call));

			expect(cancelled.kind).toBe("cancelled");
			expect(Date.now() - started).toBeLessThan(2500);
			expect(late).toEqual([]);
			await holder.waitFor("done");
			expect(await documentAt(target)).toEqual({ count: 6 });
		} finally {
			holder.kill();
			await holder.exited;
		}
	});

	test("a lock whose holding process died is recovered, and the next update commits", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 0 }));
		const lockPath = lockPathOf(target);
		const victim = startChild(root, "hold-forever", target, JSON.stringify({ count: 1 }));
		try {
			await victim.waitFor("locked");
			expect(fs.existsSync(lockPath)).toBe(true);
			victim.kill();
			await victim.exited;
			// The holder is really gone; the lock it left behind names a process that no longer exists.
			expect(fs.existsSync(lockPath)).toBe(true);

			const value = await updateFile(
				target,
				current => ({ count: countOf(current) + 1 }),
				{ timeoutMs: 5000 },
			);

			expect(value).toEqual({ count: 1 });
			expect(await documentAt(target)).toEqual({ count: 1 });
			expect(fs.existsSync(lockPath)).toBe(false);
		} finally {
			victim.kill();
			await victim.exited;
		}
	}, 15000);

	test("every process that races to recover one dead lock commits, and the count proves none lost", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 0 }));
		const lockPath = lockPathOf(target);
		const writers = 12;
		let expected = 0;

		for (let round = 0; round < 4; round += 1) {
			// A holder that dies holding the lock. Whether a lock is recoverable is real coordination
			// between real processes and a real dead one, which no in-process fake can stand in for.
			const victim = startChild(root, "hold-forever", target, JSON.stringify({ count: expected }));
			await victim.waitFor("locked");
			victim.kill();
			await victim.exited;
			expect(fs.existsSync(lockPath)).toBe(true);
			expected += writers;

			// Every writer is started before any of them can have finished, so more than one of them
			// really reads the same dead lock and tries to take it: the recovery race this case is
			// about. Each writer's own increment is a whole read-modify-publish, so a process that
			// took the lock from another would lose one of them.
			const racing = Array.from({ length: writers }, () => startChild(root, "increment", target, "1", "0"));
			try {
				await Promise.all(racing.map(writer => writer.waitFor("done")));
				await Promise.all(racing.map(writer => writer.exited));
			} finally {
				for (const writer of racing) writer.kill();
			}
			// Every writer published its own increment, and none of them lost an update to a process
			// that believed it held the same lock.
			expect(await documentAt(target)).toEqual({ count: expected });
		}
		// The last release left no lock behind for the next caller to meet.
		expect(fs.existsSync(lockPath)).toBe(false);
	}, 60000);

	test("the process that recovered a dead lock is a live holder no peer takes it from", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 5 }));
		const victim = startChild(root, "hold-forever", target, JSON.stringify({ count: 6 }));
		try {
			await victim.waitFor("locked");
			victim.kill();
			await victim.exited;

			// The lock this next child meets is a dead one, so its own acquisition is a recovery; it
			// then holds that recovered lock while it works. The hold is a real duration on purpose:
			// the peer below has to arrive while this holder is working, and no fake clock can put a
			// second real process in that window.
			const holder = startChild(root, "hold", target, "2500", JSON.stringify({ count: 6 }));
			try {
				await holder.waitFor("locked");
				const late: unknown[] = [];
				const blocked = failureOf(
					await outcomeOf(
						updateFile(
							target,
							current => {
								late.push(current);
								return { count: 1000 };
							},
							{ timeoutMs: 500 },
						),
					),
				);

				expect(blocked.kind).toBe("timeout");
				expect(late).toEqual([]);
				await holder.waitFor("done");
				// The holder's own write is what the document carries: nothing a peer did replaced it.
				expect(await documentAt(target)).toEqual({ count: 6 });
			} finally {
				holder.kill();
				await holder.exited;
			}
			// Once that holder published and released, the document is writable again.
			expect(await updateFile(target, current => ({ count: countOf(current) + 1 }))).toEqual({ count: 7 });
		} finally {
			victim.kill();
			await victim.exited;
		}
	}, 30000);

	test("with no declared budget the wait is the contract's 15000ms", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, JSON.stringify({ count: 0 }));
		const holder = startChild(root, "hold", target, "60000", JSON.stringify({ count: 1 }));
		try {
			await holder.waitFor("locked");
			const late: unknown[] = [];

			const started = performance.now();
			const blocked = failureOf(
				await outcomeOf(
					updateFile(target, current => {
						late.push(current);
						return { count: 1000 };
					}),
				),
			);
			const waited = performance.now() - started;

			expect(blocked.kind).toBe("timeout");
			expect(waited).toBeGreaterThanOrEqual(15000);
			expect(waited).toBeLessThan(25000);
			expect(late).toEqual([]);
			expect(await documentAt(target)).toEqual({ count: 0 });
		} finally {
			holder.kill();
			await holder.exited;
		}
	}, 40000);

	test("republishing a document never shows a reader a partial one", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		const filler = "x".repeat(20000);
		await writeFile(target, JSON.stringify({ step: 0, filler }));
		const before = await stat(target);

		const writing = (async () => {
			for (let step = 1; step <= 20; step += 1) {
				await updateFile(target, () => ({ step, filler }));
			}
		})();

		let read = 0;
		while (read < 300) {
			const seen = JSON.parse(await readFile(target, "utf8")) as { step?: unknown; filler?: unknown };
			// Every read is a whole document: a reader meets the old one or the new one, never a
			// truncated or half-written one.
			expect(typeof seen.step).toBe("number");
			expect(seen.filler).toBe(filler);
			read += 1;
		}
		await writing;
		// The publication replaced the document instead of rewriting it under its own name: the
		// file the target names is a different file from the one that was read before the update.
		expect((await stat(target)).ino).not.toBe(before.ino);
		expect(await documentAt(target)).toEqual({ step: 20, filler });
	});
});

describe("the target document itself", () => {
	test("a document that is not JSON is refused: the update function is not called and the file is not overwritten", async () => {
		const root = await isolatedRoot();
		const target = path.join(root, "counter.json");
		await writeFile(target, "{ this is not json");
		const seen: unknown[] = [];

		const corrupt = failureOf(
			await outcomeOf(
				updateFile(target, current => {
					seen.push(current);
					return { count: 1 };
				}),
			),
		);

		expect(corrupt.kind).toBe("corrupt");
		expect(seen).toEqual([]);
		expect(await readFile(target, "utf8")).toBe("{ this is not json");

		// The refusal released its own coordination: the document is usable again once it is valid.
		await writeFile(target, JSON.stringify({ count: 3 }));
		expect(await updateFile(target, current => ({ count: countOf(current) + 1 }))).toEqual({ count: 4 });
	});
});
