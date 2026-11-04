/** Keep the primary failure and every cleanup failure visible on the ES2020 test target. */
export class ScenarioFailure extends Error {
	constructor(readonly errors: readonly unknown[]) {
		super(errors.map(error => error instanceof Error ? error.stack ?? error.message : String(error)).join("\n--- separate scenario / cleanup failure ---\n"));
		this.name = "ScenarioFailure";
	}
}
