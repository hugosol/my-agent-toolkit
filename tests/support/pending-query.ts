/**
 * Driving a suite's progress without waiting for a duration, and holding a query open.
 *
 * The extension's provider queries are asynchronous and some of them never answer at all, so a suite
 * needs three things from this module: a way to let the event loop run the code under test to its
 * next resting point (`turn`, `drain`), a way to wait for the one condition a case is about
 * (`until`) instead of for a guessed duration, and a way to be the network that never answers
 * (`heldAnswer`). Nothing here reads a wall clock: a turn is one `setImmediate`, so a slow machine
 * costs more turns and never a wrong answer, and a condition that never holds names itself in the
 * failure rather than surfacing as a timeout somewhere else.
 */

import type { HttpRequestResult } from "../../framework/interface/general/http";

/** One turn of the event loop: `setImmediate` is a loop turn and not a duration. */
export function turn(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
}

/**
 * Let `turns` turns of the loop pass: what a case asserting that something did NOT happen needs, so
 * that every microtask and every already-queued callback of the code under test has run by then.
 */
export async function drain(turns = 64): Promise<void> {
	for (let taken = 0; taken < turns; taken += 1) await turn();
}

/**
 * Drive the loop until one condition holds, or report the condition that never did.
 *
 * This is how a case waits for the extension's own progress — a query that left the process, an
 * initialization that settled — rather than for a duration: a condition that never holds fails the
 * case with what was being waited for.
 */
export async function until(condition: () => boolean, what: string, turns = 5_000): Promise<void> {
	for (let taken = 0; taken < turns && !condition(); taken += 1) await turn();
	if (!condition()) throw new Error(`never happened: ${what}`);
}

/** A read-only view of whether one promise has settled yet. */
export function settled(promise: Promise<unknown>): () => boolean {
	let done = false;
	void promise.then(
		() => {
			done = true;
		},
		() => {
			done = true;
		},
	);
	return () => done;
}

/**
 * One query a case holds open: the network that never answers itself, and the case's own call that
 * ends it. A case that keeps the answer is a case that later answers; a case that drops it is a case
 * whose endpoint never answers at all.
 */
export interface HeldAnswer {
	readonly promise: Promise<HttpRequestResult>;
	readonly answer: (response: HttpRequestResult) => void;
}

/** Hold one query open until this case answers it. */
export function heldAnswer(): HeldAnswer {
	const { promise, resolve } = Promise.withResolvers<HttpRequestResult>();
	return { promise, answer: resolve };
}
