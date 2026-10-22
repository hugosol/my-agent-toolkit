/**
 * The startup policy: the initial activation choice the selected startup mode declares.
 *
 * Two startup modes are two entrypoints, and the only thing that distinguishes them is which
 * policy document the assembly states: the document names each extension's initial activation
 * choice, and an entrypoint selects it. The host parameter stays what it always was — which
 * module to load — so no profile selector, environment variable or command-line value is added
 * to choose a mode at runtime.
 *
 * One document serves a whole mode, so it may name extensions this process did not load. Only
 * the block of the extension being bound is read and validated here: another block is another
 * extension's policy, and a block that names an extension is never a reason to load it. This is
 * the same per-extension rule the extension's own configuration follows, and it is why a
 * document holds one policy per mode rather than a separate file per extension.
 *
 * The document is the only source of the choice, exactly as an extension's `config.yaml` is the
 * only source of that extension's values: an entrypoint that states a policy whose file is
 * missing or whose block is illegal refuses that binding with a configuration failure instead of
 * running on a choice nobody declared. A block that states no choice (`enabled` absent) is
 * refused too, because the block itself is the statement that this extension has one.
 *
 * Reading happens once per process per file, so a changed document takes effect with the next
 * process and no running session is switched by editing it. The seam is the framework's own
 * configuration seam — the reader, the parser and the base directory — so this module depends
 * on no harness and its own suite drives every path without a file system.
 */
import { isPlainMapping } from "./assembly";
import {
	type ConfigSource,
	ConfigLoadError,
	configFilePath,
	describeValue,
	readConfigDocument,
} from "./config";
import type { ExtensionDefinition } from "../interface/details/definition";

/** The initial activation choice one startup policy document declares for one extension. */
export type StartupChoice = boolean;

/**
 * The policy documents this process has read, by the file each path resolved to.
 *
 * A policy belongs to the machine and is read once: the first binding that reaches the file
 * records its document here, and every later binding — another session, a subagent, another
 * extension the same mode document names — reads that document rather than going back to disk.
 * The document is kept whole because each extension's block is read from it on its own binding;
 * only the file read is shared, never a validated per-extension answer.
 */
const readPolicies = new Map<string, Readonly<Record<string, unknown>>>();

/**
 * The startup choice the policy document at `path` declares for `definition`, or `undefined`
 * when the document names no block for it.
 *
 * The file is read through the configuration seam and its top level must be a mapping, like
 * every YAML document the framework reads. This extension's block, when present, must be a
 * mapping that states `enabled` as a boolean; unknown members are ignored, as they are in an
 * extension's own configuration. A document that cannot be read or parsed, a missing file and
 * an illegal block all throw {@link ConfigLoadError} with the detail a binding refusal reports,
 * so the caller turns them into one `configuration` failure and the extensions that loaded keep
 * running.
 */
export function startupChoiceOf(
	definition: ExtensionDefinition,
	path: string,
	source: ConfigSource = {},
): StartupChoice | undefined {
	const file = configFilePath(path, source.baseDir);
	let document = readPolicies.get(file);
	if (document === undefined) {
		// A read that found no file is `undefined`, not an empty document: an entrypoint's selected
		// policy is not optional the way the framework's own shared configuration is.
		const read = readConfigDocument(path, source);
		if (read === undefined) {
			throw new ConfigLoadError(`the startup policy file "${file}" does not exist`);
		}
		readPolicies.set(file, read);
		document = read;
	}

	const declared = document[definition.id];
	if (declared === undefined) return undefined;
	if (!isPlainMapping(declared)) {
		throw new ConfigLoadError(
			`the startup policy file "${file}" declares "${definition.id}" as ${describeValue(declared)}, but one extension's startup policy is a mapping stating its initial activation choice`,
		);
	}
	const enabled = declared.enabled;
	if (typeof enabled !== "boolean") {
		throw new ConfigLoadError(
			enabled === undefined
				? `the startup policy file "${file}" declares no "enabled" under "${definition.id}", which a startup policy requires as a boolean`
				: `the startup policy file "${file}" declares "enabled" under "${definition.id}" as ${describeValue(enabled)}, but a startup policy requires a boolean`,
		);
	}
	return enabled;
}
