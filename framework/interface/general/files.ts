/**
 * The general safe-file module's extension-facing entry: the one coordinated read-modify-publish
 * call, what one update declares, and the distinguishable failure it can reject with.
 *
 * General is a plain shared-function module, not an adapter-backed capability: shared logic
 * imports `updateFile` directly, and no delivery carries it. The canonical declarations live
 * beside this entry in [`files-contract.ts`](files-contract.ts); the deep implementation — the
 * in-process queue, the cross-process lock, its recovery and the atomic publication — stays in
 * `framework/modules/files.ts`, whose one published call this entry re-exports. The connection is
 * the deliberate thin runtime exception; the entry adds no second implementation.
 *
 * This entry exports exactly these four names and no lock, queue, temporary-file or retry
 * mechanism.
 */
export {
	SafeFileUpdateError,
	type SafeFileUpdateFailureKind,
	type SafeFileUpdateOptions,
} from "./files-contract";

/** The implementation's one published call; see the module documentation for its meaning. */
export { updateFile } from "../../modules/files";
