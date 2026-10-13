/**
 * model-cost's storage root (P51, S2/S5).
 *
 * The seam is the extension's own configuration entry: the shipped `config.yaml`, read and
 * validated through the framework's configuration interface, and `resolveStorageRoot`, which is
 * where the storage contract's field-local `~/` rule and its relative-path rule live. Every
 * expectation below is written from that contract in the test itself — `~/cost-archive` is the
 * user's OMP home `<user home>/.omp/cost-archive`, a plain relative value is the directory the
 * extension's own config file lives in, an absolute value is used as it was declared, and the
 * process's working directory is never consulted — so none of them is derived by asking the
 * implementation under test.
 *
 * Nothing here resolves `~/` against this process's real user home, and nothing writes: the
 * user home every case supplies is a probe path, and the store root a relative value names is
 * only ever computed, never created.
 */
import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { resolveStorageRoot } from "../../extensions/model-cost/shared-logic/storage-root";
import { readConfig } from "../../framework/core/config";
import { REPO_ROOT } from "../harness-dock/baseline";

/** The directory the extension's own `config.yaml` lives in, as its assembly derives it. */
const CONFIG_DIRECTORY = path.join(REPO_ROOT, "extensions", "model-cost");

/** The extension's shipped config file, under the repository the assembly supplies. */
const SHIPPED_CONFIG_FILE = path.join(CONFIG_DIRECTORY, "config.yaml");

/** The value the shipped file declares, as the storage contract writes it. */
const SHIPPED_STORAGE_DIR = "~/cost-archive";

/**
 * A user home that is not this process's own.
 *
 * It is a probe path outside the repository: a case that resolved `~/` against the real user
 * home would produce a different answer, so the expectation below distinguishes the two.
 */
const PROBE_USER_HOME = path.join(path.resolve(REPO_ROOT, "..", ".."), "model-cost-probe-home");

/** The OMP home inside a user home: the segment only this field's `~/` means. */
const OMP_HOME = path.join(PROBE_USER_HOME, ".omp");

/** One resolution, as the extension's configuration entry performs it. */
function resolve(declared: string): string {
	return resolveStorageRoot({
		declared,
		configDirectory: CONFIG_DIRECTORY,
		userHomeDirectory: PROBE_USER_HOME,
	});
}

describe("model-cost storage root", () => {
	test("the shipped default is the user's OMP home, not the user's home", () => {
		expect(resolve(SHIPPED_STORAGE_DIR)).toBe(path.join(OMP_HOME, "cost-archive"));
		// The exception is this field's own: `~` alone would be `<user home>/cost-archive`.
		expect(resolve(SHIPPED_STORAGE_DIR)).not.toBe(path.join(PROBE_USER_HOME, "cost-archive"));
	});

	test("the framework's own read carries the declared value verbatim", () => {
		// The framework reads the shipped file and validates the declared fields; expanding `~/`
		// is this extension's field-local rule, so the framework must hand the value on unchanged.
		const values = readConfig(SHIPPED_CONFIG_FILE, { fields: MODEL_COST.config?.fields });
		expect(values.storageDir).toBe(SHIPPED_STORAGE_DIR);
		// The balance TTL is the extension's other declared field: a whole number of milliseconds the
		// specification's own default states.
		expect(values.balanceTtlMs).toBe(30_000);
		expect(MODEL_COST.config?.fields).toEqual({ storageDir: "non-empty-string", balanceTtlMs: "milliseconds" });
	});

	test("a plain relative value is resolved against the config directory, never the cwd", () => {
		expect(resolve("data/cost-archive")).toBe(path.join(CONFIG_DIRECTORY, "data", "cost-archive"));
		// The process's working directory is what the same value would name if the cwd resolved it.
		expect(resolve("data/cost-archive")).not.toBe(path.join(process.cwd(), "data", "cost-archive"));
	});

	test("an absolute value is used as it was declared", () => {
		const absolute = path.join(path.resolve(REPO_ROOT, ".."), "model-cost-absolute-root");
		expect(resolve(absolute)).toBe(absolute);
	});

	test("the platform's other spelling of the home prefix is the same field-local rule", () => {
		// `~/cost-archive` and `~\cost-archive` are one value with two separators on Windows.
		expect(resolve("~\\cost-archive")).toBe(path.join(OMP_HOME, "cost-archive"));
	});

	test("a bare tilde is not the exception: it is a relative path like any other", () => {
		expect(resolve("~")).toBe(path.resolve(CONFIG_DIRECTORY, "~"));
	});
});
