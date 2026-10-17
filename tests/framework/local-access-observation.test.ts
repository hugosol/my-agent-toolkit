/**
 * The observation direction of the framework's local access (P1, P13, P16, P17, P19, P25, P26): the
 * seat one process serves for an owner, and the readings a session the harness runs in another
 * process delivers for the sessions that follow it — including the notice that one of those sessions
 * confirmed a write of its own extension data.
 *
 * The seam under test is the carrier's own public surface — `createOwnerAccessPublisher`'s `receive`,
 * `openOwnerAccess`'s `deliver`, `createObservationDeliverer`, `resolveRuntimeDirectory` and the
 * location record that says where one seat's access is — and underneath it the real thing: every
 * case that says two processes reach each other starts real child processes over a real named pipe
 * or socket file, reads the record the serving process published, and observes what crossed.
 *
 * What is deliberately not doubled: the platform carrier, the child process, and the file the
 * location lives in. Real waits appear only where the observed event belongs to another process — a
 * record appearing, a delivered reading landing — and each is a bounded wait on the other process's
 * own answer rather than a guessed duration.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ObservationSource, ObservedSession, SessionObservationSink } from "../../framework/core/protocol";
import {
	type AccessLocation,
	type AccessTarget,
	createObservationDeliverer,
	createOwnerAccessPublisher,
	type OwnerAccessPublisher,
	type OwnerAccessSource,
} from "../../framework/modules/local-access";
import {
	type ObservationChildPlan,
	type RunningObservationChild,
	startObservationChild,
} from "./support/observation-access-child-runner";

/** One temporary directory that stands in for the repository: a shared configuration and its runtime dir. */
interface Workspace {
	readonly root: string;
	readonly configPath: string;
	/** The directory a `runtimeDir: ".runtime"` value resolves to from this workspace's own file. */
	readonly runtimeDirectory: string;
	configure(text: string): void;
	dispose(): void;
}

function workspace(configured = 'runtimeDir: ".runtime"\n'): Workspace {
	const root = mkdtempSync(path.join(tmpdir(), "framework-observation-access-"));
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
	const directory = mkdtempSync(path.join(tmpdir(), "framework-observation-cwd-"));
	return { directory, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

/** Waits until a condition holds, or states that it never did. */
async function until(condition: () => boolean, message: string, timeoutMs = 10000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(message);
		/* The observed event belongs to another process; there is no clock to advance for it. */
		await Bun.sleep(10);
	}
}

/** What one seat's receiving half recorded: every reading it adopted, and every source that ended. */
interface Receiving {
	readonly sink: SessionObservationSink;
	/** The readings the seat adopted, in the order they arrived. */
	readonly readings: ObservedSession[];
	/** The source each of those readings arrived over, index for index with {@link Receiving.readings}. */
	readonly sources: ObservationSource[];
	/** The sources whose end the seat was told about, in the order it was told. */
	readonly lost: ObservationSource[];
}

/** One seat's receiving half, recording what the access hands it. */
function receiving(): Receiving {
	const readings: ObservedSession[] = [];
	const sources: ObservationSource[] = [];
	const lost: ObservationSource[] = [];
	return {
		readings,
		sources,
		lost,
		sink: {
			adopt: (source, reading) => {
				sources.push(source);
				readings.push(reading);
			},
			lost: source => void lost.push(source),
		},
	};
}

/** Ends one child this case started, whichever way the case went. */
async function ended(child: RunningObservationChild): Promise<void> {
	await child.finish().catch(() => undefined);
}

/** Every location record under one runtime directory. */
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

/** One session's observation, with the facts the process that ran it resolved. */
function reading(
	sessionId: string,
	owner: string,
	readings: { readonly activity?: "working" | "idle"; readonly tokens?: number } = {},
): ObservedSession {
	return {
		session: {
			sessionId,
			kind: "sub",
			parentSessionId: "parent-session",
			name: `name-of-${sessionId}`,
			unavailable: [],
		},
		owner: { kind: "inherited", key: owner },
		...(readings.activity === undefined ? {} : { activity: readings.activity }),
		...(readings.tokens === undefined
			? {}
			: { context: { tokens: readings.tokens, provider: "deepseek", model: "deepseek-flash" } }),
	};
}

/** One plan that opens a seat and delivers the readings it is asked for, under a plan file of its own. */
function planFor(
	ws: Workspace,
	name: string,
	target: AccessTarget,
	readings: readonly ObservedSession[],
	cwd: string,
	extra: Partial<ObservationChildPlan> = {},
): ObservationChildPlan {
	return {
		target,
		readings,
		resultPath: path.join(cwd, `${name}-report.json`),
		configPath: ws.configPath,
		...extra,
	};
}

/** Speaks the access's own protocol directly, as a process that is not this framework's caller would. */
async function speak(endpoint: string, frames: readonly Record<string, unknown>[]): Promise<string> {
	return new Promise<string>((settle, fail) => {
		const socket = connect(endpoint);
		let answer = "";
		const done = (): void => {
			socket.destroy();
			settle(answer);
		};
		socket.setEncoding("utf8");
		socket.setTimeout(5000, done);
		socket.on("data", chunk => {
			answer += chunk;
			// A refusal ends the conversation; anything else is answered once and read to its end.
			if (answer.includes('"refused"')) done();
		});
		socket.on("close", done);
		socket.on("error", error => fail(error));
		socket.on("connect", () => socket.write(frames.map(frame => `${JSON.stringify(frame)}\n`).join("")));
	});
}

/** The readings one serving process has received, asked of it until the count a case awaits is reached. */
async function receivedBy(
	child: RunningObservationChild,
	count: number,
	timeoutMs = 10000,
): Promise<readonly ObservedSession[]> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const report = await child.report();
		if (report.received.length >= count) return report.received;
		if (Date.now() > deadline) {
			throw new Error(`the serving process received ${report.received.length.toString()} readings, not ${count.toString()}`);
		}
	}
}

describe("a session in another process registers with the owner's own process (P1, P25)", () => {
	test("a real process reaches the seat, and each owner's readings arrive with the values it held", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const first: AccessTarget = { extension: "probe-extension", owner: "main:first-owner" };
		const second: AccessTarget = { extension: "probe-extension", owner: "main:second-owner" };
		const publisher: OwnerAccessPublisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const acceptedFirst = receiving();
		const acceptedSecond = receiving();
		publisher.receive(first, acceptedFirst.sink);
		publisher.receive(second, acceptedSecond.sink);
		// The given values: the sessions and readings two independent processes observed.
		const one = reading("first-child", first.owner, { activity: "working" });
		const change = reading("first-child", first.owner, { tokens: 4242 });
		const other = reading("second-child", second.owner, { activity: "working", tokens: 7 });
		const child = startObservationChild(planFor(ws, "first", first, [one, change], cwd.directory), { cwd: cwd.directory });
		const concurrent = startObservationChild(planFor(ws, "concurrent", second, [other], cwd.directory), { cwd: cwd.directory });
		try {
			await Promise.all([child.ready(), concurrent.ready()]);
			child.send({ t: "deliver", index: 0 });
			concurrent.send({ t: "deliver", index: 0 });
			child.send({ t: "deliver", index: 1 });
			await until(() => acceptedFirst.readings.length === 2 && acceptedSecond.readings.length === 1, "the readings never arrived");

			// Each seat carries its own owner's sessions: two owners served at once never cross.
			expect(acceptedFirst.readings).toEqual([one, change]);
			expect(acceptedSecond.readings).toEqual([other]);
			const finished = await child.finish();
			expect(finished.report.reached).toBe(true);
			expect(finished.report.delivered).toEqual(["first-child", "first-child"]);
			expect(finished.report.ended).toBe(false);
			expect(finished.stderr).toBe("");
			const concurrentFinished = await concurrent.finish();
			expect(concurrentFinished.report.reached).toBe(true);
		} finally {
			await Promise.all([ended(child), ended(concurrent)]);
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});

	test("a reading that names another owner is refused, and nothing crosses", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-owner" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const accepted = receiving();
		publisher.receive(target, accepted.sink);
		// A real process with the right seat, delivering one reading under an owner that seat is not.
		const child = startObservationChild(
			planFor(ws, "foreign-owner", target, [reading("child", "main:another-owner", { activity: "working" })], cwd.directory),
			{ cwd: cwd.directory },
		);
		try {
			await child.ready();
			child.send({ t: "deliver", index: 0 });
			// The access closes on the delivering process rather than carrying the reading: a connection
			// enters the observation scope its seat's target allows and nothing else.
			child.send({ t: "await-end" });
			const report = await child.report();
			expect(report.reached).toBe(true);
			expect(report.ended).toBe(true);
			expect(accepted.readings).toEqual([]);
		} finally {
			await ended(child);
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});

	test("a stale record is refused for a real delivering process, and no verification is stated anywhere", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:served-owner" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		publisher.receive(target, receiving().sink);
		const synthetic = "synthetic-verification-1f8c4a5e9d1b";
		const child = startObservationChild(
			planFor(ws, "stale-record", target, [reading("child", target.owner, { activity: "working" })], cwd.directory),
			{ cwd: cwd.directory },
		);
		try {
			// The record now states a verification this access never published, as an access that was
			// replaced would leave behind.
			await until(() => recordsIn(ws.runtimeDirectory).length === 1, "the seat published no record");
			const published = onlyRecord(ws.runtimeDirectory);
			rewriteRecord(ws.runtimeDirectory, { ...published, verification: synthetic });

			await child.ready();
			const finished = await child.finish();
			expect(finished.report.reached).toBe(false);
			expect(finished.report.failure).toContain("LocalAccessUnavailableError");
			// What a refusal must not do is carry the material it was checked against.
			expect(finished.report.failure).not.toContain(synthetic);
			expect(finished.report.failure).not.toContain(published.verification);
			expect(finished.stderr).not.toContain(synthetic);
			expect(finished.stderr).not.toContain(published.verification);
		} finally {
			await ended(child);
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});
});

describe("the access carries its declared directions and nothing else (P25, P26)", () => {
	test("a seat that receives no observations refuses one, and the refusal states no verification", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:values-only" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const values: OwnerAccessSource = { values: () => ({ enabled: true }), observe: () => () => {} };
		const release = publisher.offer(target, values);
		try {
			await until(() => recordsIn(ws.runtimeDirectory).length === 1, "the seat published no record");
			const record = onlyRecord(ws.runtimeDirectory);
			// A connection that speaks the declared hello and then states an observation this seat does
			// not receive is refused rather than interpreted.
			const refused = await speak(record.endpoint, [
				{ t: "hello", extension: target.extension, owner: target.owner, verification: record.verification },
				{ t: "observed", session: { sessionId: "child", kind: "sub", unavailable: [] }, owner: { kind: "inherited", key: target.owner } },
			]);
			expect(refused).toContain('"refused"');
			expect(refused).not.toContain(record.verification);
			expect(refused).not.toContain("child");
		} finally {
			release();
			publisher.dispose();
			ws.dispose();
		}
	});

	test("a reading with no session facts in it is refused rather than adopted", async () => {
		const ws = workspace();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:admitted" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const accepted = receiving();
		publisher.receive(target, accepted.sink);
		try {
			await until(() => recordsIn(ws.runtimeDirectory).length === 1, "the seat published no record");
			const record = onlyRecord(ws.runtimeDirectory);
			const refused = await speak(record.endpoint, [
				{ t: "hello", extension: target.extension, owner: target.owner, verification: record.verification },
				// An identity no host resolved is not one: a reading arrives with the facts that name
				// the session or it does not arrive at all.
				{ t: "observed", owner: { kind: "inherited", key: target.owner }, activity: "working" },
			]);
			expect(refused).toContain('"refused"');
			expect(accepted.readings).toEqual([]);
		} finally {
			publisher.dispose();
			ws.dispose();
		}
	});
});

describe("the location record is where the access is, and nothing else (P26)", () => {
	test("readings change neither the record's content nor what the runtime directory holds", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:record-owner" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const accepted = receiving();
		publisher.receive(target, accepted.sink);
		const delivered = reading("child-of-record", target.owner, { activity: "working", tokens: 4242 });
		const child = startObservationChild(planFor(ws, "record", target, [delivered], cwd.directory), { cwd: cwd.directory });
		try {
			await until(() => recordsIn(ws.runtimeDirectory).length === 1, "the seat published no record");
			const record = onlyRecord(ws.runtimeDirectory);
			const before = readFileSync(path.join(ws.runtimeDirectory, recordsIn(ws.runtimeDirectory)[0]!), "utf8");

			await child.ready();
			child.send({ t: "deliver", index: 0 });
			await until(() => accepted.readings.length === 1, "the reading never arrived");

			// The record says where the access is and nothing about what crosses it: the seat, the
			// endpoint, this access's verification and the process that published it.
			expect(Object.keys(record).sort()).toEqual(["endpoint", "extension", "owner", "pid", "verification"]);
			const after = readFileSync(path.join(ws.runtimeDirectory, recordsIn(ws.runtimeDirectory)[0]!), "utf8");
			expect(after).toBe(before);
			// Nor does a reading leave a file behind: what crossed is not a file this framework reads.
			expect(recordsIn(ws.runtimeDirectory)).toHaveLength(1);
			expect(readdirSync(ws.runtimeDirectory)).toHaveLength(1);
			expect(after).not.toContain("child-of-record");
			expect(after).not.toContain("4242");
		} finally {
			await ended(child);
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});

	test("a configuration that states no runtime directory fails explicitly for both halves", async () => {
		const ws = workspace("http:\n  defaultTimeoutMs: 1000\n");
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:unconfigured" };
		// The serving half: a seat offered with nowhere to publish its record is reported, and the
		// endpoint it would have bound is never written anywhere.
		const reported: string[] = [];
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath, report: message => void reported.push(message) });
		publisher.receive(target, receiving().sink);
		// The delivering half: the same configuration failure, stated as its own failure rather than
		// as an owner that has not arrived.
		const deliverer = createObservationDeliverer({
			extension: "probe-extension",
			configPath: ws.configPath,
			readings: () => [],
			report: message => void reported.push(message),
		});
		deliverer.deliver(reading("child", target.owner, { activity: "working" }));
		const child = startObservationChild(
			planFor(ws, "unconfigured", target, [reading("child-elsewhere", target.owner, { activity: "working" })], cwd.directory),
			{ cwd: cwd.directory },
		);
		try {
			await until(() => reported.length === 2, `the configuration failure was never reported: ${JSON.stringify(reported)}`);
			expect(reported.every(message => message.includes(ws.configPath))).toBe(true);
			expect(reported.every(message => message.includes("runtimeDir") || message.includes("runtime directory"))).toBe(true);
			// No directory was substituted for the one the configuration did not state: not under the
			// working directory this process was started in, and not where the file would have pointed.
			expect(existsSync(path.join(cwd.directory, ".runtime"))).toBe(false);
			expect(existsSync(ws.runtimeDirectory)).toBe(false);

			// The same failure from a real delivering process, which is where a session this harness ran
			// elsewhere really stands.
			await child.ready();
			const finished = await child.finish();
			expect(finished.report.reached).toBe(false);
			expect(finished.report.failure).toContain("LocalAccessConfigurationError");
			expect(finished.report.runtimeDirectoryFailure).toContain(ws.configPath);
			expect(existsSync(ws.runtimeDirectory)).toBe(false);
		} finally {
			await ended(child);
			deliverer.dispose();
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});
});

describe("the delivering half reaches one seat and sends what the process holds (P1)", () => {
	test("the first word carries the readings this process already holds, and the next one follows live", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:delivered-owner" };
		// The serving side is another real process, with the admission sink that receives whatever
		// crosses: what this case observes is one process's deliveries arriving in the other one.
		const serving = startObservationChild(
			{
				target: { extension: "probe-extension", owner: "" },
				readings: [],
				resultPath: path.join(cwd.directory, "serving-report.json"),
				configPath: ws.configPath,
				serve: target,
			},
			{ cwd: cwd.directory },
		);
		// The readings this process holds when it reaches the seat: two already-known ones, one of which
		// is the very reading whose move made it reach. The live change arrives after that.
		const early = reading("live-child", target.owner, { activity: "working" });
		const context = reading("live-child", target.owner, { tokens: 99 });
		const later = reading("live-child", target.owner, { activity: "idle" });
		const deliverer = createObservationDeliverer({
			extension: target.extension,
			configPath: ws.configPath,
			readings: () => [early, context],
		});
		try {
			await serving.ready();
			deliverer.deliver(context);
			// The reach is in flight while this one arrives; what the seat receives first is the state
			// this process holds, which includes both.
			deliverer.deliver(early);
			expect(await receivedBy(serving, 2)).toEqual([early, context]);

			// A reading that moved after the access was reached goes straight onto it.
			deliverer.deliver(later);
			expect(await receivedBy(serving, 3)).toEqual([early, context, later]);
			const finished = await serving.finish();
			expect(finished.report.runtimeDirectory).toBe(ws.runtimeDirectory);
			expect(finished.stderr).toBe("");
		} finally {
			await ended(serving);
			deliverer.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});

	test("a seat that was not there is reached again by the next reading, and the miss is no failure", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:late-owner" };
		const reported: string[] = [];
		// The readings this process holds: the one whose move found nothing to deliver to, and the one
		// that arrives after the owner's own process has begun serving the seat.
		const first = reading("late-child", target.owner, { activity: "working" });
		const later = reading("late-child", target.owner, { tokens: 12 });
		const deliverer = createObservationDeliverer({
			extension: target.extension,
			configPath: ws.configPath,
			readings: () => [first, later],
			waitMs: 300,
			report: message => void reported.push(message),
		});
		const serving = startObservationChild(
			{
				target: { extension: "probe-extension", owner: "" },
				readings: [],
				resultPath: path.join(cwd.directory, "late-serving-report.json"),
				configPath: ws.configPath,
				serve: target,
			},
			{ cwd: cwd.directory },
		);
		try {
			// Nothing serves this seat yet: the reading is delivered nowhere, and no record, directory
			// or endpoint appears for it.
			deliverer.deliver(first);
			expect(existsSync(ws.runtimeDirectory)).toBe(false);

			await serving.ready();
			deliverer.deliver(later);
			// The next real reading is what makes this process reach the seat again, and what that seat
			// receives first is the state this process holds — both readings, in order.
			expect(await receivedBy(serving, 2)).toEqual([first, later]);
			// An access that was not there is not a failure the framework announces.
			expect(reported).toEqual([]);
		} finally {
			await ended(serving);
			deliverer.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});
});

describe("one source's end is this side's own reading of it (P6, P7)", () => {
	test("a real process releasing its access ends one source, with nothing said to the seat about it", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:released-owner" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const accepted = receiving();
		publisher.receive(target, accepted.sink);
		const delivered = reading("child-of-release", target.owner, { activity: "working", tokens: 10 });
		const child = startObservationChild(planFor(ws, "release", target, [delivered], cwd.directory), { cwd: cwd.directory });
		try {
			await child.ready();
			child.send({ t: "deliver", index: 0 });
			await until(() => accepted.readings.length === 1, "the reading never arrived");
			expect(accepted.readings).toEqual([delivered]);
			expect(accepted.lost).toEqual([]);

			// This process releases the access it held while it lives on: the connection ends here, no
			// frame states its end, and what the serving side learns of it is the connection closing.
			child.send({ t: "release" });
			await until(() => accepted.lost.length === 1, "the ended source was never stated to the seat");
			// The source whose end is stated is the one the reading arrived over, and nothing else of the
			// connection crosses: what the seat is told is that this source is gone.
			expect(accepted.lost).toEqual(accepted.sources);
			expect(accepted.readings).toEqual([delivered]);
			// The process itself states that its access ended, and that it reached the seat first.
			const finished = await child.finish();
			expect(finished.report.reached).toBe(true);
			expect(finished.report.ended).toBe(true);
		} finally {
			await ended(child);
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});

	test("a real process ended abruptly ends one source just as well", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:killed-owner" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const accepted = receiving();
		publisher.receive(target, accepted.sink);
		const delivered = reading("child-of-kill", target.owner, { activity: "working", tokens: 11 });
		const child = startObservationChild(planFor(ws, "killed", target, [delivered], cwd.directory), { cwd: cwd.directory });
		try {
			await child.ready();
			child.send({ t: "deliver", index: 0 });
			await until(() => accepted.readings.length === 1, "the reading never arrived");
			expect(accepted.lost).toEqual([]);

			// The process is killed where it stands: it releases nothing, sends nothing and states
			// nothing, and the connection ending is still what the serving side observes.
			child.kill();
			await until(() => accepted.lost.length === 1, "the killed process's source was never stated to the seat");
			expect(accepted.lost).toEqual(accepted.sources);
		} finally {
			await ended(child);
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});

	test("a process that reaches the seat again delivers over a later source, as one connection's word", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:reconnected-owner" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const accepted = receiving();
		publisher.receive(target, accepted.sink);
		const before = reading("child-of-reconnect", target.owner, { activity: "working", tokens: 12 });
		const after = reading("child-of-reconnect", target.owner, { activity: "working", tokens: 13 });
		const child = startObservationChild(planFor(ws, "reconnect", target, [before, after], cwd.directory), { cwd: cwd.directory });
		try {
			await child.ready();
			child.send({ t: "deliver", index: 0 });
			await until(() => accepted.readings.length === 1, "the first reading never arrived");

			// The connection ends, and the process reaches the seat again: what it holds now is what the
			// later connection's first word carries, and the seat is handed it as a word of its own.
			child.send({ t: "release" });
			await until(() => accepted.lost.length === 1, "the ended source was never stated to the seat");
			child.send({ t: "reconnect" });
			child.send({ t: "deliver", index: 1 });
			await until(() => accepted.readings.length === 2, "the reading after the reach never arrived");

			// The two words arrived over two sources this process took up in that order, so a word of the
			// first one's can never be taken for the second one's: the later source is the newer one. And
			// the one end the seat was told about is the connection that ended, not the one that reached
			// it again.
			expect(accepted.sources).toHaveLength(2);
			expect(accepted.sources[1]).toBeGreaterThan(accepted.sources[0]);
			expect(accepted.readings).toEqual([before, after]);
			expect(accepted.lost).toEqual([accepted.sources[0]]);
			// What this process states of itself: it reached the seat again, and the access it holds now
			// is the later one rather than the one it released.
			const finished = await child.finish();
			expect(finished.report.reached).toBe(true);
			expect(finished.report.ended).toBe(false);
			expect(finished.report.delivered).toEqual(["child-of-reconnect", "child-of-reconnect"]);
		} finally {
			await ended(child);
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});

	test("two real processes' words about one session are ordered, and the earlier source's end takes none of them", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:ordered-owner" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const accepted = receiving();
		publisher.receive(target, accepted.sink);
		// The session both processes state, and the values each of them holds for it.
		const early = reading("child-of-order", target.owner, { activity: "working", tokens: 100 });
		const later = reading("child-of-order", target.owner, { activity: "idle", tokens: 200 });
		// The earlier connection's word, written before that connection ends and read after this case has
		// seen the later one's: exactly the late word the order decides the fate of.
		const late = reading("child-of-order", target.owner, { activity: "working", tokens: 300 });
		const first = startObservationChild(planFor(ws, "ordered-first", target, [early, late], cwd.directory), { cwd: cwd.directory });
		const second = startObservationChild(planFor(ws, "ordered-second", target, [later], cwd.directory), { cwd: cwd.directory });
		try {
			// Both connections are admitted here in this order: the first process reaches the seat first,
			// so the word it sends is the one of the earlier source.
			await first.ready();
			await second.ready();
			first.send({ t: "deliver", index: 0 });
			await until(() => accepted.readings.length === 1, "the earlier process's reading never arrived");
			// The same word again: a repeat crosses the carrier, and what this case reads is that the seat
			// is handed it — the framework's own answer to a word it already holds is the bare source's
			// subject, and the suite that drives one seat's readings without a carrier asserts it.
			first.send({ t: "deliver", index: 0 });
			await until(() => accepted.readings.length === 2, "the repeated word never arrived");
			expect(accepted.readings).toEqual([early, early]);
			second.send({ t: "deliver", index: 0 });
			await until(() => accepted.readings.length === 3, "the later process's reading never arrived");

			// The earlier source's late word is written before that connection ends, so this case reads it
			// as read: the connection's own end is what proves the word was processed before it, since a
			// connection's bytes are read before its close.
			first.send({ t: "deliver", index: 1 });
			first.send({ t: "release" });
			await until(() => accepted.lost.length === 1, "the earlier source's end was never stated to the seat");
			await until(() => accepted.readings.length === 4, "the earlier source's late word never arrived");

			// Every word crossed and each one is attributed to the connection it came over: the two words
			// of the first process over the source this side admitted first, the later process's over the
			// one it admitted second, and the end it stated is the earlier source's alone.
			expect(accepted.sources[1]).toBe(accepted.sources[0]);
			expect(accepted.sources[2]).toBeGreaterThan(accepted.sources[0]);
			expect(accepted.sources[3]).toBe(accepted.sources[0]);
			expect(accepted.lost).toEqual([accepted.sources[0]]);
			expect(accepted.readings).toEqual([early, early, later, late]);
			// The order the case controlled is what the seat saw: the earlier source's late word was read
			// after the later source's word, which is the one a newer source is judged against.
			expect(accepted.sources.slice(2)).toEqual([accepted.sources[2], accepted.sources[0]]);
		} finally {
			await ended(first);
			await ended(second);
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});
});

describe("a session's own confirmed write crosses the real access (P17, P19)", () => {
	/** One session's own confirmed write, as the process that confirmed it states it: the count and no content. */
	function notice(sessionId: string, owner: string, commits: number): ObservedSession {
		return { ...reading(sessionId, owner), commits };
	}

	test("a real process's count arrives over the seat as the notice it is, with no content of the storage", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:committed-owner" };
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const accepted = receiving();
		publisher.receive(target, accepted.sink);
		// Independently given values: the session that confirmed a write, and how many it has confirmed.
		const stated = notice("committed-child", target.owner, 1);
		const child = startObservationChild(planFor(ws, "committed", target, [stated], cwd.directory), { cwd: cwd.directory });
		try {
			await child.ready();
			child.send({ t: "deliver", index: 0 });
			await until(() => accepted.readings.length === 1, "the notice never crossed the access");

			// What arrives is the session's own facts, the seat and the count: the member the framework
			// adopts as a notice, rather than a value any consumer could account from.
			expect(accepted.readings).toEqual([stated]);
			expect(Object.keys(accepted.readings[0]!).sort()).toEqual(["commits", "owner", "session"]);
			expect(accepted.readings[0]!.commits).toBe(1);
			const finished = await child.finish();
			expect(finished.report.delivered).toEqual(["committed-child"]);
			expect(finished.stderr).toBe("");
		} finally {
			await ended(child);
			publisher.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});

	test("the delivering half's first word carries the count this process holds, so a lost notice is recoverable", async () => {
		const ws = workspace();
		const cwd = elsewhere();
		const target: AccessTarget = { extension: "probe-extension", owner: "main:late-commit-owner" };
		// The count this process holds for the session it runs, while nothing serves the seat it follows.
		const held = notice("late-committed-child", target.owner, 3);
		const deliverer = createObservationDeliverer({
			extension: target.extension,
			configPath: ws.configPath,
			readings: () => [held],
			waitMs: 300,
		});
		const serving = startObservationChild(
			{
				target: { extension: "probe-extension", owner: "" },
				readings: [],
				resultPath: path.join(cwd.directory, "committed-serving-report.json"),
				configPath: ws.configPath,
				serve: target,
			},
			{ cwd: cwd.directory },
		);
		try {
			// The notice is delivered while nothing serves that owner: it reaches nowhere, and no record
			// or directory is created for it.
			deliverer.deliver(held);
			expect(existsSync(ws.runtimeDirectory)).toBe(false);

			await serving.ready();
			// The session's own next confirmed write is what makes this process reach the seat again, and
			// what that seat receives first is what this process holds now: the count, together with the
			// facts that name the session it belongs to.
			deliverer.deliver(notice("late-committed-child", target.owner, 4));
			expect(await receivedBy(serving, 1)).toEqual([held]);
		} finally {
			await ended(serving);
			deliverer.dispose();
			cwd.dispose();
			ws.dispose();
		}
	});
});
