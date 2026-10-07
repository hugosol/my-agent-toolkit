/**
 * The process's stderr, captured while one block runs.
 *
 * The non-model reporting channel of a binding is the process's own stderr: the OMP adapter
 * writes one line per refused binding there. A suite that observes a refusal — or that
 * asserts a binding reported nothing — reads that stream rather than reaching into framework
 * internals, so this is the shared capture for both shapes of a test body: one whose value is
 * returned, and one whose value is awaited (a real loader call).
 */

/** What one capture observed: the text written to stderr, and the run's own value. */
export interface CapturedStderr<T> {
	readonly stderr: string;
	readonly value: T;
}

interface Capture {
	/** Restores the stream and answers everything it received while captured. */
	take(): string;
}

function beginCapture(): Capture {
	const chunks: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	}) as typeof process.stderr.write;
	return {
		take() {
			process.stderr.write = original;
			return chunks.join("");
		},
	};
}

/** Runs `run` while capturing stderr; the stream is restored before this returns. */
export function withCapturedStderr<T>(run: () => T): CapturedStderr<T> {
	const capture = beginCapture();
	try {
		const value = run();
		return { stderr: capture.take(), value };
	} catch (error) {
		capture.take();
		throw error;
	}
}

/**
 * The same capture around a run that awaits.
 *
 * A loader call is asynchronous (module import plus binding), so the stream is restored once
 * `run` settles rather than when it is entered.
 */
export async function withCapturedStderrAsync<T>(run: () => Promise<T>): Promise<CapturedStderr<T>> {
	const capture = beginCapture();
	try {
		const value = await run();
		return { stderr: capture.take(), value };
	} catch (error) {
		capture.take();
		throw error;
	}
}
