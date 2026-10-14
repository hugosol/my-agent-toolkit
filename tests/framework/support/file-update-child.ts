/**
 * The one update one child process performs, driven by the files suite
 * (`tests/framework/files.test.ts`), so the coordination between independent processes is
 * observed on real processes and a real local directory instead of a lock simulated inside the
 * test process.
 *
 * It goes through the framework's public entry — the same `updateFile` shared logic imports —
 * and reports one JSON object per line on stdout:
 *
 * - `{"event":"locked"}` once it holds the document's cross-process lock;
 * - `{"event":"done","value":…}` when its update finished;
 * - `{"event":"failed","kind":…,"detail":…}` when a coordination failure ended it, or
 *   `{"event":"failed","name":…,"detail":…}` for anything else.
 *
 * Modes (`<mode> <absolute target> …`):
 *
 * - `write <target> <document-json>` — one update that returns the given document;
 * - `increment <target> <times> <hold-ms>` — `times` read-modify-publish steps over `{count: n}`,
 *   each holding the lock for `hold-ms` so a missing lock loses updates reliably;
 * - `hold <target> <hold-ms> <document-json>` — take the lock, announce it, publish after
 *   `hold-ms`;
 * - `hold-forever <target> <document-json>` — take the lock, announce it, and never publish, so
 *   the parent can kill the holder while it holds the lock.
 */
import { SafeFileUpdateError, updateFile } from "../../../framework/public";

/** One event this child reports, exactly as the parent reads it. */
type ChildEvent = Record<string, unknown>;

const [mode, target, ...rest] = process.argv.slice(2);

function report(event: ChildEvent): void {
	process.stdout.write(`${JSON.stringify(event)}\n`);
}

function countOf(document: unknown): number {
	if (typeof document !== "object" || document === null || !("count" in document)) return 0;
	const count: unknown = document.count;
	return typeof count === "number" ? count : 0;
}

function documentOf(text: string | undefined): unknown {
	if (text === undefined) throw new Error("this mode needs a document to publish");
	return JSON.parse(text) as unknown;
}

async function main(): Promise<void> {
	switch (mode) {
		case "write": {
			const document = documentOf(rest[0]);
			report({ event: "done", value: await updateFile(target!, () => document) });
			return;
		}
		case "increment": {
			const times = Number(rest[0]);
			const holdMs = Number(rest[1]);
			for (let step = 0; step < times; step += 1) {
				await updateFile(target!, async current => {
					const count = countOf(current);
					await Bun.sleep(holdMs);
					return { count: count + 1 };
				});
			}
			report({ event: "done" });
			return;
		}
		case "hold": {
			const holdMs = Number(rest[0]);
			const document = documentOf(rest[1]);
			const value = await updateFile(target!, async () => {
				report({ event: "locked" });
				await Bun.sleep(holdMs);
				return document;
			});
			report({ event: "done", value });
			return;
		}
		case "hold-forever": {
			const document = documentOf(rest[0]);
			await updateFile(target!, () => {
				report({ event: "locked" });
				return new Promise<unknown>(() => undefined);
			});
			report({ event: "done" });
			return;
		}
		default:
			throw new Error(`unknown mode ${String(mode)}`);
	}
}

try {
	await main();
} catch (error) {
	if (error instanceof SafeFileUpdateError) {
		report({ event: "failed", kind: error.kind, detail: error.detail });
	} else {
		report({
			event: "failed",
			name: error instanceof Error ? error.name : "Error",
			detail: error instanceof Error ? error.message : String(error),
		});
	}
	process.exitCode = 1;
}
