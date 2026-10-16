/**
 * The framework's local access (P42, P56): one process serves the declared values of an owner it
 * holds, and a session this harness ran in another process reads them over a name the platform
 * provides — with the runtime directory stated explicitly and never substituted, with both ends
 * checked against the seat before anything crosses, and with every resource released with the
 * access's life.
 *
 * The seams under test are the framework's own: the module's own surface
 * (`resolveRuntimeDirectory`, `createOwnerAccessPublisher`, `openOwnerAccess`, `localOwnerAccess`
 * in `framework/modules/local-access.ts`), the State store that offers an owner with its life
 * (`framework/core/state.ts`), and the pi assembly that decides whether an owner is offered at all
 * (`framework/adapters/pi.ts`, driven through the pi surface double — the S1 consumption path).
 *
 * What is deliberately not doubled: the carrier. A case that says two processes reach each other
 * starts a real child process (`support/local-access-child.ts`) over a real named pipe or socket
 * file, reads the record the serving process published, and observes what crossed. The
 * configuration cases drive the real read of a real file, with the file's own text as the input.
 *
 * Real waits appear only where the observed event belongs to another process — a record appearing,
 * a released connection being noticed. Deterministic time control cannot reach those, and the
 * waits are bounded by the condition itself rather than by a guessed duration; an open's own wait
 * is the module's bounded budget, which is the mechanism under test rather than a test scaffold.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { StateStore } from "../../framework/core/state";
import { defineExtension } from "../../framework/public";
import {
	type AccessLocation,
	type AccessTarget,
	LocalAccessConfigurationError,
	LocalAccessUnavailableError,
	createOwnerAccessPublisher,
	localOwnerAccess,
	openOwnerAccess,
	type OwnerAccessCaller,
	type OwnerAccessSource,
	resolveRuntimeDirectory,
} from "../../framework/modules/local-access";
import { REPO_ROOT } from "../harness-dock/baseline";
import { type LocalAccessChildResult, startLocalAccessChild } from "./support/local-access-child-runner";
import { boundPiSurface } from "./support/pi-surface-double";

/** The repository's own runtime directory, as its shipped configuration file states it. */
const REPO_RUNTIME_DIRECTORY = path.join(REPO_ROOT, "framework", ".runtime");

/** One temporary directory that stands in for the repository: a shared configuration and its runtime dir. */
interface Workspace {
	readonly root: string;
	readonly configPath: string;
	/** The directory a `runtimeDir: ".runtime"` value resolves to from this workspace's own file. */
	readonly runtimeDirectory: string;
	/** Writes the framework's shared configuration file with this text; answers the path it wrote. */
	configure(text: string): void;
	dispose(): void;
}

function workspace(configured = 'runtimeDir: ".runtime"\n'): Workspace {
	const root = mkdtempSync(path.join(tmpdir(), "framework-local-access-"));
	const directory = path.join(root, "framework");
	mkdirSync(directory, { recursive: true });
	const configPath = path.join(directory, "config.yaml");
	const ws: Workspace = {
		root,
		configPath,
		runtimeDirectory: path.join(directory, ".runtime"),
		configure: text => writeFileSync(configPath, text, "utf8"),
		dispose: () => rmSync(root, { recursive: true, force: true }),
	};
	ws.configure(configured);
	return ws;
}

/** One empty temporary directory: the working directory a real process is started in. */
function elsewhere(): { readonly directory: string; dispose(): void } {
	const directory = mkdtempSync(path.join(tmpdir(), "framework-local-access-cwd-"));
	return { directory, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

/** Waits until a condition holds, or states that it never did. */
async function until(condition: () => boolean | Promise<boolean>, message: string, timeoutMs = 10000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await condition())) {
		if (Date.now() > deadline) throw new Error(message);
		/* The observed event belongs to another process; there is no clock to advance for it. */
		await Bun.sleep(10);
	}
}

/** Every location record under one runtime directory, as the file names a case can read. */
function recordsIn(runtimeDirectory: string): readonly string[] {
	if (!existsSync(runtimeDirectory)) return [];
	return readdirSync(runtimeDirectory).filter(name => name.startsWith("owner-access-"));
}

/** The one location record under a runtime directory, read as the record it publishes. */
function onlyRecord(runtimeDirectory: string): AccessLocation {
	const records = recordsIn(runtimeDirectory);
	if (records.length !== 1) throw new Error(`expected one location record, found ${records.length.toString()}`);
	return JSON.parse(readFileSync(path.join(runtimeDirectory, records[0]!), "utf8")) as AccessLocation;
}

/** Replaces the one location record's content, as a stale or foreign record would state it. */
function rewriteRecord(runtimeDirectory: string, record: Record<string, unknown>): void {
	const records = recordsIn(runtimeDirectory);
	if (records.length !== 1) throw new Error(`expected one location record, found ${records.length.toString()}`);
	writeFileSync(path.join(runtimeDirectory, records[0]!), JSON.stringify(record), "utf8");
}

/** One declared-value source a case drives by hand, with the observations it publishes. */
function sourceAt(initial: boolean): {
	readonly source: OwnerAccessSource;
	set(value: boolean): void;
} {
	const listeners = new Set<(field: string, value: boolean) => void>();
	let value = initial;
	return {
		source: {
			values: () => ({ enabled: value }),
			observe: listener => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		set: next => {
			value = next;
			for (const listener of [...listeners]) listener("enabled", next);
		},
	};
}

/** One child serving a seat over a real carrier, with the directory it was started in. */
interface ServedChild {
	readonly child: ReturnType<typeof startLocalAccessChild>;
	readonly cwd: { readonly directory: string; dispose(): void };
	/** Asks the child to finish and removes the working directory it was started in. */
	finish(): Promise<{ readonly results: LocalAccessChildResult; readonly stderr: string }>;
}

function serveChild(
	ws: Workspace,
	options: { readonly extension: string; readonly owner: string; readonly initial?: boolean },
): ServedChild {
	const cwd = elsewhere();
	const child = startLocalAccessChild(
		{
			extension: options.extension,
			owner: options.owner,
			initial: options.initial ?? false,
			resultPath: path.join(ws.root, "child-result.json"),
			configPath: ws.configPath,
		},
		{ cwd: cwd.directory },
	);
	return {
		child,
		cwd,
		async finish() {
			const answer = await child.finish();
			cwd.dispose();
			return answer;
		},
	};
}

/** The outcome of one open that a case expected to be refused. */
async function refusalOf(open: Promise<unknown>): Promise<LocalAccessUnavailableError> {
	try {
		await open;
	} catch (error) {
		if (error instanceof LocalAccessUnavailableError) return error;
		throw error;
	}
	throw new Error("the access was reached, but the case expected it to be refused");
}

/** What one request of a caller now does: its reason when it is refused, `undefined` while it answers. */
async function refusedReason(caller: OwnerAccessCaller, waitMs = 200): Promise<string | undefined> {
	try {
		await caller.request("enabled", waitMs);
		return undefined;
	} catch (error) {
		return error instanceof LocalAccessUnavailableError ? error.reason : undefined;
	}
}

/**
 * Speaks the access's own protocol directly, as a process that is not this framework's caller would.
 *
 * This is what a stale record, another implementation or a hostile local process would send, and it
 * is the only way to state a frame this module's caller has no method for.
 */
function speak(endpoint: string, frames: readonly Record<string, unknown>[]): Promise<string> {
	return new Promise<string>((settle, fail) => {
		const socket = connect(endpoint);
		let received = "";
		socket.setEncoding("utf8");
		socket.on("data", chunk => {
			received += String(chunk);
			if (received.includes("refused")) socket.destroy();
		});
		socket.on("error", fail);
		socket.on("close", () => settle(received));
		socket.on("connect", () => {
			for (const frame of frames) socket.write(`${JSON.stringify(frame)}\n`);
		});
	});
}

describe("the runtime directory is explicit (P42)", () => {
	test("a relative value resolves against the configuration file's own directory", () => {
		const ws = workspace();
		try {
			// The expectation is the configuration file's own directory plus the declared text,
			// written out here rather than derived from the reader under test.
			expect(resolveRuntimeDirectory({ configPath: ws.configPath })).toBe(path.join(ws.root, "framework", ".runtime"));
		} finally {
			ws.dispose();
		}
	});

	test("an absolute value is used as declared", () => {
		const ws = workspace();
		const target = elsewhere();
		try {
			const declared = target.directory.split("\\").join("/");
			ws.configure(`runtimeDir: "${declared}"\n`);
			expect(resolveRuntimeDirectory({ configPath: ws.configPath })).toBe(declared);
		} finally {
			ws.dispose();
			target.dispose();
		}
	});

	test("a real process started elsewhere locates the same access", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:other-process" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: true });
		try {
			const caller = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			expect(await caller.request("enabled")).toBe(true);
			caller.dispose();
			const answer = await served.finish();
			// The serving process's working directory was a different temporary directory, and its
			// answer names the directory the configuration file resolved to.
			expect(answer.results.runtimeDirectory).toBe(path.join(ws.root, "framework", ".runtime"));
			expect(answer.results.runtimeDirectoryFailure).toBeUndefined();
			expect(answer.results.diagnostics).toEqual([]);
		} finally {
			ws.dispose();
		}
	});

	test("no file, no value, an empty value and a value that is not a string are all refused", () => {
		const cases: readonly { readonly what: string; readonly text?: string; readonly missingFile?: boolean }[] = [
			{ what: "no file at all", missingFile: true },
			{ what: "a file that declares nothing", text: "\n" },
			{ what: "a file with no runtimeDir", text: "http:\n  proxies: {}\n" },
			{ what: "an empty runtimeDir", text: 'runtimeDir: ""\n' },
			{ what: "a blank runtimeDir", text: 'runtimeDir: "   "\n' },
			{ what: "a runtimeDir that is not a string", text: "runtimeDir: 42\n" },
			{ what: "a runtimeDir that is a mapping", text: "runtimeDir:\n  nested: true\n" },
			{ what: "a runtimeDir that is a list", text: "runtimeDir: [a, b]\n" },
		];

		for (const refusal of cases) {
			const ws = workspace();
			try {
				if (refusal.text !== undefined) ws.configure(refusal.text);
				const configPath = refusal.missingFile === true ? path.join(ws.root, "framework", "absent.yaml") : ws.configPath;
				let thrown: unknown;
				try {
					resolveRuntimeDirectory({ configPath });
				} catch (error) {
					thrown = error;
				}
				expect(thrown).toBeInstanceOf(LocalAccessConfigurationError);
				expect((thrown as LocalAccessConfigurationError).detail).toContain(configPath);
				// Nothing was substituted: the configuration file the case wrote is the only entry
				// beside it, and no runtime directory or location record was created anywhere.
				expect(readdirSync(path.join(ws.root, "framework"))).toEqual(["config.yaml"]);
				expect(recordsIn(ws.root)).toEqual([]);
			} finally {
				ws.dispose();
			}
		}
	});

	test("a process with no usable directory reports it and offers nothing", async () => {
		const ws = workspace("http:\n  proxies: {}\n");
		const served = serveChild(ws, { extension: "probe-extension", owner: "main:unconfigured" });
		try {
			// The failure is stated, not substituted: no directory was created beside the
			// configuration file, and the process's own working directory — where a fallback would
			// have written — holds nothing while it runs.
			expect(readdirSync(served.cwd.directory)).toEqual([]);
			expect(readdirSync(path.join(ws.root, "framework"))).toEqual(["config.yaml"]);
			const answer = await served.finish();
			expect(answer.results.diagnostics).toHaveLength(1);
			expect(answer.results.diagnostics[0]).toContain(ws.configPath);
			expect(answer.results.runtimeDirectoryFailure).toContain(ws.configPath);
			expect(existsSync(ws.runtimeDirectory)).toBe(false);
		} finally {
			ws.dispose();
		}
	});

	test("a configuration failure is not a shape a retry repairs", async () => {
		const ws = workspace("http:\n  proxies: {}\n");
		const target: AccessTarget = { extension: "probe-extension", owner: "main:unconfigured" };
		try {
			await expect(
				refusalOf(openOwnerAccess({ target, configPath: ws.configPath, waitMs: 100 })),
			).rejects.toBeInstanceOf(LocalAccessConfigurationError);
			// A second attempt states the same configuration failure rather than waiting for an
			// access this process's configuration can never locate.
			await expect(openOwnerAccess({ target, configPath: ws.configPath, waitMs: 100 })).rejects.toBeInstanceOf(
				LocalAccessConfigurationError,
			);
		} finally {
			ws.dispose();
		}
	});

	test("the repository's own configuration states the directory its runtime files use", () => {
		expect(resolveRuntimeDirectory()).toBe(REPO_RUNTIME_DIRECTORY);
		expect(readFileSync(path.join(REPO_ROOT, "framework", "config.yaml"), "utf8")).toContain('runtimeDir: ".runtime"');
	});
});

describe("one process reads an owner's values from another (P56)", () => {
	test("an independent process publishes, and this one reads its values and its changes", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-session" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: false });
		let secret = "";
		try {
			const caller = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			try {
				expect(caller.values()).toEqual({ enabled: false });
				expect(await caller.request("enabled")).toBe(false);

				const record = onlyRecord(ws.runtimeDirectory);
				secret = record.verification;
				expect(record.extension).toBe(target.extension);
				expect(record.owner).toBe(target.owner);
				expect(record.verification).toMatch(/^[0-9a-f]{64}$/);
				expect(typeof record.pid).toBe("number");
				// The record is the whole of what is published, and it states a location: the seat,
				// the endpoint and this access's verification — no declared value, no State, no
				// business data.
				expect(Object.keys(record).sort()).toEqual(["endpoint", "extension", "owner", "pid", "verification"]);
				expect(recordsIn(ws.runtimeDirectory)).toHaveLength(1);
				if (process.platform === "win32") {
					// The Windows endpoint is a kernel-namespace name, not a second disk directory:
					// it is not a path under the runtime directory and nothing is written beside it.
					expect(record.endpoint.startsWith("\\\\.\\pipe\\")).toBe(true);
					expect(record.endpoint.startsWith(ws.runtimeDirectory)).toBe(false);
				} else {
					// A POSIX endpoint is a socket file, and it is governed by the runtime directory.
					expect(path.dirname(record.endpoint)).toBe(ws.runtimeDirectory);
				}

				const changes: Array<readonly [string, boolean]> = [];
				caller.observe((field, value) => void changes.push([field, value]));
				served.child.send({ t: "set", value: true });
				await until(() => changes.length === 1, "the pushed change never arrived");
				expect(changes[0]).toEqual(["enabled", true]);
				expect(caller.values()).toEqual({ enabled: true });
				// The declaration is read on demand too, not only pushed.
				expect(await caller.request("enabled")).toBe(true);
				// A field this seat does not declare is answered as absent rather than invented.
				expect(await caller.request("unknown")).toBeUndefined();
			} finally {
				caller.dispose();
			}

			const answer = await served.finish();
			expect(answer.results.value).toBe(true);
			expect(answer.results.commands).toEqual(["set:true", "quit"]);
			expect(answer.stderr).not.toContain(secret);
		} finally {
			ws.dispose();
		}
	});

	test("a wait budget this framework cannot schedule is refused on both paths", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-here" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const release = publisher.offer(target, sourceAt(true).source);
		try {
			// The same judgement the framework applies to every declared wait: a budget it cannot
			// schedule is refused rather than replaced, and it is refused whether the seat is served
			// in this process or in another one.
			await expect(openOwnerAccess({ target, configPath: ws.configPath, waitMs: 0 })).rejects.toBeInstanceOf(
				LocalAccessConfigurationError,
			);
			await expect(
				openOwnerAccess({
					target: { extension: "probe-extension", owner: "main:elsewhere" },
					configPath: ws.configPath,
					waitMs: 0,
				}),
			).rejects.toBeInstanceOf(LocalAccessConfigurationError);
		} finally {
			release();
			publisher.dispose();
			ws.dispose();
		}
	});

	test("reading in the process that serves the seat opens nothing and reads the source itself", async () => {
		const absent = path.join(mkdtempSync(path.join(tmpdir(), "framework-local-access-absent-")), "no-config.yaml");
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-here" };
		const publisher = createOwnerAccessPublisher({ configPath: absent });
		const state = sourceAt(false);
		const release = publisher.offer(target, state.source);
		try {
			expect(localOwnerAccess(target)).toBe(state.source);
			// A caller in this process is answered by the source: it reads the current value, and it
			// observes a change because the value changed rather than because a frame arrived. The
			// configuration path does not exist, so a caller that went through the runtime directory
			// could not have answered at all.
			const caller = await openOwnerAccess({ target, configPath: absent, waitMs: 200 });
			const observed: Array<readonly [string, boolean]> = [];
			caller.observe((field, value) => void observed.push([field, value]));
			expect(caller.values()).toEqual({ enabled: false });
			state.set(true);
			expect(caller.values()).toEqual({ enabled: true });
			expect(await caller.request("enabled")).toBe(true);
			expect(observed).toEqual([["enabled", true]]);
			caller.dispose();
		} finally {
			release();
			publisher.dispose();
		}
		expect(localOwnerAccess(target)).toBeUndefined();
	});
});

describe("an access serves its own seat and nothing else (P56)", () => {
	test("another verification is refused and no values cross", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-session" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: true });
		const synthetic = "synthetic-verification-6f0c4a5e9d1b";
		try {
			const opened = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			opened.dispose();
			const record = onlyRecord(ws.runtimeDirectory);
			rewriteRecord(ws.runtimeDirectory, { ...record, verification: synthetic });

			const refusal = await refusalOf(openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 }));
			expect(refusal.reason).toBe("refused");
			// What a refusal must not do is carry the secret it was checked against, or a value.
			expect(refusal.detail).not.toContain(synthetic);
			expect(refusal.detail).not.toContain(record.verification);

			const answer = await served.finish();
			expect(answer.stderr).not.toContain(synthetic);
			expect(JSON.stringify(answer.results)).not.toContain(synthetic);
			expect(JSON.stringify(answer.results)).not.toContain(record.verification);
		} finally {
			ws.dispose();
		}
	});

	test("a record filed under one seat and naming another is read as no record at all", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-session" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: true });
		try {
			const opened = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			opened.dispose();
			// `main:other-session` is a seat this endpoint never served; the record now names it
			// while still being filed under the seat it was published for.
			rewriteRecord(ws.runtimeDirectory, { ...onlyRecord(ws.runtimeDirectory), owner: "main:other-session" });

			const missing = await refusalOf(
				openOwnerAccess({ target, configPath: ws.configPath, waitMs: 500 }),
			);
			expect(missing.reason).toBe("no-location");
			await served.finish();
		} finally {
			ws.dispose();
		}
	});

	test("the endpoint serves its own seat and refuses a frame for any other", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-session" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: true });
		try {
			const opened = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			opened.dispose();
			const record = onlyRecord(ws.runtimeDirectory);

			const foreign = await speak(record.endpoint, [
				{
					t: "hello",
					extension: target.extension,
					owner: "main:other-session",
					verification: record.verification,
				},
			]);
			expect(foreign).toContain('"refused"');
			expect(foreign).not.toContain("welcome");

			// A frame that is not the declared read is refused rather than interpreted, even when it
			// carries the shape of one — so this access carries no method name and no argument list,
			// and it is not a general RPC surface.
			const writing = await speak(record.endpoint, [
				{ t: "hello", extension: target.extension, owner: target.owner, verification: record.verification },
				{ t: "write", id: 1, field: "enabled", value: false },
			]);
			expect(writing).toContain('"refused"');
			expect(writing).not.toContain('"value"');

			// Nothing crossed either way: the serving process still holds the value it started with.
			const caller = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			expect(await caller.request("enabled")).toBe(true);
			caller.dispose();
			const answer = await served.finish();
			expect(answer.results.value).toBe(true);
		} finally {
			ws.dispose();
		}
	});

	test("an old endpoint is reported as absent rather than reached", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-session" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: true });
		try {
			const opened = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			opened.dispose();
			const record = onlyRecord(ws.runtimeDirectory);
			const stale =
				process.platform === "win32"
					? `\\\\.\\pipe\\my-agent-toolkit-access-${"0".repeat(16)}`
					: path.join(ws.runtimeDirectory, "access-0000000000000000.sock");
			rewriteRecord(ws.runtimeDirectory, { ...record, endpoint: stale });

			const absent = await refusalOf(openOwnerAccess({ target, configPath: ws.configPath, waitMs: 5000 }));
			expect(absent.reason).toBe("endpoint-absent");
			expect(absent.detail).not.toContain(record.verification);
			await served.finish();
		} finally {
			ws.dispose();
		}
	});

	test("a released access leaves no record, and a reader it left open is released with it", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-session" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: true });
		try {
			const caller = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			expect(await caller.request("enabled")).toBe(true);

			// The owner's life ends: the access is withdrawn with it, and it is not reoffered.
			served.child.send({ t: "end" });
			await until(() => recordsIn(ws.runtimeDirectory).length === 0, "the location record outlived the access");
			await until(
				async () => (await refusedReason(caller)) === "closed",
				"the released access left its reader answering",
			);
			caller.dispose();

			const gone = await refusalOf(openOwnerAccess({ target, configPath: ws.configPath, waitMs: 300 }));
			expect(gone.reason).toBe("no-location");
			const answer = await served.finish();
			expect(answer.results.commands).toEqual(["end", "quit"]);
		} finally {
			ws.dispose();
		}
	});

	test("a record that cannot be read is read as no record", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-session" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: true });
		try {
			const opened = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			opened.dispose();
			const records = recordsIn(ws.runtimeDirectory);
			// A record whose text is not one this module reads states no location: it is read as no
			// record rather than parsed into an endpoint nobody published.
			writeFileSync(path.join(ws.runtimeDirectory, records[0]!), "{ this is not a record", "utf8");
			const broken = await refusalOf(openOwnerAccess({ target, configPath: ws.configPath, waitMs: 400 }));
			expect(broken.reason).toBe("no-location");

			// A record that names this seat but states no readable endpoint or verification is a
			// record that cannot be followed: it is read as no record rather than connected to.
			writeFileSync(
				path.join(ws.runtimeDirectory, records[0]!),
				JSON.stringify({ extension: target.extension, owner: target.owner, endpoint: 7, verification: "" }),
				"utf8",
			);
			const incomplete = await refusalOf(openOwnerAccess({ target, configPath: ws.configPath, waitMs: 400 }));
			expect(incomplete.reason).toBe("no-location");
			await served.finish();
		} finally {
			ws.dispose();
		}
	});

	test("a disposed access releases its records and the endpoint itself", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-session" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: true });
		try {
			const opened = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			opened.dispose();
			const record = onlyRecord(ws.runtimeDirectory);

			served.child.send({ t: "dispose" });
			await until(() => recordsIn(ws.runtimeDirectory).length === 0, "the disposed access left its record");

			// The endpoint is released with the access, not merely emptied: there is no listener left
			// for a later connection to reach, so a disposal cannot leave a process answering for a
			// seat it no longer serves.
			await expect(
				speak(record.endpoint, [
					{ t: "hello", extension: target.extension, owner: target.owner, verification: record.verification },
				]),
			).rejects.toBeTruthy();

			const gone = await refusalOf(openOwnerAccess({ target, configPath: ws.configPath, waitMs: 300 }));
			expect(gone.reason).toBe("no-location");
			const answer = await served.finish();
			expect(answer.results.commands).toEqual(["dispose", "quit"]);
		} finally {
			ws.dispose();
		}
	});

	test("the verification is only ever in the location record", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-session" };
		const served = serveChild(ws, { extension: target.extension, owner: target.owner, initial: true });
		try {
			const caller = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			const record = onlyRecord(ws.runtimeDirectory);
			const secret = record.verification;
			expect(secret).toMatch(/^[0-9a-f]{64}$/);
			try {
				// What the access states to a reader carries the seat and never what it was checked
				// by: the values a caller reads and the values a caller caches.
				expect(JSON.stringify(caller.values())).not.toContain(secret);
				expect(await caller.request("enabled")).toBe(true);
				expect(JSON.stringify(caller.values())).not.toContain(secret);
			} finally {
				caller.dispose();
			}

			// The runtime directory's own artifacts hold the secret in exactly one place: the
			// location record this access published, which is where a reader is meant to find it.
			const carriers = readdirSync(ws.runtimeDirectory).filter(name =>
				readFileSync(path.join(ws.runtimeDirectory, name), "utf8").includes(secret),
			);
			expect(carriers).toHaveLength(1);

			const answer = await served.finish();
			expect(answer.stderr).not.toContain(secret);
			expect(JSON.stringify(answer.results)).not.toContain(secret);
		} finally {
			ws.dispose();
		}
	});

	test("withdrawing one seat releases its own reader and leaves the other seat's reader answering", async () => {
		const ws = workspace();
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const first = sourceAt(true);
		const second = sourceAt(false);
		const firstSeat: AccessTarget = { extension: "probe-extension", owner: "main:first-seat" };
		const secondSeat: AccessTarget = { extension: "probe-extension", owner: "main:second-seat" };
		const releaseFirst = publisher.offer(firstSeat, first.source);
		const releaseSecond = publisher.offer(secondSeat, second.source);
		const reader = readingChild(ws, [firstSeat, secondSeat]);
		try {
			await reader.child.ready();
			const opened = await reader.child.report();
			expect(opened.readers.map(one => [one.owner, one.values?.enabled, one.request?.value])).toEqual([
				["main:first-seat", true, true],
				["main:second-seat", false, false],
			]);

			// One owner's life ends while another seat of the same process keeps serving: the
			// released seat's reader is released with it, and the other seat is untouched — no
			// cross-seat effect in either direction.
			releaseFirst();
			await until(() => recordsIn(ws.runtimeDirectory).length === 1, "the withdrawn seat's record remained");
			second.set(true);
			// The withdrawn seat's reader learns of it from its own connection, without asking the
			// access for anything — a released seat does not wait to be discovered by a read.
			reader.child.send({ t: "await-end", owner: firstSeat.owner });
			const ended = await reader.child.report();
			expect(ended.readers.map(one => [one.owner, one.endedWithoutAsking])).toEqual([["main:first-seat", true]]);

			const after = await reader.child.report();
			expect(after.readers[0]?.ended).toBe(true);
			expect(after.readers[0]?.request?.reason).toBe("closed");
			expect(after.readers[0]?.observed).toEqual([]);
			expect(after.readers[1]?.ended).toBe(false);
			expect(after.readers[1]?.values).toEqual({ enabled: true });
			expect(after.readers[1]?.observed).toEqual([["enabled", true]]);
			expect(after.readers[1]?.request?.value).toBe(true);
			releaseSecond();
		} finally {
			void (await reader.finish());
			publisher.dispose();
			ws.dispose();
		}
	});
});

/** One child that reads seats over the access another process published, and disposes its directory. */
function readingChild(ws: Workspace, reads: readonly AccessTarget[]): ServedChild {
	const cwd = elsewhere();
	const child = startLocalAccessChild(
		{
			extension: "probe-reader",
			owner: "main:reader",
			initial: false,
			offer: false,
			reads,
			resultPath: path.join(ws.root, "reader-result.json"),
			configPath: ws.configPath,
		},
		{ cwd: cwd.directory },
	);
	return {
		child,
		cwd,
		async finish() {
			const answer = await child.finish();
			cwd.dispose();
			return answer;
		},
	};
}

describe("the framework offers an owner's access with the owner's life (S1)", () => {
	test("a store offers the owner it serves, and withdraws the offer when its life ends", async () => {
		const ws = workspace();
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const store = new StateStore({
			field: "enabled",
			persistence: "session-entry",
			localAccess: { extension: "probe-extension", publisher },
		});
		const target: AccessTarget = { extension: "probe-extension", owner: "main:store-session" };
		try {
			store.reconcile({
				owner: { kind: "owner", key: target.owner },
				event: { kind: "session_start", reason: "new" },
				statePayloads: [{ enabled: true }],
				publishMarker: () => {},
			});
			// A reader in another process is what the record is for; the open's own wait is what
			// makes a record that is still being published an answer rather than a guess.
			const caller = await openOwnerAccess({ target, configPath: ws.configPath, waitMs: 10000 });
			expect(await caller.request("enabled")).toBe(true);
			caller.dispose();
			await until(() => recordsIn(ws.runtimeDirectory).length === 1, "the store published no location record");
			const record = onlyRecord(ws.runtimeDirectory);
			expect(record.owner).toBe(target.owner);
			expect(record.extension).toBe(target.extension);

			store.reconcile({
				owner: { kind: "owner", key: target.owner },
				event: { kind: "session_end", reason: "disposed" },
				statePayloads: [],
				publishMarker: () => {},
			});
			await until(() => recordsIn(ws.runtimeDirectory).length === 0, "the offer outlived the owner's life");
			expect(localOwnerAccess(target)).toBeUndefined();
		} finally {
			publisher.dispose();
			ws.dispose();
		}
	});

	test("the pi assembly offers an owner only for a follow field in a host that spawns sessions", async () => {
		const follow = defineExtension({
			id: "local-access-follow-probe",
			displayName: "localAccessFollowProbe",
			state: { inheritance: "follow" },
		});
		const plain = defineExtension({ id: "local-access-plain-probe", displayName: "localAccessPlainProbe" });
		const childEntry = path.join(REPO_ROOT, "entrypoints", "pi", "model-cost.ts");
		rmSync(REPO_RUNTIME_DIRECTORY, { recursive: true, force: true });
		try {
			const offering = boundPiSurface({ definition: follow, childEntry });
			offering.sessionStarts({ sessionId: "pi-follow-session" }, "new");
			const target: AccessTarget = { extension: follow.id, owner: "main:pi-follow-session" };
			expect(localOwnerAccess(target)).toBeDefined();
			await until(() => recordsIn(REPO_RUNTIME_DIRECTORY).length === 1, "the pi offer published no record");
			const record = onlyRecord(REPO_RUNTIME_DIRECTORY);
			expect(record.owner).toBe(target.owner);
			expect(record.extension).toBe(follow.id);
			// The read itself is the same-process one: a session in this process reads the store it
			// serves, and the record is what a session in another process would use.
			const caller = await openOwnerAccess({ target, configPath: path.join(REPO_ROOT, "framework", "config.yaml"), waitMs: 10000 });
			expect(await caller.request("enabled")).toBe(false);
			caller.dispose();

			offering.sessionShutsDown({ sessionId: "pi-follow-session" }, "quit");
			await until(() => recordsIn(REPO_RUNTIME_DIRECTORY).length === 0, "the pi offer outlived the session");

			// A host that states no child entry runs every session in this process: there is nothing
			// an outside session could reach, so nothing is offered.
			const inProcess = boundPiSurface({ definition: follow });
			inProcess.sessionStarts({ sessionId: "pi-in-process-session" }, "new");

			// A field that declares no follow is never read as another session's value, so an owner
			// of one is not offered either.
			const spawning = boundPiSurface({ definition: plain, childEntry });
			spawning.sessionStarts({ sessionId: "pi-plain-session" }, "new");

			// Neither offers anything: a process that would have published states no record, and the
			// state of the store they serve is the ordinary in-process one.
			const absent = await refusalOf(
				openOwnerAccess({
					target: { extension: follow.id, owner: "main:pi-in-process-session" },
					configPath: path.join(REPO_ROOT, "framework", "config.yaml"),
					waitMs: 300,
				}),
			);
			expect(absent.reason).toBe("no-location");
			expect(localOwnerAccess({ extension: plain.id, owner: "main:pi-plain-session" })).toBeUndefined();
			expect(recordsIn(REPO_RUNTIME_DIRECTORY)).toEqual([]);
		} finally {
			rmSync(REPO_RUNTIME_DIRECTORY, { recursive: true, force: true });
		}
	});
});
