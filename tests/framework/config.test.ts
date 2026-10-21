/**
 * Extension configuration (P19, P20): the framework reads and validates the extension's
 * own `config.yaml` at binding, before anything is registered, and an extension that
 * declares no configuration is untouched.
 *
 * The seams under test are the framework's own: the configuration API
 * (`readConfig`, `getConfig`, `ConfigLoadError`, `ExtensionConfigError` in
 * `framework/core/config.ts`) and the binding seam it feeds — `bindExtension` driven
 * through the harness-neutral port double, which is where an illegal declaration and an
 * illegal file must both come out as one `configuration` failure carrying a `config`
 * violation. The reader and the parser are injectable, so the failure paths are covered
 * without depending on a real file system; the default parser is the pure-JS `yaml`
 * package, which is what the file-side cases exercise.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { BindingResult } from "../../framework/runtime/port";
import {
	ConfigLoadError,
	type ConfigReadOptions,
	type ConfigSource,
	readConfig,
} from "../../framework/core/config";
import {
	type ExtensionDefinition,
	type ImplementationContext,
	defineExtension,
} from "../../framework/interface";
import { ExtensionConfigError, getConfig } from "../../framework/interface/general/config";
import { portDouble } from "./support/harness-port-double";
import { REPO_ROOT } from "../harness-dock/baseline";

/**
 * A definition that declares the configuration under test.
 *
 * Ids are unique per case on purpose: a validated configuration is recorded once per
 * extension per process, so two cases must not share one id.
 */
function declaringConfig(id: string, config: unknown): ExtensionDefinition {
	return { id, displayName: id, config } as unknown as ExtensionDefinition;
}

/** A source whose reader refuses to run: it proves a case never reached the file. */
const unreadSource: ConfigSource = {
	reader: () => {
		throw new Error("the configuration file must not be read for this case");
	},
};

/** The failure kinds of a result, in report order. */
function failureKinds(result: BindingResult): readonly string[] {
	return result.bound ? [] : result.failures.map(failure => failure.kind);
}

/** The `config` violations a result reports. */
function configViolations(result: BindingResult) {
	if (result.bound) return [];
	return result.failures.flatMap(failure =>
		failure.kind === "configuration" && failure.violation.kind === "config" ? [failure.violation] : [],
	);
}

/** Binds a definition through the port double, with the configuration seam under test. */
function bindFailure(
	definition: ExtensionDefinition,
	source: ConfigSource,
): { readonly result: BindingResult; readonly diagnostics: readonly string[]; readonly registrations: readonly string[] } {
	const port = portDouble();
	const result = port.bind(definition, { config: source });
	return { result, diagnostics: [...port.diagnostics], registrations: [...port.registrations] };
}

/** The file a declaration resolves to, so an expectation names the convention it used. */
const at = (id: string): string => `the configuration file "extensions/${id}/config.yaml"`;

/** A source that answers with one in-memory document, parsed by the framework's own parser. */
const reading = (text: string): ConfigSource => ({ reader: () => text });

/** The error one call threw, so a case can inspect what a failure carries. */
function thrownBy(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}
	return undefined;
}

describe("an illegal configuration declaration refuses the extension (P19, P20)", () => {
	/**
	 * The declaration shape is checked at binding, on the same loading-time path as the
	 * file itself: a shape this version cannot honor must not be silently read as a
	 * configuration, and nothing may be registered.
	 */
	const cases: readonly { readonly name: string; readonly config: unknown; readonly detail: string }[] = [
		{
			name: "config is not an object",
			config: "endpoint",
			detail: 'config declares "endpoint", which is not a configuration declaration',
		},
		{
			name: "config is null",
			config: null,
			detail: "config declares null, which is not a configuration declaration",
		},
		{
			name: "config is an array",
			config: [{ fields: { endpoint: "string" } }],
			detail: "config declares an array, which is not a configuration declaration",
		},
		{
			name: "config declares no fields",
			config: { path: "extensions/x/config.yaml" },
			detail: "config declares no fields; a configuration declaration lists the keys the file must carry",
		},
		{
			name: "fields is not an object",
			config: { fields: "endpoint" },
			detail: 'config declares fields as "endpoint", which is not a mapping of field types',
		},
		{
			name: "fields is null",
			config: { fields: null },
			detail: "config declares fields as null, which is not a mapping of field types",
		},
		{
			name: "fields is an array",
			config: { fields: ["endpoint"] },
			detail: "config declares fields as an array, which is not a mapping of field types",
		},
		{
			name: "a field names an unbound type",
			config: { fields: { endpoint: "integer" } },
			detail:
				'config declares field "endpoint" with type "integer", which this framework version does not bind (bound types: string, non-empty-string, number, boolean, milliseconds)',
		},
		{
			name: "the path is an empty string",
			config: { path: "", fields: { endpoint: "string" } },
			detail: 'config declares path "", which is not a non-empty string',
		},
		{
			name: "the path is not a string",
			config: { path: 42, fields: { endpoint: "string" } },
			detail: "config declares path a number, which is not a non-empty string",
		},
	];

	for (const { name, config, detail } of cases) {
		test(`${name}: one configuration failure, reported once, nothing registered`, () => {
			const { result, diagnostics, registrations } = bindFailure(declaringConfig("declared", config), unreadSource);

			expect(failureKinds(result)).toEqual(["configuration"]);
			expect(configViolations(result)).toEqual([{ kind: "config", detail }]);
			// The report is deterministic and goes out on the non-model channel exactly once.
			expect(diagnostics).toEqual([`declared: configuration error (config): ${detail}`]);
			// A refused binding registers nothing at all.
			expect(registrations).toEqual([]);
		});
	}
});

describe("the configuration declaration is pure data (P19)", () => {
	test("a declaration that names the bound types is accepted as declared", () => {
		// `defineExtension` copies nothing and validates nothing: the declaration reaches
		// binding as the extension wrote it.
		const definition = defineExtension({
			id: "pure-data",
			displayName: "pure-data",
			config: {
				path: "extensions/pure-data/config.yaml",
				fields: {
					endpoint: "non-empty-string",
					port: "number",
					enabled: "boolean",
					label: "string",
					requestTimeoutMs: "milliseconds",
				},
			},
		});

		expect(definition.config).toEqual({
			path: "extensions/pure-data/config.yaml",
			fields: {
				endpoint: "non-empty-string",
				port: "number",
				enabled: "boolean",
				label: "string",
				requestTimeoutMs: "milliseconds",
			},
		});
	});
});

describe("an illegal configuration file refuses the extension (P20)", () => {
	const endpoint = { endpoint: "non-empty-string" };

	/** The file-side failure classes, each with the deterministic detail binding reports. */
	const scenarios: readonly {
		readonly name: string;
		readonly id: string;
		readonly fields: unknown;
		readonly source: ConfigSource;
		readonly detail: string;
	}[] = [
		{
			name: "a missing file",
			id: "absent-config",
			fields: endpoint,
			// No reader is injected: the framework's own reader reports the missing file.
			source: {},
			detail: `${at("absent-config")} does not exist`,
		},
		{
			name: "an unreadable file",
			id: "denied-config",
			fields: endpoint,
			source: {
				reader: () => {
					throw Object.assign(new Error("EACCES: permission denied, open 'config.yaml'"), { code: "EACCES" });
				},
			},
			detail: `${at("denied-config")} could not be read: EACCES: permission denied, open 'config.yaml'`,
		},
		{
			name: "a top-level sequence",
			id: "sequence-config",
			fields: endpoint,
			source: reading("- one\n- two\n"),
			detail: `${at("sequence-config")} does not declare a mapping at its top level (it declares an array)`,
		},
		{
			name: "a top-level scalar",
			id: "scalar-config",
			fields: endpoint,
			source: reading("just text\n"),
			detail: `${at("scalar-config")} does not declare a mapping at its top level (it declares "just text")`,
		},
		{
			name: "an empty file",
			id: "empty-config",
			fields: endpoint,
			source: reading(""),
			detail: `${at("empty-config")} does not declare a mapping at its top level (it declares null)`,
		},
		{
			name: "a required key that is missing",
			id: "missing-key",
			fields: endpoint,
			source: reading("other: value\n"),
			detail: `${at("missing-key")} declares no "endpoint", which the extension requires as a non-empty-string`,
		},
		{
			name: "a number where a non-empty-string is required",
			id: "number-endpoint",
			fields: endpoint,
			source: reading("endpoint: 8787\n"),
			detail: `${at("number-endpoint")} declares "endpoint" as a number, but the extension requires a non-empty-string`,
		},
		{
			name: "an empty string where a non-empty-string is required",
			id: "empty-endpoint",
			fields: endpoint,
			source: reading('endpoint: ""\n'),
			detail: `${at("empty-endpoint")} declares "endpoint" as "", but the extension requires a non-empty-string`,
		},
		{
			name: "a null value where a non-empty-string is required",
			id: "null-endpoint",
			fields: endpoint,
			source: reading("endpoint:\n"),
			detail: `${at("null-endpoint")} declares "endpoint" as null, but the extension requires a non-empty-string`,
		},
		{
			name: "a string where a number is required",
			id: "string-count",
			fields: { count: "number" },
			source: reading('count: "3"\n'),
			detail: `${at("string-count")} declares "count" as "3", but the extension requires a number`,
		},
		{
			name: "a string where a boolean is required",
			id: "string-enabled",
			fields: { enabled: "boolean" },
			// YAML 1.2 keeps `yes` a string, so the declaration is what rejects it.
			source: reading('enabled: "yes"\n'),
			detail: `${at("string-enabled")} declares "enabled" as "yes", but the extension requires a boolean`,
		},
		{
			name: "a number where a string is required",
			id: "number-label",
			fields: { label: "string" },
			source: reading("label: 7\n"),
			detail: `${at("number-label")} declares "label" as a number, but the extension requires a string`,
		},
	];

	for (const { name, id, fields, source, detail } of scenarios) {
		test(`${name}: one configuration failure, reported once, nothing registered`, () => {
			const { result, diagnostics, registrations } = bindFailure(declaringConfig(id, { fields }), source);

			expect(failureKinds(result)).toEqual(["configuration"]);
			expect(configViolations(result)).toEqual([{ kind: "config", detail }]);
			expect(diagnostics).toEqual([`${id}: configuration error (config): ${detail}`]);
			expect(registrations).toEqual([]);
		});
	}

	test("a file that is not valid YAML: one configuration failure carrying the parser's reason", () => {
		const { result, diagnostics, registrations } = bindFailure(
			declaringConfig("bad-yaml", { fields: endpoint }),
			reading("endpoint: [oops\n"),
		);

		expect(failureKinds(result)).toEqual(["configuration"]);
		const violations = configViolations(result);
		expect(violations).toHaveLength(1);
		expect(violations[0]!.kind).toBe("config");
		expect(violations[0]!.detail.startsWith(`${at("bad-yaml")} is not valid YAML: `)).toBe(true);
		// The parser's own explanation of where follows the framework's text.
		const reasonPrefix = `${at("bad-yaml")} is not valid YAML: `;
		expect(violations[0]!.detail.length).toBeGreaterThan(reasonPrefix.length);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]!.startsWith('bad-yaml: configuration error (config): the configuration file "')).toBe(true);
		expect(registrations).toEqual([]);
	});
});

/**
 * A declared `milliseconds` field (P14): a wait budget is a whole number of milliseconds the
 * harness's own timer schedules, so a value the timer would not wait for is refused as a
 * configuration failure rather than read as a budget it is not.
 *
 * The range is stated here as an independent harness fact — the largest delay a millisecond
 * timer schedules before it clamps the value to 1ms (2^31-1) — rather than re-read from the
 * framework's own matcher, and the expected report text is built from it.
 */
describe("a declared milliseconds field is a whole millisecond budget this harness schedules (P14)", () => {
	/** The largest delay a millisecond timer schedules; a longer value is clamped, not waited for. */
	const MAX_MILLISECONDS = 2 ** 31 - 1;
	/** What the declaration requires, as the framework's report states it. */
	const requires = `a whole number of milliseconds between 1 and ${MAX_MILLISECONDS}`;
	/** The field under test, under the name a wait budget would carry. */
	const wait = { requestTimeoutMs: "milliseconds" };

	test("whole millisecond budgets bind, and the value recorded is the file's", () => {
		for (const value of [1, 2000, MAX_MILLISECONDS]) {
			const definition = declaringConfig(`wait-${value}`, { fields: wait });
			const bound = portDouble().bind(definition, { config: reading(`requestTimeoutMs: ${value}\n`) });

			expect(bound.bound).toBe(true);
			expect(getConfig(definition)).toEqual({ requestTimeoutMs: value });
		}
	});

	/**
	 * Every value a wait budget must refuse, with the deterministic detail binding reports: the
	 * wait the file names is not one this harness schedules.
	 */
	const refused: readonly {
		readonly name: string;
		readonly id: string;
		readonly document: string;
		readonly carries: string;
	}[] = [
		{
			name: "the field is missing",
			id: "wait-missing",
			document: "other: value\n",
			carries: `declares no "requestTimeoutMs", which the extension requires as ${requires}`,
		},
		{
			name: "zero",
			id: "wait-zero",
			document: "requestTimeoutMs: 0\n",
			carries: `declares "requestTimeoutMs" as a number, but the extension requires ${requires}`,
		},
		{
			name: "a negative value",
			id: "wait-negative",
			document: "requestTimeoutMs: -1\n",
			carries: `declares "requestTimeoutMs" as a number, but the extension requires ${requires}`,
		},
		{
			name: "a fraction",
			id: "wait-fraction",
			document: "requestTimeoutMs: 1.5\n",
			carries: `declares "requestTimeoutMs" as a number, but the extension requires ${requires}`,
		},
		{
			name: "text that is not a number",
			id: "wait-text",
			document: 'requestTimeoutMs: "1000"\n',
			carries: `declares "requestTimeoutMs" as "1000", but the extension requires ${requires}`,
		},
		{
			name: "a non-finite value",
			id: "wait-infinite",
			document: "requestTimeoutMs: .inf\n",
			carries: `declares "requestTimeoutMs" as a non-finite number, but the extension requires ${requires}`,
		},
		{
			name: "not-a-number",
			id: "wait-nan",
			document: "requestTimeoutMs: .nan\n",
			carries: `declares "requestTimeoutMs" as a non-finite number, but the extension requires ${requires}`,
		},
		{
			name: "the first value the harness does not schedule",
			id: "wait-overflow",
			document: `requestTimeoutMs: ${MAX_MILLISECONDS + 1}\n`,
			carries: `declares "requestTimeoutMs" as a number, but the extension requires ${requires}`,
		},
		{
			name: "a value beyond any millisecond this harness counts",
			id: "wait-huge",
			document: `requestTimeoutMs: ${2 ** 53}\n`,
			carries: `declares "requestTimeoutMs" as a number, but the extension requires ${requires}`,
		},
	];

	for (const { name, id, document, carries } of refused) {
		test(`${name}: refused at binding, reported once, nothing registered`, () => {
			const { result, diagnostics, registrations } = bindFailure(
				declaringConfig(id, { fields: wait }),
				reading(document),
			);

			const detail = `${at(id)} ${carries}`;
			expect(failureKinds(result)).toEqual(["configuration"]);
			expect(configViolations(result)).toEqual([{ kind: "config", detail }]);
			expect(diagnostics).toEqual([`${id}: configuration error (config): ${detail}`]);
			expect(registrations).toEqual([]);
		});
	}
});

/**
 * The directory a relative declaration resolves against (P19, P20, P42).
 *
 * The convention path `extensions/<definition.id>/config.yaml` and a relative `config.path`
 * are relative to the extension repository the definition lives in — not to the process that
 * happens to bind it. A real load discovers an extension by absolute path while the process
 * runs in an arbitrary project directory, so the assembly supplies that repository as plain
 * data (a directory string) and the framework resolves the declaration against it. An absolute
 * `config.path` is used as declared, and an assembly that supplies no directory leaves the
 * path exactly as it was read: this process's own working directory, which is what every read
 * did before the directory existed.
 */
describe("a relative declaration resolves against the assembly's configuration base directory (P19, P42)", () => {
	/** The extension repository root a case supplies as plain data. */
	const repositoryRoot = path.resolve(path.sep, "srv", "my-agent-toolkit");

	/** A read that records the file it was asked for, then answers with one document. */
	function recordingRead(text: string): { readonly source: ConfigSource; readonly files: string[] } {
		const files: string[] = [];
		return {
			files,
			source: {
				reader: candidate => {
					files.push(candidate);
					return text;
				},
			},
		};
	}

	test("the convention path is the one under that directory, and its values are the file's", () => {
		const definition = declaringConfig("based-convention", { fields: { endpoint: "non-empty-string" } });
		const read = recordingRead("endpoint: http://herdr-bot.local:8787\n");

		const result = portDouble().bind(definition, { config: { ...read.source, baseDir: repositoryRoot } });

		expect(result.bound).toBe(true);
		expect(read.files).toEqual([path.resolve(repositoryRoot, "extensions", "based-convention", "config.yaml")]);
		expect(getConfig(definition)).toEqual({ endpoint: "http://herdr-bot.local:8787" });
	});

	test("a relative config.path override resolves against the same directory", () => {
		const definition = declaringConfig("based-override", {
			path: "extensions/based-override/nested/panel.yaml",
			fields: { endpoint: "non-empty-string" },
		});
		const read = recordingRead("endpoint: http://herdr-bot.local:9999\n");

		const result = portDouble().bind(definition, { config: { ...read.source, baseDir: repositoryRoot } });

		expect(result.bound).toBe(true);
		expect(read.files).toEqual([
			path.resolve(repositoryRoot, "extensions", "based-override", "nested", "panel.yaml"),
		]);
	});

	test("an absolute config.path is used as declared, whatever directory is supplied", () => {
		const declared = path.resolve(path.sep, "etc", "connect-bot", "config.yaml");
		const definition = declaringConfig("based-absolute", { path: declared, fields: { endpoint: "non-empty-string" } });
		const read = recordingRead("endpoint: http://herdr-bot.local:8787\n");

		const result = portDouble().bind(definition, { config: { ...read.source, baseDir: repositoryRoot } });

		expect(result.bound).toBe(true);
		expect(read.files).toEqual([declared]);
	});

	test("a missing file is refused at the resolved path, so the report names what was looked for", () => {
		const definition = declaringConfig("based-absent", { fields: { endpoint: "non-empty-string" } });
		// A directory that exists but carries no extension repository of that name, so the file
		// the resolution reaches is missing for certain.
		const scratch = mkdtempSync(path.join(tmpdir(), "config-base-missing-"));
		const emptyRepository = path.join(scratch, "repository");
		try {
			// No reader is injected: the framework's own reader reports the missing file, and the
			// path it names is the one it resolved rather than the bare declaration.
			const result = portDouble().bind(definition, { config: { baseDir: emptyRepository } });

			const resolved = path.join(emptyRepository, "extensions", "based-absent", "config.yaml");
			expect(configViolations(result)).toEqual([
				{ kind: "config", detail: `the configuration file "${resolved}" does not exist` },
			]);
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});

	test("with no directory supplied the path stays this process's own, as it was before", () => {
		const definition = declaringConfig("based-fallback", { fields: { endpoint: "non-empty-string" } });
		const read = recordingRead("endpoint: http://herdr-bot.local:8787\n");

		const result = portDouble().bind(definition, { config: read.source });

		expect(result.bound).toBe(true);
		expect(read.files).toEqual(["extensions/based-fallback/config.yaml"]);
	});
});

describe("readConfig is the one reading, parsing and validating implementation (P19)", () => {
	test("a loading-time failure is a ConfigLoadError carrying the detail, never an ExtensionConfigError", () => {
		const options: ConfigReadOptions = {
			fields: { endpoint: "non-empty-string" },
			reader: () => "endpoint: 8787\n",
		};

		const failure = thrownBy(() => readConfig("config.yaml", options));

		expect(failure).toBeInstanceOf(ConfigLoadError);
		expect(failure).not.toBeInstanceOf(ExtensionConfigError);
		expect((failure as ConfigLoadError).detail).toBe(
			'the configuration file "config.yaml" declares "endpoint" as a number, but the extension requires a non-empty-string',
		);
	});

	test("the shared source reaches no Bun API, no harness package and no environment value", () => {
		// The capability is harness-independent and the file is the only source of the
		// values: this module parses with the pure-JS `yaml` package and reads through
		// `node:fs`, and it consults neither a Bun API nor the environment. Like the import
		// boundary suite, this check is lexical and a best-effort alarm, not a proof.
		const source = readFileSync(path.join(REPO_ROOT, "framework/core/config.ts"), "utf8");

		expect(source).not.toMatch(/\bBun\./);
		expect(source).not.toMatch(/@(?:oh-my-pi|earendil-works)\//);
		expect(source).not.toMatch(/process\.env/);
		expect(source).toContain('from "yaml"');
	});
});

describe("a declared configuration is read, validated and recorded at binding (P19)", () => {
	test("the validated values are what shared logic reads through getConfig", () => {
		const definition = declaringConfig("bound-config", { fields: { endpoint: "non-empty-string" } });
		const port = portDouble();

		const result = port.bind(definition, { config: reading("endpoint: http://herdr-bot.local:8787\n") });

		expect(result.bound).toBe(true);
		expect(port.diagnostics).toEqual([]);
		expect(getConfig(definition)).toEqual({ endpoint: "http://herdr-bot.local:8787" });
	});

	test("the values are exactly the declared keys, each validated by the framework", () => {
		const definition = declaringConfig("typed-config", {
			fields: { endpoint: "non-empty-string", port: "number", enabled: "boolean", label: "string" },
		});

		const bound = portDouble().bind(definition, {
			config: reading(
				[
					"# the panel this extension talks to",
					"endpoint: http://herdr-bot.local:8787",
					"port: 8787",
					"enabled: true",
					'label: ""',
					"switch: a future entry, ignored here",
					"",
				].join("\n"),
			),
		});

		expect(bound.bound).toBe(true);
		// A `string` may be empty where a `non-empty-string` may not, and a key the
		// declaration does not name reaches neither the values nor the failure.
		expect(getConfig(definition)).toEqual({
			endpoint: "http://herdr-bot.local:8787",
			port: 8787,
			enabled: true,
			label: "",
		});
	});

	test("the defaults read a real file as YAML: comments and all", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "extension-config-"));
		const file = path.join(directory, "config.yaml");
		writeFileSync(file, "endpoint: http://herdr-bot.local:8787 # the panel\n");
		try {
			expect(readConfig(file, { fields: { endpoint: "non-empty-string" } })).toEqual({
				endpoint: "http://herdr-bot.local:8787",
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("the file is read once per process: a later binding reuses the validated values", () => {
		const definition = declaringConfig("once-config", { fields: { endpoint: "non-empty-string" } });
		let reads = 0;
		const port = portDouble();

		expect(
			port.bind(definition, {
				config: {
					reader: () => {
						reads += 1;
						return "endpoint: first\n";
					},
				},
			}).bound,
		).toBe(true);
		// A second binding of the same extension does not go back to the file: a changed
		// value takes effect with the next process, not with the next session.
		expect(
			port.bind(definition, {
				config: {
					reader: () => {
						reads += 1;
						return "endpoint: second\n";
					},
				},
			}).bound,
		).toBe(true);

		expect(reads).toBe(1);
		expect(getConfig(definition)).toEqual({ endpoint: "first" });
	});
});

describe("the General configuration entry is the extension-facing seam (P43, P44)", () => {
	/**
	 * Writes a real configuration repository for one extension and returns both the directory a
	 * binding resolves a relative declaration against and the file it reaches. The binding below
	 * uses the framework's own reader and YAML parser: no in-memory document stands in for the file.
	 */
	function realRepository(id: string, document: string): { readonly repository: string; readonly file: string } {
		const repository = mkdtempSync(path.join(tmpdir(), `config-real-${id}-`));
		const file = path.join(repository, "extensions", id, "config.yaml");
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, document);
		return { repository, file };
	}

	test("a real configuration file drives the binding, and getConfig and context.config hand over the same validated object", () => {
		const id = "real-file-success";
		const { repository } = realRepository(
			id,
			"endpoint: http://herdr-bot.local:8787\nrequestTimeoutMs: 2000\n",
		);
		try {
			const definition = declaringConfig(id, {
				fields: { endpoint: "non-empty-string", requestTimeoutMs: "milliseconds" },
			});
			const delivered: ImplementationContext[] = [];
			const port = portDouble();

			const result = port.bind(definition, {
				config: { baseDir: repository },
				factory: context => {
					delivered.push(context);
					return {};
				},
			});

			expect(result.bound).toBe(true);
			expect(port.diagnostics).toEqual([]);
			expect(delivered).toHaveLength(1);

			// The values are the file's declared keys, validated by the framework, and both paths hand
			// over the same recorded object — the one cache entry, not a copy per reader or delivery.
			const values = getConfig(definition);
			expect(values).toEqual({ endpoint: "http://herdr-bot.local:8787", requestTimeoutMs: 2000 });
			expect(delivered[0]!.config).toBe(values);
			expect(getConfig(definition)).toBe(values);
		} finally {
			rmSync(repository, { recursive: true, force: true });
		}
	});

	test("the real file is read once per extension per process, so a changed value waits for the next process", () => {
		const id = "real-file-cache";
		const { repository, file } = realRepository(id, "endpoint: first\n");
		try {
			const definition = declaringConfig(id, { fields: { endpoint: "non-empty-string" } });
			const delivered: ImplementationContext[] = [];
			const port = portDouble();
			const factory = (context: ImplementationContext) => {
				delivered.push(context);
				return {};
			};

			expect(port.bind(definition, { config: { baseDir: repository }, factory }).bound).toBe(true);
			// The file really changed between the two bindings; the process's validated values did not.
			writeFileSync(file, "endpoint: second\n");

			expect(port.bind(definition, { config: { baseDir: repository }, factory }).bound).toBe(true);

			expect(delivered).toHaveLength(2);
			expect(delivered[1]!.config).toBe(delivered[0]!.config);
			expect(delivered[1]!.config).toEqual({ endpoint: "first" });
			expect(getConfig(definition)).toEqual({ endpoint: "first" });
		} finally {
			rmSync(repository, { recursive: true, force: true });
		}
	});

	test("an illegal real file refuses the binding, and getConfig reports a misuse rather than the loading failure", () => {
		const id = "real-file-refused";
		const { repository } = realRepository(id, 'endpoint: ""\n');
		try {
			const definition = declaringConfig(id, { fields: { endpoint: "non-empty-string" } });
			let factories = 0;
			const port = portDouble();

			const result = port.bind(definition, {
				config: { baseDir: repository },
				factory: () => {
					factories += 1;
					return {};
				},
			});

			// The file is a loading-time failure: one configuration failure, reported once, nothing
			// registered and no implementation built, so the extension is never loaded.
			expect(result.bound).toBe(false);
			expect(result.bound ? [] : result.failures.map(failure => failure.kind)).toEqual(["configuration"]);
			expect(port.diagnostics).toHaveLength(1);
			expect(port.registrations).toEqual([]);
			expect(factories).toBe(0);

			const failure = thrownBy(() => getConfig(definition));
			expect(failure).toBeInstanceOf(ExtensionConfigError);
			expect(failure).not.toBeInstanceOf(ConfigLoadError);
			expect((failure as Error).message).toContain("no validated values are recorded in this process");
		} finally {
			rmSync(repository, { recursive: true, force: true });
		}
	});

	test("the delivered configuration is Readonly in the type system", () => {
		// Compile-time only: `bun run typecheck` checks these two @ts-expect-error lines, and neither
		// function runs. The runtime contract deliberately adds no freeze or copy on top.
		const rejectWrite = (values: ImplementationContext["config"]): void => {
			// @ts-expect-error the delivered configuration is Readonly
			values.endpoint = "changed";
		};
		const rejectContextWrite = (config: ImplementationContext["config"]): void => {
			// @ts-expect-error context.config is Readonly
			config.endpoint = "changed";
		};
		expect(typeof rejectWrite).toBe("function");
		expect(typeof rejectContextWrite).toBe("function");
	});
});

describe("an extension that declares no configuration is untouched (P19)", () => {
	test("nothing is read, nothing is reported, and the binding is unchanged", () => {
		const definition = defineExtension({ id: "no-config", displayName: "no-config" });
		const port = portDouble();

		// The source refuses to be read: a definition without a `config` declaration must
		// never reach the file at all.
		const result = port.bind(definition, { config: unreadSource });

		expect(result.bound).toBe(true);
		expect(port.diagnostics).toEqual([]);
		expect(port.registrations).toEqual(["label:no-config", "onSession"]);
	});
});

describe("getConfig is only for a bound extension with validated values (P19)", () => {
	test("an extension that declares no configuration has nothing to read", () => {
		const definition = defineExtension({ id: "unconfigured", displayName: "unconfigured" });

		const failure = thrownBy(() => getConfig(definition));

		expect(failure).toBeInstanceOf(ExtensionConfigError);
		expect(failure).not.toBeInstanceOf(ConfigLoadError);
		expect((failure as Error).message).toBe(
			'extension "unconfigured" declares no configuration, so getConfig has nothing to return',
		);
	});

	test("a declared configuration that was never validated is a misuse, not a binding failure", () => {
		const definition = declaringConfig("never-bound", { fields: { endpoint: "string" } });

		const failure = thrownBy(() => getConfig(definition));

		expect(failure).toBeInstanceOf(ExtensionConfigError);
		expect(failure).not.toBeInstanceOf(ConfigLoadError);
		expect((failure as Error).message).toBe(
			'extension "never-bound" declares a configuration, but no validated values are recorded in this process',
		);
	});

	test("a refused binding records nothing, so shared logic cannot read a file that failed", () => {
		const definition = declaringConfig("refused-read", { fields: { endpoint: "non-empty-string" } });
		const result = portDouble().bind(definition, { config: reading('endpoint: ""\n') });

		expect(result.bound).toBe(false);
		expect(thrownBy(() => getConfig(definition))).toBeInstanceOf(ExtensionConfigError);
	});
});
