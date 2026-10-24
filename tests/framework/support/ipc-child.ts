import { existsSync, readFileSync } from "node:fs";

/** Owns the process and its pipes from spawn through EOF, including failed readiness/report waits. */
export function ipcChild<Report>(entry: string, planFile: string, cwd: string, budgetMs = 15000) {
	const child = Bun.spawn([process.execPath, entry, planFile], {
		cwd, env: process.env, stdin: "pipe", stdout: "pipe", stderr: "pipe",
	});
	const stdoutReader = child.stdout.getReader();
	const stderrReader = child.stderr.getReader();
	const stderr = (async () => {
		let written = "";
		const decoder = new TextDecoder();
		try {
			while (true) {
				const { done, value } = await stderrReader.read();
				if (done) break;
				written += decoder.decode(value, { stream: true });
			}
		} catch (error) {
			fail(error instanceof Error ? error : new Error(String(error)));
		} finally {
			written += decoder.decode();
			stderrReader.releaseLock();
		}
		return written;
	})();
	const reports: Report[] = [];
	const waiters: Array<ReturnType<typeof Promise.withResolvers<Report>>> = [];
	const ready = Promise.withResolvers<void>();
	// EOF can arrive before anyone asks for readiness.
	void ready.promise.catch(() => {});
	let failure: Error | undefined;
	let killed = false;
	let finished: Promise<{ value: unknown; stderr: string }> | undefined;
	function fail(error: Error) {
		failure ??= error;
		ready.reject(failure);
		for (const waiter of waiters.splice(0)) waiter.reject(failure);
	}
	let stopped: Promise<void> | undefined;
	function stop(): Promise<void> {
		stopped ??= (async () => {
			if (child.exitCode === null) child.kill("SIGKILL");
			try { child.stdin.end(); } finally {
				await child.exited;
				// On Windows/Bun a killed child can exit without completing its pending pipe reads.
				// Cancel through the owned readers before awaiting either pump; stderr retains all
				// bytes already collected, and each pump releases its reader lock in finally.
				await Promise.allSettled([stdoutReader.cancel(), stderrReader.cancel()]);
				await Promise.all([pump, stderr]);
			}
		})();
		return stopped;
	}
	async function bounded<T>(operation: Promise<T>, label: string, timeoutMs = budgetMs): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const expired = Promise.withResolvers<never>();
			timer = setTimeout(() => expired.reject(new Error(`${entry}: ${label} exceeded ${timeoutMs}ms`)), timeoutMs);
			return await Promise.race([operation, expired.promise]);
		} catch (error) {
			fail(error instanceof Error ? error : new Error(String(error)));
			await stop();
			throw new Error(`${failure!.message}; stderr: ${await stderr}`, { cause: error });
		} finally {
			clearTimeout(timer);
		}
	}
	const pump = (async () => {
		try {
			let buffer = "";
			const decoder = new TextDecoder();
			while (true) {
				const { done, value: chunk } = await stdoutReader.read();
				if (done) break;
				buffer += decoder.decode(chunk, { stream: true });
				let end: number;
				while ((end = buffer.indexOf("\n")) >= 0) {
					const line = buffer.slice(0, end);
					buffer = buffer.slice(end + 1);
					if (!line.trim()) continue;
					const value = JSON.parse(line);
					if (value.t === "ready") ready.resolve();
					else {
						const waiter = waiters.shift();
						if (waiter) waiter.resolve(value as Report);
						else reports.push(value as Report);
					}
				}
			}
			fail(new Error(`${entry}: stdout EOF before the next answer${buffer ? ` (partial line: ${buffer})` : ""}`));
		} catch (error) {
			fail(error instanceof Error ? error : new Error(String(error)));
		} finally {
			stdoutReader.releaseLock();
		}
	})();
	void child.exited.then(code => fail(new Error(`${entry}: exited ${code}`)));
	function send(command: Record<string, unknown>) {
		if (failure) throw failure;
		child.stdin.write(`${JSON.stringify(command)}\n`);
		child.stdin.flush();
	}
	return {
		send,
		ready: () => bounded(ready.promise, "ready"),
		async ask(command: Record<string, unknown>, timeoutMs = budgetMs): Promise<Report> {
			if (failure) return bounded(Promise.reject(failure), "report", timeoutMs);
			const waiter = Promise.withResolvers<Report>();
			const queued = reports.shift();
			if (queued === undefined) waiters.push(waiter);
			else waiter.resolve(queued);
			try { send(command); } catch (error) { waiter.reject(error); }
			return bounded(waiter.promise, "report", timeoutMs);
		},
		finish(resultPath: string): Promise<{ value: unknown; stderr: string }> {
			finished ??= (async () => {
				try {
					if (killed) throw new Error(`${entry}: process was ended abruptly`);
					send({ t: "quit" });
					const code = await bounded(child.exited, "quit");
					await stop();
					if (code !== 0 || !existsSync(resultPath)) throw new Error(`${entry}: exited ${code} without a successful result; stderr: ${await stderr}`);
					return { value: JSON.parse(readFileSync(resultPath, "utf8")), stderr: await stderr };
				} finally { await stop(); }
			})();
			return finished;
		},
		kill() { killed = true; child.kill("SIGKILL"); },
		stop,
	};
}
