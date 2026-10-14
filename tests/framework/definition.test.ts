/**
 * The framework's public interface (S2): a declarative extension definition and the
 * OMP adapter that binds it.
 *
 * The seam under test is the interface an extension author uses — `defineExtension`
 * with the configuration types, plus `ompAdapter(definition, options)`.
 * The harness side of that seam is the narrow native surface the loader hands
 * the factory, so a test double stands in for the loader while the definitions under
 * test are built through the same public entry an extension uses.
 */
import { describe, expect, test } from "bun:test";
import * as frameworkOmp from "../../framework/adapters/omp";
import * as frameworkDefinition from "../../framework/public";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";

type OmpExtensionApi = frameworkOmp.OmpExtensionApi;
type BindingResult = frameworkOmp.BindingResult;
type ExtensionDefinition = frameworkDefinition.ExtensionDefinition;

/** The native surface the loader hands the factory, recording what binding did to it. */
interface RecordingApi extends OmpExtensionApi {
	readonly labels: string[];
	readonly commands: string[];
}

function recordingApi(): RecordingApi {
	const labels: string[] = [];
	const commands: string[] = [];
	return {
		labels,
		commands,
		setLabel(label: string): void {
			labels.push(label);
		},
		registerCommand(name: string): void {
			commands.push(name);
		},
		appendEntry(): void {},
		// Session subscriptions are not the subject of this suite.
		on(): void {},
	};
}

/** Runs a synchronous bind while capturing the process's non-model startup channel. */
function withCapturedStderr<T>(run: () => T): { readonly diagnostics: string; readonly value: T } {
	const chunks: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = run();
		return { diagnostics: chunks.join(""), value };
	} finally {
		process.stderr.write = original;
	}
}

/** Binds a definition through the public adapter, recording diagnostics and harness effects. */
function bind(definition: ExtensionDefinition): {
	readonly result: BindingResult;
	readonly diagnostics: string;
	readonly api: RecordingApi;
} {
	const api = recordingApi();
	const { diagnostics, value } = withCapturedStderr(() =>
		frameworkOmp.ompAdapter(definition)(api),
	);
	return { result: value, diagnostics, api };
}

/** The failure kinds of a result, in report order. */
function failureKinds(result: BindingResult): readonly string[] {
	return result.bound ? [] : result.failures.map(failure => failure.kind);
}

/** The configuration conflict classes a result reports. */
function conflictKinds(result: BindingResult): readonly string[] {
	if (result.bound) return [];
	return result.failures.flatMap(failure => (failure.kind === "configuration" ? [failure.violation.kind] : []));
}

/** A definition declaring commands as another control kind, which no authoring type allows. */
function withForeignControlKind(commands: readonly unknown[]): ExtensionDefinition {
	return { id: "future-kind", displayName: "future-kind", commands } as unknown as ExtensionDefinition;
}

describe("declarative extension definition (P1)", () => {
	test("codebase-tools expresses its whole behavior as plain data", () => {
		// The declared values are the migration's fixed identities (decision 06):
		// `id="codebase-tools"`, `displayName="codeBaseTools"`, the default `enabled`
		// State field, one toggle command, two injection slots and the marker text.
		expect(CODEBASE_TOOLS.id).toBe("codebase-tools");
		expect(CODEBASE_TOOLS.displayName).toBe("codeBaseTools");
		// State declares the one axis this extension opts out of the default on: the
		// framework's `enabled` field and `session-entry` persistence stand, and `follow`
		// is what keeps the subagent behavior codebase-tools shipped with.
		expect(CODEBASE_TOOLS.state).toEqual({ inheritance: "follow" });
		expect(CODEBASE_TOOLS.commands).toEqual([
			{
				type: "toggle",
				name: "codebase-tools",
				state: "enabled",
				description: expect.any(String),
			},
		]);
		expect(CODEBASE_TOOLS.prompts?.map(slot => [slot.tag, slot.strategy])).toEqual([
			["init", "first-enabled-run"],
			["reminder", "every-enabled-run"],
		]);
		expect(CODEBASE_TOOLS.marker).toEqual({ text: "◈ codeBaseTools" });
	});
});

describe("OMP adapter binding (P2)", () => {
	test("binding the codebase-tools definition labels the extension", () => {
		const { result, api, diagnostics } = bind(CODEBASE_TOOLS);

		expect(result.bound).toBe(true);
		expect(api.labels).toEqual(["codeBaseTools"]);
		expect(diagnostics).toBe("");
	});
});

describe("public interface surface (P1, P2)", () => {
	test("the OMP entry exposes the assembly function and nothing else at runtime", () => {
		expect(Object.keys(frameworkOmp).sort()).toEqual(["ompAdapter"]);
	});

	test("declaring an extension is plain data: the declaration is handed back unchanged", () => {
		const declaration: ExtensionDefinition = { id: "plain", displayName: "plain" };

		expect(frameworkDefinition.defineExtension(declaration)).toBe(declaration);
	});
});

describe("configuration conflicts (P16, N6)", () => {
	test("two commands under one name are refused with one explicit startup error", () => {
		const conflicting = frameworkDefinition.defineExtension({
			id: "conflicted",
			displayName: "conflicted",
			commands: [
				{ type: "toggle", name: "conflicted", state: "enabled" },
				{ type: "toggle", name: "conflicted", state: "other" },
			],
		});

		const { result, diagnostics, api } = bind(conflicting);

		expect(result.bound).toBe(false);
		expect(failureKinds(result)).toEqual(["configuration"]);
		expect(conflictKinds(result)).toEqual(["duplicate-command"]);
		// One error, on a channel outside model context, naming the extension and the conflict.
		expect(diagnostics.split("\n").filter(line => line.includes("conflicted"))).toHaveLength(1);
		expect(diagnostics).toContain("duplicate-command");
		// Nothing of the refused extension is registered: no command, no contribution,
		// no marker — the label registration is all this adapter would have made.
		expect(api.labels).toEqual([]);
	});

	test("two commands writing one State field are refused with one explicit startup error", () => {
		const conflicting = frameworkDefinition.defineExtension({
			id: "conflicted",
			displayName: "conflicted",
			commands: [
				{ type: "toggle", name: "first", state: "enabled" },
				{ type: "toggle", name: "second", state: "enabled" },
			],
		});

		const { result, diagnostics, api } = bind(conflicting);

		expect(result.bound).toBe(false);
		expect(conflictKinds(result)).toEqual(["duplicate-state-writer"]);
		expect(diagnostics).toContain("duplicate-state-writer");
		expect(api.labels).toEqual([]);
	});

	test("one injection slot under two rules is refused with one explicit startup error", () => {
		const conflicting = frameworkDefinition.defineExtension({
			id: "conflicted",
			displayName: "conflicted",
			prompts: [
				{ tag: "init", strategy: "first-enabled-run", content: "first rule" },
				{ tag: "init", strategy: "every-enabled-run", content: "second rule" },
			],
		});

		const { result, diagnostics, api } = bind(conflicting);

		expect(result.bound).toBe(false);
		expect(conflictKinds(result)).toEqual(["duplicate-slot-rule"]);
		expect(diagnostics).toContain("duplicate-slot-rule");
		expect(api.labels).toEqual([]);
	});

	test("a refused definition does not interrupt the harness: the next binding still succeeds", () => {
		const conflicting = frameworkDefinition.defineExtension({
			id: "conflicted",
			displayName: "conflicted",
			commands: [
				{ type: "toggle", name: "conflicted", state: "enabled" },
				{ type: "toggle", name: "conflicted", state: "other" },
			],
		});

		expect(bind(conflicting).result.bound).toBe(false);

		const healthy = bind(CODEBASE_TOOLS);
		expect(healthy.result.bound).toBe(true);
		expect(healthy.api.labels).toEqual(["codeBaseTools"]);
	});
});

describe("initialization and binding failures (P17, N7)", () => {
	test("a command transitioning a State field the extension does not own is refused before any registration", () => {
		const uninitializable = frameworkDefinition.defineExtension({
			id: "uninitializable",
			displayName: "uninitializable",
			commands: [{ type: "toggle", name: "uninitializable", state: "foreign" }],
		});

		const { result, diagnostics, api } = bind(uninitializable);

		expect(result.bound).toBe(false);
		expect(failureKinds(result)).toEqual(["initialization"]);
		// Exactly one error on the non-model channel, and no harness effect: the
		// refused extension cannot leave a partial registration behind because
		// registration is the step that never ran.
		expect(diagnostics.split("\n").filter(line => line.includes("uninitializable"))).toHaveLength(1);
		expect(api.labels).toEqual([]);
	});

	test("a control kind this version does not bind is refused, not silently dropped", () => {
		// The control-kind union is closed: `mode-selection` is a future additive member,
		// and a definition that declares one now must not bind with the declaration
		// quietly ignored. Only a non-TypeScript caller can get here, hence the cast.
		const futureKind = withForeignControlKind([{ type: "mode-selection", name: "future-kind", state: "enabled" }]);

		const { result, diagnostics, api } = bind(futureKind);

		expect(result.bound).toBe(false);
		expect(failureKinds(result)).toEqual(["initialization"]);
		expect(diagnostics).toContain("mode-selection");
		expect(api.labels).toEqual([]);
	});

	test("a State declaration this version cannot honor is refused, not silently read as a default one", () => {
		// The persistence and inheritance unions are closed: `disk` and `copy` are future
		// additive members, and a definition that declares one now must not bind with the
		// value quietly read as `session-entry` or `none`. Only a non-TypeScript caller can
		// get here, hence the cast.
		const withState = (state: unknown): ExtensionDefinition =>
			({ id: "future-state", displayName: "future-state", state }) as unknown as ExtensionDefinition;

		const unboundPersistence = bind(withState({ persistence: "disk" }));
		const unboundInheritance = bind(withState({ inheritance: "copy" }));
		// A declaration that is not a State object at all is refused too, rather than read
		// as a declaration that declares nothing special.
		const notADeclaration = bind(withState("memory"));

		expect(failureKinds(unboundPersistence.result)).toEqual(["initialization"]);
		expect(unboundPersistence.diagnostics).toContain("disk");
		expect(unboundPersistence.api.labels).toEqual([]);

		expect(failureKinds(unboundInheritance.result)).toEqual(["initialization"]);
		expect(unboundInheritance.diagnostics).toContain("copy");
		expect(unboundInheritance.api.labels).toEqual([]);

		expect(failureKinds(notADeclaration.result)).toEqual(["initialization"]);
		expect(notADeclaration.diagnostics).toContain("not a State declaration");
		expect(notADeclaration.api.labels).toEqual([]);
	});

	test("a harness that refuses registration leaves the extension unbound and keeps nothing", () => {
		const refused: string[] = [];
		const refusingApi: OmpExtensionApi = {
			setLabel(label: string): void {
				refused.push(label);
				throw new Error("harness refused the label");
			},
			registerCommand(): void {},
			appendEntry(): void {},
			on(): void {},
		};
		const factory = frameworkOmp.ompAdapter(CODEBASE_TOOLS);

		const { diagnostics, value: result } = withCapturedStderr(() => factory(refusingApi));

		expect(refused).toEqual(["codeBaseTools"]);
		expect(result.bound).toBe(false);
		expect(failureKinds(result)).toEqual(["initialization"]);
		expect(diagnostics.split("\n").filter(line => line.includes("codebase-tools"))).toHaveLength(1);
		expect(diagnostics).toContain("harness refused the label");
	});

	test("binding keeps no process-level state: one session's failure does not reach the next", () => {
		const factory = frameworkOmp.ompAdapter(CODEBASE_TOOLS);
		const refusingApi: OmpExtensionApi = {
			setLabel(): void {
				throw new Error("harness refused the label");
			},
			registerCommand(): void {},
			appendEntry(): void {},
			on(): void {},
		};

		const failed = withCapturedStderr(() => factory(refusingApi)).value;
		const nextApi = recordingApi();
		const next = factory(nextApi);

		// The same factory binds every session (and every subagent re-binding); a failed
		// session must leave nothing behind, and a successful one must register fully.
		expect(failed.bound).toBe(false);
		expect(next.bound).toBe(true);
		expect(nextApi.labels).toEqual(["codeBaseTools"]);
	});
});
