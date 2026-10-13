/**
 * The one peak/valley boundary timeout a CLI's UI owns.
 *
 * The extension's display shows which season the pricing period is in, and the season changes at an
 * instant nobody sends an event for: the flag on screen would go stale on its own unless something
 * waited for the boundary. This module is that wait, and it is deliberately *one* wait per CLI UI
 * rather than one per session: a session, its subagents and every view change draw one process-wide
 * reading of the same clock and the same schedule, so the redraw is a property of the UI rather than
 * of whoever happens to be displayed — no session arms a timer of its own and no view change rebuilds
 * the one there is.
 *
 * What it owns is only the wait. The instant to wait for is read from outside ({@link BoundaryTimer}
 * takes the schedule as a function), so the pricing rules stay in shared logic and the timer itself
 * holds no season, no window and no clock: it schedules one one-shot timeout for the instant a
 * schedule states, redraws the live frontends when it fires, and then asks for a fresh schedule.
 *
 * The rules that make that one wait rather than a loop:
 *
 * - **Armed once per boundary, not once per redraw.** A redraw that finds the same boundary ahead of
 *   it leaves the armed timeout alone — switching the viewed session, the model or the entry's form
 *   does not cancel and rebuild it — which is why the timer compares the instant it is armed for
 *   rather than re-scheduling on every call.
 * - **Corrected by the clock, not by the timeout.** The delay is measured from the instant the
 *   schedule was read, and the schedule is read again after every firing. A process that was asleep or
 *   blocked through the boundary therefore re-reads the season as it is *now* and arms the next
 *   boundary the schedule states, rather than replaying the one it missed.
 * - **Redrawn, never notified about anything else.** The timer calls the redraws it was handed and
 *   nothing else: it makes no request, writes no file and changes no accounting, and the frontends it
 *   calls re-read the current target through the same read-only result they always draw.
 * - **Dropped when the UI is.** The timeout is cancelled and forgotten on {@link BoundaryTimer.dispose}
 *   and when the registration that held the timeout goes away, so nothing fires into a UI that is
 *   being torn down; a session that reported no UI never registers at all, and no timeout is created
 *   for it.
 */
export interface BoundaryTimerHost {
	/** Schedules one callback to run after `delayMs`; answers the handle the host's own cancel takes. */
	schedule(callback: () => void, delayMs: number): unknown;
	/** Cancels exactly the timer {@link BoundaryTimerHost.schedule} answered with. */
	cancel(handle: unknown): void;
}

/** The schedule one reading of the period states: when it was taken, and when the season changes. */
export interface BoundarySchedule {
	/** The instant the schedule was read at, on the clock the schedule's own boundary is stated in. */
	readonly at: number;
	/** The first instant after {@link BoundarySchedule.at} whose season differs; absent when none does. */
	readonly nextChangeAt?: number;
}

/** The process's one boundary wait: what a frontend registers with, and what its lifecycle drives. */
export interface BoundaryTimer {
	/**
	 * Registers one live frontend: the redraw the boundary triggers, the native timer surface of the
	 * session it draws through, and whether that session is the main one.
	 *
	 * The returned function unregisters it. Registering the first frontend arms the wait; a session
	 * that is not the main one registers the same way, and the wait is still one, because the main
	 * session's own surface is preferred when there is one.
	 */
	attach(render: () => void, host: BoundaryTimerHost, main: boolean): () => void;
	/**
	 * Reconsiders the wait for the schedule as it now reads.
	 *
	 * A redraw calls this: the boundary that is already armed is left alone, one that changed or that
	 * the last firing consumed is replaced, and a schedule with no boundary ahead — an open holiday
	 * period, whose every instant is off-peak — arms nothing.
	 */
	sync(): void;
	/** Cancels the wait and forgets every registration: nothing of this UI outlives it. */
	dispose(): void;
}

interface Registration {
	readonly render: () => void;
	readonly host: BoundaryTimerHost;
	readonly main: boolean;
}

interface Armed {
	readonly boundary: number;
	readonly host: BoundaryTimerHost;
	readonly handle: unknown;
	readonly registration: Registration;
}

/**
 * Build the one boundary wait of a UI, reading the instant to wait for through `readSchedule`.
 *
 * `readSchedule` is asked again after every firing, so the wait is always measured from the latest
 * reading rather than from the one that armed it; nothing is read while no schedule is armed.
 */
export function createBoundaryTimer(readSchedule: () => BoundarySchedule | undefined): BoundaryTimer {
	let registrations: readonly Registration[] = [];
	let armed: Armed | undefined;

	/** The surface the wait is scheduled on: the main session's when it is registered, else any live one. */
	const hostOf = (): Registration | undefined => registrations.find(one => one.main) ?? registrations[0];

	const cancelArmed = (): void => {
		const current = armed;
		armed = undefined;
		if (current !== undefined) current.host.cancel(current.handle);
	};

	const sync = (): void => {
		const schedule = readSchedule();
		if (schedule === undefined) return;
		const boundary = schedule.nextChangeAt;
		if (armed !== undefined && armed.boundary === boundary && registrations.includes(armed.registration)) return;
		cancelArmed();
		if (boundary === undefined) return;
		const registration = hostOf();
		// No live frontend means no UI to draw on: nothing is armed for it, which is what keeps a
		// session without a UI free of any drawing timer.
		if (registration === undefined) return;
		const handle = registration.host.schedule(() => {
			armed = undefined;
			// Every live frontend re-reads the target it displays; each draws the current target, so the
			// boundary redraws the UI as it stands now rather than any context captured when it was armed.
			for (const one of [...registrations]) one.render();
			sync();
		}, Math.max(1, boundary - schedule.at));
		armed = { boundary, host: registration.host, handle, registration };
	};

	return {
		attach(render, host, main) {
			const registration: Registration = { render, host, main };
			registrations = [...registrations, registration];
			sync();
			return () => {
				const wasArmed = armed?.registration === registration;
				registrations = registrations.filter(one => one !== registration);
				if (wasArmed) cancelArmed();
				// A remaining frontend may hold no timeout of its own: the wait is re-established on it, so
				// a session ending never leaves the UI waiting on a timer that died with it.
				sync();
			};
		},
		sync,
		dispose() {
			cancelArmed();
			registrations = [];
		},
	};
}
