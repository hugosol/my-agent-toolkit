/**
 * Extension configuration: how the framework reads and validates the configuration file
 * one extension declares.
 *
 * A definition opts in by declaring `config` — plain data naming the file and the keys it
 * must carry, each with the type it must match. An extension that declares none is
 * untouched: nothing is read for it and the capability stays invisible.
 *
 * Everything happens at binding, before the first registration, on the same deterministic
 * path as the declaration conflicts. The shape of the declaration itself and the content
 * of the file are validated together, and either kind of failure refuses the extension —
 * the caller turns the detail into one `config` violation of a `configuration` binding
 * failure, and the extensions that loaded keep running.
 *
 * There is no default value and no fallback: the file the repository carries is the only
 * source of the values. The file belongs to the machine — unknown keys are ignored, no
 * environment or command-line value overrides it, and a changed value takes effect with
 * the next process, because a validated configuration is read once per extension per
 * process.
 *
 * Reading, parsing and validation live here and nowhere else, and the seam they run
 * through is injectable: the default reader is this process's file system and the default
 * parser is the pure-JS `yaml` package, so the framework depends on no agent runtime (and
 * on no Bun-specific API) while its own suite drives every failure path without a file.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parse } from "yaml";
import { BOUND_CONFIG_FIELD_TYPES, type ConfigFieldType, type ExtensionDefinition } from "./definition";

/** Reads the text of the configuration file at `path`; throws when it cannot be read. */
export type ConfigReader = (path: string) => string;

/** Parses one YAML document into a JavaScript value; throws when the text is not one. */
export type ConfigParser = (text: string) => unknown;

/**
 * How one configuration read obtains the file's text and where a relative path is resolved.
 *
 * All three are injectable so the framework's own suite can cover every failure path without a
 * file system. An assembly injects none of them but the directory: the defaults are this
 * process's own file system, the pure-JS YAML parser and — for a relative path — this
 * process's own working directory.
 */
export interface ConfigSource {
	readonly reader?: ConfigReader;
	readonly parser?: ConfigParser;
	/**
	 * The directory a relative declared path is resolved against, as plain data: the extension
	 * repository root an assembly supplies, from which the convention
	 * `extensions/<definition.id>/config.yaml` — and a relative `config.path` — is relative.
	 *
	 * An assembly supplies it because a real discovery root is absolute and the process binds
	 * from an arbitrary project directory, so the repository an extension's own file lives in
	 * is not the process's own. An absolute path is used as it was declared whatever this
	 * holds, and when it is absent a relative path is used untouched — the process's own
	 * working directory, which is what every read did before this directory existed.
	 */
	readonly baseDir?: string;
}

/** One configuration read: what the declaration requires, and the seam it reads through. */
export interface ConfigReadOptions extends ConfigSource {
	/** The keys the file must declare, with the type each must match; none by default. */
	readonly fields?: Readonly<Record<string, ConfigFieldType>>;
}

/**
 * One loading-time configuration failure: a declaration whose shape is illegal, or a file
 * that cannot be read, parsed or validated.
 *
 * Its `detail` is the deterministic text of the failure and never reaches a bound
 * extension: binding turns it into the `config` violation of a `configuration` binding
 * failure, so the extension is not loaded at all. It is deliberately not
 * {@link ExtensionConfigError}, which speaks for an extension that is already bound.
 */
export class ConfigLoadError extends Error {
	readonly detail: string;

	constructor(detail: string) {
		super(detail);
		this.name = "ConfigLoadError";
		this.detail = detail;
	}
}

/**
 * The misuse of the configuration API by a bound extension: shared logic asked for a
 * configuration its extension never declared, or for one whose values were never
 * validated in this process.
 *
 * It is a programming error, not a loading-time one — binding has already guaranteed that
 * a bound extension which declared a configuration has validated values — so it is an
 * escape hatch of its own and is never part of a binding failure.
 */
export class ExtensionConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExtensionConfigError";
	}
}

/** The declaration of one extension's configuration, with the file's path resolved. */
interface ResolvedConfigDeclaration {
	readonly path: string;
	readonly fields: Readonly<Record<string, ConfigFieldType>>;
}

/** How failure text names a value that is not the one the declaration requires. */
function describeValue(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	switch (typeof value) {
		case "string":
			return `"${value}"`;
		case "number":
			return Number.isFinite(value) ? "a number" : "a non-finite number";
		case "object":
			return "a mapping";
		default:
			return String(value);
	}
}

/** How one field requirement is named in failure text. */
const FIELD_TYPE_TEXT: Readonly<Record<ConfigFieldType, string>> = {
	string: "a string",
	"non-empty-string": "a non-empty-string",
	number: "a number",
	boolean: "a boolean",
};

/** Whether one file value matches the type its declaration requires. */
const FIELD_TYPE_MATCHES: Readonly<Record<ConfigFieldType, (value: unknown) => boolean>> = {
	string: value => typeof value === "string",
	"non-empty-string": value => typeof value === "string" && value.length > 0,
	number: value => typeof value === "number" && Number.isFinite(value),
	boolean: value => typeof value === "boolean",
};

/** Throws when one field mapping names a type this framework version does not bind. */
function assertBoundFieldTypes(fields: Readonly<Record<string, unknown>>): void {
	for (const [name, type] of Object.entries(fields)) {
		if (typeof type !== "string" || !BOUND_CONFIG_FIELD_TYPES.includes(type as ConfigFieldType)) {
			throw new ConfigLoadError(
				`config declares field "${name}" with type ${describeValue(type)}, which this framework version does not bind (bound types: ${BOUND_CONFIG_FIELD_TYPES.join(", ")})`,
			);
		}
	}
}

/**
 * Validates the shape of one extension's `config` declaration and resolves the file it
 * names.
 *
 * Returns `undefined` for the one case the capability is invisible in — a definition that
 * declares no configuration at all — and throws a {@link ConfigLoadError} when the
 * declaration is not one this framework version can honor. A declaration is read as data
 * and never as a guess: a `fields` mapping that is absent or is not a mapping, a field
 * type outside the bound set, and a `path` that is not a non-empty string are all refused
 * here rather than read as defaults.
 */
function resolveConfigDeclaration(definition: ExtensionDefinition): ResolvedConfigDeclaration | undefined {
	const declared: unknown = definition.config;
	if (declared === undefined) return undefined;

	if (typeof declared !== "object" || declared === null || Array.isArray(declared)) {
		throw new ConfigLoadError(
			`config declares ${describeValue(declared)}, which is not a configuration declaration`,
		);
	}

	const { path, fields } = declared as { readonly path?: unknown; readonly fields?: unknown };
	if (path !== undefined && (typeof path !== "string" || path.trim().length === 0)) {
		throw new ConfigLoadError(`config declares path ${describeValue(path)}, which is not a non-empty string`);
	}
	if (fields === undefined) {
		throw new ConfigLoadError(
			"config declares no fields; a configuration declaration lists the keys the file must carry",
		);
	}
	if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
		throw new ConfigLoadError(
			`config declares fields as ${describeValue(fields)}, which is not a mapping of field types`,
		);
	}
	assertBoundFieldTypes(fields as Readonly<Record<string, unknown>>);

	return {
		path: (path as string | undefined) ?? `extensions/${definition.id}/config.yaml`,
		fields: fields as Readonly<Record<string, ConfigFieldType>>,
	};
}

/**
 * The file one declared path names: a relative path is resolved against the directory the
 * assembly supplied, an absolute one is left as it was declared, and with no directory
 * supplied the path is used as it is — this process's own working directory.
 */
function resolveDeclaredFile(path: string, baseDir: string | undefined): string {
	if (baseDir === undefined || isAbsolute(path)) return path;
	return resolve(baseDir, path);
}

/**
 * Reads, parses and validates one configuration file — the one implementation every
 * configuration read goes through.
 *
 * The file is the one the path names: a relative path is resolved against the source's base
 * directory (the extension repository root an assembly knows, since the process it binds in
 * is an arbitrary project directory), and an absolute path is used as declared. Every
 * failure names the file that resolution reached, so a report says where the framework
 * really looked.
 *
 * The file's text is obtained through the reader and parsed through the parser (this
 * process's file system and the pure-JS YAML package by default). The document must be a
 * mapping, and every key `fields` declares must be present and match the type the
 * declaration named: values are checked here, by the framework, so an extension writes no
 * check of its own. Unknown keys are ignored, and the returned values are exactly the
 * declared keys.
 *
 * Every failure — an unreadable or missing file, text that is not YAML, a document that is
 * not a mapping, a missing key, a value of the wrong type — throws a
 * {@link ConfigLoadError} whose `detail` is the deterministic text of that failure class.
 * A reader that cannot produce the text and a parser that rejects it are both reported as
 * this file's failure: neither escapes as a crash of the assembly that asked for the file.
 */
export function readConfig(path: string, options: ConfigReadOptions = {}): Readonly<Record<string, unknown>> {
	const fields = options.fields ?? {};
	assertBoundFieldTypes(fields);
	const file = resolveDeclaredFile(path, options.baseDir);

	let text: string;
	try {
		text = (options.reader ?? (candidate => readFileSync(candidate, "utf8")))(file);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		if ((error as { readonly code?: unknown } | null)?.code === "ENOENT") {
			throw new ConfigLoadError(`the configuration file "${file}" does not exist`);
		}
		throw new ConfigLoadError(`the configuration file "${file}" could not be read: ${reason}`);
	}

	let parsed: unknown;
	try {
		parsed = (options.parser ?? (document => parse(document)))(text);
	} catch (error) {
		throw new ConfigLoadError(
			`the configuration file "${file}" is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new ConfigLoadError(
			`the configuration file "${file}" does not declare a mapping at its top level (it declares ${describeValue(parsed)})`,
		);
	}

	const mapping = parsed as Readonly<Record<string, unknown>>;
	const values: Record<string, unknown> = {};
	for (const [field, type] of Object.entries(fields)) {
		if (!Object.prototype.hasOwnProperty.call(mapping, field) || mapping[field] === undefined) {
			throw new ConfigLoadError(
				`the configuration file "${file}" declares no "${field}", which the extension requires as ${FIELD_TYPE_TEXT[type]}`,
			);
		}
		const value = mapping[field];
		if (!FIELD_TYPE_MATCHES[type](value)) {
			throw new ConfigLoadError(
				`the configuration file "${file}" declares "${field}" as ${describeValue(value)}, but the extension requires ${FIELD_TYPE_TEXT[type]}`,
			);
		}
		values[field] = value;
	}
	return values;
}

/**
 * The validated configuration of each extension, one entry per extension per process.
 *
 * The file belongs to the machine, so its values are read once: the first binding that
 * validates an extension's file records the values here, and every later binding of the
 * same extension — another session, a subagent — reuses them rather than going back to
 * the file. That is what makes a changed value take effect with the next process.
 */
const validatedConfigs = new Map<string, Readonly<Record<string, unknown>>>();

/**
 * The configuration the extension's shared logic reads: the values its declared file was
 * validated to carry at binding.
 *
 * The caller passes its own definition and gets the values the declaration named, in
 * whichever session, command or lifecycle handler it runs. A definition that declares no
 * configuration, and one whose values were never validated in this process — it was never
 * bound, or its binding was refused — throw {@link ExtensionConfigError}: asking for a
 * configuration that is not there is a programming error, not a loading-time failure, and
 * it is kept out of the binding failure union.
 */
export function getConfig(definition: ExtensionDefinition): Readonly<Record<string, unknown>> {
	const values = validatedConfigs.get(definition.id);
	if (values !== undefined) return values;
	throw new ExtensionConfigError(
		definition.config === undefined
			? `extension "${definition.id}" declares no configuration, so getConfig has nothing to return`
			: `extension "${definition.id}" declares a configuration, but no validated values are recorded in this process`,
	);
}

/**
 * The loading-time configuration failure of one definition, or `undefined` when its
 * declaration and its file are what this framework version binds.
 *
 * This is the whole loading-time path, and binding is its only caller: the declaration's
 * shape is validated first, then the file it names is read, parsed and validated, and the
 * values are recorded for the extension's shared logic. A detail returned here becomes one
 * `config` violation of a `configuration` binding failure, reported before anything is
 * registered. A definition that declares no configuration reaches neither the file nor the
 * failure, and a failure is not recorded: only a read that succeeded makes the file's
 * values the extension's configuration.
 */
export function findConfigFailure(definition: ExtensionDefinition, source: ConfigSource = {}): string | undefined {
	try {
		const declaration = resolveConfigDeclaration(definition);
		if (declaration === undefined) return undefined;
		if (!validatedConfigs.has(definition.id)) {
			validatedConfigs.set(
				definition.id,
				readConfig(declaration.path, { fields: declaration.fields, ...source }),
			);
		}
	} catch (error) {
		if (error instanceof ConfigLoadError) return error.detail;
		throw error;
	}
	return undefined;
}
