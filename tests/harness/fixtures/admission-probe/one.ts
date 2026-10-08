/**
 * Harness fixture extension: the first of the two admission probes (see `./core`).
 *
 * It is loaded explicitly through `-e`, exactly as this repository's own extensions are, and
 * registers nothing: its whole effect is the line it writes about the version decision its own
 * module graph resolved. The native surface stays narrowed to the one fact it reads — the SDK
 * namespace that carries the runtime's reported version — so the probe names no framework type
 * beyond the decision it is about.
 */
import { reportVersionDecision } from "./core";

/** The one native fact this probe reads: the version the runtime's SDK namespace reports. */
interface AdmissionProbeApi {
	readonly pi?: { readonly VERSION?: string };
}

export default function admissionProbeOne(pi: AdmissionProbeApi): void {
	reportVersionDecision("admission-probe-one", pi.pi?.VERSION);
}
