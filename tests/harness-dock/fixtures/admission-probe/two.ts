/**
 * Dock fixture extension: the second of the two admission probes (see `./core`).
 *
 * Same shape as `./one`, loaded beside it in one session's process. Two extensions, two module
 * graphs: this is the pair whose reports say whether the framework judged the reported version
 * once and handed that one decision to both graphs, or once per graph.
 */
import { reportVersionDecision } from "./core";

/** The one native fact this probe reads: the version the harness's SDK namespace reports. */
interface AdmissionProbeApi {
	readonly pi?: { readonly VERSION?: string };
}

export default function admissionProbeTwo(pi: AdmissionProbeApi): void {
	reportVersionDecision("admission-probe-two", pi.pi?.VERSION);
}
