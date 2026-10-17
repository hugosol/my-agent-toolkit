/**
 * The storage root model-cost's `storageDir` resolves to.
 *
 * The field is this extension's one configurable location: one root holds the consumption
 * document, the independent Codex estimate and this extension's archives. Its value is read and
 * validated by the framework with the definition's other declared fields, and this module is
 * where that declared value becomes the absolute directory the framework's safe-file module is
 * handed — so nothing downstream sees a relative path, a `~`, or the process's working
 * directory.
 *
 * Resolution is the field's own, and only this field's:
 *
 * - `~/…` — the same value written with this platform's other separator included — means the
 *   operating system user's OMP home, the `.omp` directory inside the user's home directory. So
 *   `~/cost-archive` is `<user home>/.omp/cost-archive`, and never `<user home>/cost-archive`.
 * - Any other relative value is resolved against the directory the extension's own `config.yaml`
 *   lives in, never against the process's working directory: the same extension configuration
 *   names the same root whatever project the session was started in.
 * - An absolute value is used exactly as it was declared.
 *
 * A bare `~`, without a separator, is not the exception; it is a relative path like any other.
 * Pointing the field somewhere else selects another store: nothing in this module (or anywhere
 * else in the extension) moves, copies or merges what an earlier value left behind, and a
 * directory the store was never pointed at is never written.
 */
import { isAbsolute, join, resolve } from "node:path";

/** The directory inside the user's home that this field's `~/` means. */
const OMP_HOME_SEGMENT = ".omp";

/** What one resolution needs: the declared value and the two directories its rules are relative to. */
export interface StorageRootInputs {
	/** The `storageDir` value the extension's `config.yaml` declared, verbatim. */
	readonly declared: string;
	/** The directory this extension's own `config.yaml` lives in. */
	readonly configDirectory: string;
	/** The operating system's user home directory, as the host reports it. */
	readonly userHomeDirectory: string;
}

/**
 * The absolute storage root the declared value names, or that value's remainder when its own
 * `~/` prefix applies.
 *
 * The remainder is what makes `~/cost-archive` land under the OMP home: the prefix is removed and
 * the rest is joined there, so the declared spelling of the rest survives.
 */
function ompHomeRemainder(declared: string): string | undefined {
	const prefix = declared.slice(0, 2);
	return prefix === "~/" || prefix === "~\\" ? declared.slice(2) : undefined;
}

/** The absolute directory the declared `storageDir` names, per the field's own rules. */
export function resolveStorageRoot(inputs: StorageRootInputs): string {
	if (isAbsolute(inputs.declared)) return inputs.declared;
	const remainder = ompHomeRemainder(inputs.declared);
	if (remainder !== undefined) return join(inputs.userHomeDirectory, OMP_HOME_SEGMENT, remainder);
	return resolve(inputs.configDirectory, inputs.declared);
}
