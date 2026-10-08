/**
 * Harness fixture extension: a second consumer of the framework in one session's process.
 *
 * The OMP legacy loader rewrites every relative import of an extension's graph to
 * `specifier?mtime=<per-load tag>`, with a fresh tag per extension load, so this fixture and the
 * repository's own extension hold two copies of the framework — two notice records if the record
 * were a module's own. What they share is the process, and what a notice suite observes is whether
 * the two of them together tell one main session once.
 *
 * It registers no behavior of its own: its whole effect is the session delivery the framework's
 * binding subscribes, which is what makes its binding indistinguishable from the repository's own
 * extension for the purpose of the notice. It reads no native fact beyond the surface the loader
 * hands every extension factory.
 */
import { ompAdapter } from "../../../../framework/adapters/omp";
import { defineExtension } from "../../../../framework/public";

/**
 * The display name this extension binds under.
 *
 * It is distinctive on purpose: an unlisted-version notice must name the framework and no
 * extension, so a run that carried this name would be naming an extension's binding rather than
 * the framework's own warning.
 */
export const NOTICE_PEER_DISPLAY_NAME = "admissionNoticePeer";

/** The definition the fixture assembles: no commands, no configuration, no declared dependency. */
const definition = defineExtension({
	id: "admission-notice-peer",
	displayName: NOTICE_PEER_DISPLAY_NAME,
});

/** One assembly per module graph, as every extension has: the loader calls this factory on load. */
const factory = ompAdapter(definition);

export default function admissionNoticePeer(pi: Parameters<typeof factory>[0]): void {
	factory(pi);
}
