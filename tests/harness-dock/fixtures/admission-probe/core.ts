/**
 * The shared half of the admission probes: two dock fixture extensions that each load this
 * module — and the framework's decision module it imports — in their own module graph, and report
 * what their graph's version decision was.
 *
 * The OMP legacy loader rewrites every relative import of an extension's graph to
 * `specifier?mtime=<per-load tag>`, with a fresh tag per extension load, so the two probes hold two
 * copies of this module *and* two copies of `framework/core/admission.ts`, exactly as this
 * repository's own two extensions do. What they share is the process: the framework's decision
 * record is keyed by version on the process global, so one value is handed to every copy.
 *
 * The report names both facts, on the session's own stderr: whether this graph decided the version
 * or read the decision another graph made, and whether its decision module really is a copy of its
 * own. The second fact is what keeps the run honest — if the loader had deduped the two graphs into
 * one, the sharing would be trivially true and the report says so.
 */
import { type AdmissionOutcome, admit } from "../../../../framework/core/admission";

/** Where the probes agree on what the process has already decided, and on the function that did it. */
const PROBE_SCOPE_KEY: unique symbol = Symbol.for("my-agent-toolkit.tests.admission-probe");

/** What the first reporting graph leaves for the others: its decision module and the decisions made. */
interface ProbeRecord {
	/** The `admit` function of the graph that reported first. */
	readonly admit: typeof admit;
	/** One decided outcome per version a graph reported. */
	readonly decisions: Map<string, AdmissionOutcome>;
}

/** The process global, narrowed to the one entry the probes read and write. */
interface ProbeScope {
	[PROBE_SCOPE_KEY]?: ProbeRecord;
}

/** The record every probe graph shares, opened by the first one to report. */
function probeRecord(): ProbeRecord {
	const scope = globalThis as ProbeScope;
	const registered = scope[PROBE_SCOPE_KEY];
	if (registered !== undefined) return registered;

	const opened: ProbeRecord = { admit, decisions: new Map<string, AdmissionOutcome>() };
	scope[PROBE_SCOPE_KEY] = opened;
	return opened;
}

/**
 * Decides `version` in this graph's copy of the framework's decision module and reports what came
 * of it: `decided` for the graph that made the decision the process now holds, `shared` for one
 * that read it, and `separate` for one that answered with a decision of its own — the shape the
 * run must never show.
 */
export function reportVersionDecision(label: string, version: string | undefined): void {
	const record = probeRecord();
	const reported = typeof version === "string" && version.length > 0 ? version : "unreported";
	const outcome = admit(version === undefined ? {} : { version });

	const known = record.decisions.get(reported);
	if (known === undefined) {
		record.decisions.set(reported, outcome);
		process.stderr.write(`${label}: decided ${reported} (${outcome.kind})\n`);
		return;
	}

	const verdict = known === outcome ? "shared" : "separate";
	const copies = record.admit === admit ? "same admission module" : "distinct admission module";
	process.stderr.write(`${label}: ${verdict} ${reported} (${outcome.kind}) (${copies})\n`);
}
